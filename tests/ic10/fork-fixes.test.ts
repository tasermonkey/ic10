/**
 * Regression tests for engine bugs fixed in this fork. The instruction tests can't catch these:
 * they only compare final values, and a rejected argument silently evaluates to 0.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { ErrorSeverity } from "../../src/Ic10/Errors/Errors.ts";
import {
	Builder,
	Chip,
	Housing,
	Ic10Runner,
	JUMP_LIMIT_ERROR_CODE,
	Network,
	type SuspendRequest,
	ValidateIc10Runner,
} from "../../src/index.ts";

async function strongErrors(code: string): Promise<string[]> {
	const errors = await ValidateIc10Runner.validate(code);
	return errors
		.filter((e) => e.severity === ErrorSeverity.Strong || e.severity === ErrorSeverity.Critical)
		.map((e) => e.message);
}

describe("define", () => {
	test("accepts 0 as a value", async () => {
		expect(await strongErrors("define zero 0\nadd r0 zero 1")).toEqual([]);
	});

	test("still rejects a non-number", async () => {
		expect(await strongErrors("define bad nope")).not.toEqual([]);
	});
});

describe("ld / sd by reference ID", () => {
	test.each([
		["literal", "ld r0 0 Setting"],
		["register", "move r1 0\nld r0 r1 Setting"],
		["aliased register", "alias ref r1\nld r0 ref Setting"],
		["define", "define REF 0\nsd REF Setting 1"],
	])("accepts an ID from a %s", async (_kind, code) => {
		expect(await strongErrors(code)).toEqual([]);
	});

	test("rejects something that is neither a pin nor a number", async () => {
		expect(await strongErrors("ld r0 nope Setting")).not.toEqual([]);
	});
});

/** A runner over a lone housing, after the sandbox pass, switched to the real context. */
async function realRunner(code: string) {
	const network = new Network();
	const chip = new Chip({ id: 0, ic10Code: code, register_length: 18, stack_length: 512 });
	const runner = new Ic10Runner({ housing: new Housing({ hash: 125, network, chip }) });
	await runner.run(); // sandbox pass
	runner.switchContext("real");
	runner.init();
	return runner;
}

/** Step until the chip stops (or `max` steps); returns the number of steps that returned true. */
async function runToStop(runner: Ic10Runner, max = 10_000) {
	let steps = 0;
	while (steps < max && (await runner.step())) steps++;
	return steps;
}

describe("errors never escape step()", () => {
	test("an instruction that throws halts the chip with a critical error on that line", async () => {
		const runner = await realRunner("move r0 1\nld r0 d0 On\nmove r0 2");
		await expect(runToStop(runner)).resolves.toBe(1);

		expect(runner.isStopped()).toBe(true);
		const error = runner.context.criticalError;
		expect(error && error.message).toMatch(/pin/); // "You can't use pin in this instruction"
		expect(error && error.severity).toBe(ErrorSeverity.Critical);
		expect(error && error.line).toBe(1);
		expect(runner.realContext.getRegister(0)).toBe(1); // line 2 never ran
	});

	test("stack overflow halts the chip instead of throwing", async () => {
		const runner = await realRunner("loop:\npush 1\nj loop");
		await expect(runToStop(runner)).resolves.toBeGreaterThan(0);
		expect(runner.isStopped()).toBe(true);
		expect(runner.context.criticalError).not.toBe(false);
	});

	test("non-Error throws (e.g. a bare string) become chip errors too", async () => {
		const runner = await realRunner("move r0 1");
		const line = runner.lines[0] as unknown as { run: () => void };
		line.run = () => {
			throw "boom";
		};
		await expect(runner.step()).resolves.toBe(false);
		const error = runner.context.criticalError;
		expect(error && error.message).toContain("boom");
		expect(error && error.line).toBe(0);
	});

	test("Builder.init() rejects a script whose sandbox pass throws, but accepts an endless loop", async () => {
		const env = (code: string) =>
			Builder.from(
				JSON.stringify({
					version: 1,
					chips: [{ id: 1, code }],
					networks: [{ id: "data", type: "data" }],
					devices: [
						{
							id: 100,
							PrefabName: "StructureCircuitHousing",
							chip: 1,
							ports: [{ port: "default", network: "data" }],
						},
					],
				}),
			);
		await expect(env("ld r0 d0 On").init()).resolves.toBe(false);

		await expect(env("loop:\nyield\nj loop").init()).resolves.toBe(true);
	});

	test("the jump-limit error is identifiable by its code", async () => {
		const runner = await realRunner("loop:\nj loop");
		await runToStop(runner);
		const error = runner.context.criticalError;
		expect(error && error.code).toBe(JUMP_LIMIT_ERROR_CODE);
	});

	test("the error is emitted as error and fatalError, then stop", async () => {
		const runner = await realRunner("ld r0 d0 On");
		const events: string[] = [];
		runner.on("error", () => events.push("error"));
		runner.on("fatalError", () => events.push("fatalError"));
		runner.on("stop", () => events.push("stop"));
		await runner.step();
		expect(events).toEqual(["error", "fatalError", "stop"]);
	});
});

describe("jump-and-link return address", () => {
	test.each([
		["jal", "jal sub"],
		["a branch-and-link", "beqzal r5 sub"],
	])("%s stores the next line in ra, so j ra returns past it", async (_kind, call) => {
		const runner = await realRunner(`${call}\nmove r0 1\nj end\nsub:\nmove r1 ra\nj ra\nend:`);
		await runToStop(runner, 100);
		expect(runner.realContext.getRegister(1)).toBe(1); // ra = the line after the call
		expect(runner.realContext.getRegister(0)).toBe(1); // and execution carried on from there
		expect(runner.context.criticalError).toBe(false);
	});
});

describe("yield / sleep suspend requests", () => {
	async function suspends(code: string, steps: number) {
		const runner = await realRunner(code);
		const out: (SuspendRequest | null)[] = [];
		for (let i = 0; i < steps; i++) {
			await runner.step();
			out.push(runner.suspend);
		}
		return out;
	}

	test("yield reports a yield after its own line only", async () => {
		expect(await suspends("move r0 1\nyield\nmove r0 2", 3)).toEqual([null, { kind: "yield" }, null]);
	});

	test("sleep reports its seconds of game time", async () => {
		expect(await suspends("sleep 5\nmove r1 2\nsleep r1", 3)).toEqual([
			{ kind: "sleep", seconds: 5 },
			null,
			{ kind: "sleep", seconds: 2 },
		]);
	});

	test("sleep 0 (or less) acts as a yield, as in game", async () => {
		expect(await suspends("sleep 0\nsleep -1", 2)).toEqual([{ kind: "yield" }, { kind: "yield" }]);
	});

	test("sleep does not wait in real time", async () => {
		const runner = await realRunner("sleep 3600\nmove r0 1");
		const start = performance.now();
		await runner.step();
		await runner.step();
		expect(performance.now() - start).toBeLessThan(1000);
		expect(runner.realContext.getRegister(0)).toBe(1);
	});

	test("emits a suspend event with the line index", async () => {
		const runner = await realRunner("move r0 1\nyield");
		const events: [SuspendRequest, number][] = [];
		runner.on("suspend", (request, line) => events.push([request, line]));
		await runner.step();
		await runner.step();
		expect(events).toEqual([[{ kind: "yield" }, 1]]);
	});
});

describe("i18n", () => {
	test("messages are English without any setup by the library's user", () => {
		// A fresh process: tests/setup.ts initialises i18n for this one, which would hide the problem.
		const out = execFileSync(
			process.execPath,
			[
				"--input-type=module",
				"-e",
				'import i18n from "./src/Languages/lang.ts"; console.log(i18n.t("error.pin_not_allowed_in_instruction"));',
			],
			{ cwd: join(import.meta.dirname, "..", ".."), encoding: "utf8" },
		);
		expect(out.trim()).toBe("You can't use pin in this instruction");
	});
});
