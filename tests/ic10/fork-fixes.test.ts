/**
 * Regression tests for engine bugs fixed in this fork. The instruction tests can't catch these:
 * they only compare final values, and a rejected argument silently evaluates to 0.
 */
import { describe, expect, test } from "vitest";
import { ErrorSeverity } from "../../src/Ic10/Errors/Errors.ts";
import { Chip, Housing, Ic10Runner, Network, type SuspendRequest, ValidateIc10Runner } from "../../src/index.ts";

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

describe("yield / sleep suspend requests", () => {
	async function realRunner(code: string) {
		const network = new Network();
		const chip = new Chip({ id: 0, ic10Code: code, register_length: 18, stack_length: 512 });
		const runner = new Ic10Runner({ housing: new Housing({ hash: 125, network, chip }) });
		await runner.run(); // sandbox pass
		runner.switchContext("real");
		runner.init();
		return runner;
	}

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
