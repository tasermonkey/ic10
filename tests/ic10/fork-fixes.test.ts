/**
 * Regression tests for engine bugs fixed in this fork. The instruction tests can't catch these:
 * they only compare final values, and a rejected argument silently evaluates to 0.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { ErrorSeverity } from "../../src/Ic10/Errors/Errors.ts";
import {
	Builder,
	Chip,
	type Device,
	Housing,
	Ic10Runner,
	ItemEntity,
	JUMP_LIMIT_ERROR_CODE,
	Network,
	type PropsHooks,
	Reagents,
	StructureAutolathe,
	StructureFurnace,
	StructureGasSensor,
	StructureLarreDockHydroponics,
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

/** As {@link realRunner}, with `device` on the housing's network and on d0. */
async function runnerWith(code: string, device: (network: Network) => Device) {
	const network = new Network();
	const chip = new Chip({ id: 0, ic10Code: code, register_length: 18, stack_length: 512 });
	const housing = new Housing({ hash: 125, network, chip });
	housing.connectDevices(0, device(network));
	const runner = new Ic10Runner({ housing });
	await runner.run(); // sandbox pass
	runner.switchContext("real");
	runner.init();
	return runner;
}

const strong = (runner: Ic10Runner) => runner.context.errors.filter((e) => e.severity === ErrorSeverity.Strong);

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

describe("an argument that can't be used stops the instruction", () => {
	test.each([
		["a destination that isn't a register", "move Nope 7"],
		["a destination that isn't a register, with sources", "move r5 2\nadd Nope r5 1"],
		["a source that isn't a number or register", "move r0 nope"],
		["an unknown logic type", "l r0 db Nope"],
	])("%s leaves r0 alone and records a strong error", async (_kind, code) => {
		const runner = await realRunner(`move r0 5\n${code}\nmove r1 1`);
		await runToStop(runner);
		expect(runner.realContext.getRegister(0)).toBe(5);
		expect(strong(runner)).toHaveLength(1);
		expect(runner.realContext.getRegister(1)).toBe(1); // the line ended as usual (the harness halts the chip)
	});

	test("the sandbox pass reports every such line", async () => {
		expect(await strongErrors("move Nope 1\nadd Bad r0 1\nmove r0 2")).toHaveLength(2);
	});
});

describe("bdnvl / bdnvs", () => {
	// They took the logic type as a plain number (so a name became 0) and branched when the device WAS
	// valid; between the two, `bdnvl db Setting` happened to look right.
	test("branch when the device is NOT valid for that logic type, given by name", async () => {
		// A gas sensor's logic types are all read-only, and it has no Setting; an autolathe can write On.
		const sensor = (network: Network) => new StructureGasSensor({ id: 7, network });
		const lathe = (network: Network) => new StructureAutolathe({ id: 7, network });
		const branches = async (line: string, device: (network: Network) => Device) => {
			const runner = await runnerWith(`${line}\nmove r0 1\nj 4\nmove r0 2`, device);
			await runToStop(runner, 5);
			return runner.realContext.getRegister(0) === 2;
		};
		expect(await branches("bdnvl d0 Temperature 3", sensor)).toBe(false);
		expect(await branches("bdnvl d0 Setting 3", sensor)).toBe(true);
		expect(await branches("bdnvs d0 Temperature 3", sensor)).toBe(true);
		expect(await branches("bdnvs d0 On 3", lathe)).toBe(false);
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

describe("batch reads with no matching device", () => {
	const SENSOR = 'HASH("StructureGasSensor")';
	test.each([
		["lb", `lb r0 ${SENSOR} Temperature Average`],
		["lbn", `lbn r0 ${SENSOR} HASH("Outside") Temperature Average`],
	])("%s Average is NaN, as 0 / 0 is in game", async (_kind, code) => {
		const runner = await realRunner(code);
		await runToStop(runner, 10);
		expect(runner.realContext.getRegister(0)).toBeNaN();
	});

	test.each([
		["Sum", 0],
		["Minimum", 0],
		["Maximum", Number.NEGATIVE_INFINITY],
	])("%s is %d", async (mode, expected) => {
		const runner = await realRunner(`move r0 5\nlb r0 ${SENSOR} Temperature ${mode}`);
		await runToStop(runner, 10);
		expect(runner.realContext.getRegister(0)).toBe(expected);
	});
});

describe("device-set tests on an empty pin", () => {
	// The lone housing in realRunner has nothing on any pin.
	test.each([
		["bdns", "bdns d1 set\nmove r0 2\nj end\nset:\nmove r0 1\nend:"],
		["bdns via dr", "move r1 1\nbdns dr1 set\nmove r0 2\nj end\nset:\nmove r0 1\nend:"],
		["brdns", "brdns d1 3\nmove r0 2\nj end\nmove r0 1\nend:"],
		["bdnsal", "bdnsal d1 set\nj end\nset:\nmove r0 1\nend:"],
		["sdns", "sdns r0 d1"],
	])("%s sees the pin as not set, without an error", async (_kind, code) => {
		const runner = await realRunner(code);
		await runToStop(runner, 20);
		expect(runner.realContext.getRegister(0)).toBe(1);
		expect(runner.context.errors.filter((e) => e.severity === ErrorSeverity.Strong)).toEqual([]);
	});

	test.each([
		["bdse", "bdse d1 set\nmove r0 1\nj end\nset:\nmove r0 2\nend:"],
		["sdse", "sdse r0 d1\nseqz r0 r0"],
	])("%s doesn't branch or set, without an error", async (_kind, code) => {
		const runner = await realRunner(code);
		await runToStop(runner, 20);
		expect(runner.realContext.getRegister(0)).toBe(1);
		expect(runner.context.errors.filter((e) => e.severity === ErrorSeverity.Strong)).toEqual([]);
	});

	test("l on an empty pin is still an error", async () => {
		const runner = await realRunner("l r0 d1 On");
		await runToStop(runner, 5);
		expect(runner.context.errors.some((e) => e.severity === ErrorSeverity.Strong)).toBe(true);
	});
});

describe("slots the game data lists no logic types for", () => {
	test("the Larre's Target Slot (255) reads the plant at the arm", () => {
		const larre = new StructureLarreDockHydroponics({ id: 1 });
		const plant = new ItemEntity(1234);
		plant.setProp("Mature", 1);
		plant.setProp("Seeding", -1);
		larre.slots!.getSlot(255)!.putItem(plant);
		expect(larre.slots!.getSlot(255)!.getProp("Mature")).toBe(1);
		expect(larre.slots!.getSlot(255)!.getProp("Seeding")).toBe(-1);
	});

	test("a slot that lists its logic types still reads only those", () => {
		const larre = new StructureLarreDockHydroponics({ id: 1 });
		const item = new ItemEntity(1234);
		item.setProp("Mature", 1);
		larre.slots!.getSlot(0)!.putItem(item);
		expect(larre.slots!.getSlot(0)!.getProp("Mature")).toBe(0); // the Arm Slot doesn't list Mature
		expect(larre.slots!.getSlot(0)!.getProp("Quantity")).toBe(1);
	});
});

describe("reading a logic type the device can't read", () => {
	// In game l, ld and lb throw IncorrectLogicType and the chip halts.
	const sensor = (network: Network) => new StructureGasSensor({ id: 7, network });
	const autolathe = (network: Network) => new StructureAutolathe({ id: 7, network });

	test.each([
		["l of a logic type it lacks", "l r0 d0 Setting", sensor],
		["ld of a logic type it lacks", "ld r0 7 Setting", sensor],
		["lb when a matching device lacks it", 'lb r0 HASH("StructureGasSensor") Setting Sum', sensor],
		["l of a write-only logic type", "l r0 d0 ClearMemory", autolathe],
	])("%s is a strong error", async (_kind, code, device) => {
		const runner = await runnerWith(code, device);
		await runToStop(runner, 5);
		expect(strong(runner)).not.toEqual([]);
	});

	test.each([
		["l of a readable logic type", "l r0 d0 Temperature", sensor],
		["s of a write-only logic type", "s d0 ClearMemory 1", autolathe],
	])("%s is not", async (_kind, code, device) => {
		const runner = await runnerWith(code, device);
		await runToStop(runner, 5);
		expect(strong(runner)).toEqual([]);
	});
});

describe("props hooks", () => {
	function hooked(network: Network, calls: unknown[][]) {
		const device = new StructureGasSensor({ id: 7, network });
		const hooks: PropsHooks = {
			canLoad: (prop) => prop !== 1, // logic type 1 (Power) is "missing"
			canStore: () => true,
			read: (prop) => {
				calls.push(["read", prop]);
				return 42;
			},
			write: (prop, value) => {
				calls.push(["write", prop, value]);
			},
		};
		device.props!.hooks = hooks;
		device.props!.forceWrite("Temperature", 300);
		return device;
	}

	test("l, ld and lb read through the hooks", async () => {
		const calls: unknown[][] = [];
		const runner = await runnerWith(
			'l r0 d0 Temperature\nld r1 7 Temperature\nlb r2 HASH("StructureGasSensor") Temperature Sum',
			(network) => hooked(network, calls),
		);
		await runToStop(runner, 5);
		expect([0, 1, 2].map((r) => runner.realContext.getRegister(r))).toEqual([42, 42, 42]);
		expect(calls).toHaveLength(3);
	});

	test("s writes through the hooks, even a logic type the device itself lacks", async () => {
		const calls: unknown[][] = [];
		const runner = await runnerWith("s d0 Setting 5", (network) => hooked(network, calls));
		await runToStop(runner, 5);
		expect(calls.filter((c) => c[0] === "write")).toEqual([["write", 12, 5]]); // Setting is 12
		expect(strong(runner)).toEqual([]);
	});

	test("bdnvl asks the hooks whether the logic type can be read", async () => {
		const runner = await runnerWith("bdnvl d0 Power 3\nmove r0 1\nj 4\nmove r0 2", (network) => hooked(network, []));
		await runToStop(runner, 5);
		expect(runner.realContext.getRegister(0)).toBe(2);
	});

	test("forceRead still sees the device's own values", () => {
		const device = hooked(new Network(), []);
		expect(device.props!.forceRead("Temperature")).toBe(300);
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

/** The housing's stack pointer is r16 (sp) with the default register_length of 18. */
const SP = 16;

describe("stack and device memory follow the game (G24, G25)", () => {
	test.each([
		["pop on an empty stack", "StackUnderFlow", -1, "pop r0"],
		["peek on an empty stack", "StackUnderFlow", 0, "peek r0"],
		["poke below 0", "StackUnderFlow", 0, "poke -1 1"],
		["poke past the end", "StackOverFlow", 0, "poke 600 1"],
		["get below 0", "StackUnderFlow", 0, "get r0 db -1"],
	])("%s halts with %s and leaves sp at %i", async (_kind, message, sp, code) => {
		const runner = await realRunner(code);
		await runToStop(runner);
		expect(runner.isStopped()).toBe(true);
		expect(runner.context.criticalError && runner.context.criticalError.message).toContain(message);
		expect(runner.realContext.getRegister(SP)).toBe(sp);
	});

	test("a stack error says the game retries the line instead of halting", async () => {
		const runner = await realRunner("pop r0");
		await runToStop(runner);
		expect(runner.context.criticalError && runner.context.criticalError.message).toMatch(
			/fork: halts here\. In game the chip keeps retrying this line/,
		);
	});

	test("pop lowers sp before the underflow, as in the game", async () => {
		const runner = await realRunner("pop r0");
		await runToStop(runner);
		expect(runner.realContext.getRegister(SP)).toBe(-1);
		expect(runner.realContext.getRegister(0)).toBe(0);
	});

	test("a full stack overflows at 512 and sp stays at 512", async () => {
		const runner = await realRunner("loop:\npush 1\nj loop");
		await runToStop(runner);
		expect(runner.context.criticalError && runner.context.criticalError.message).toContain("StackOverFlow");
		expect(runner.realContext.getRegister(SP)).toBe(512);
	});

	test("peek and pop still read the top entry on a stack that has one", async () => {
		const runner = await realRunner("push 7\npeek r0\npop r1");
		await runToStop(runner);
		expect(runner.context.criticalError).toBe(false);
		expect(runner.realContext.getRegister(0)).toBe(7);
		expect(runner.realContext.getRegister(1)).toBe(7);
	});

	test("get from a device without memory halts with MemoryNotReadable and writes nothing", async () => {
		const runner = await runnerWith("move r0 42\nget r0 d0 0", (network) => new StructureGasSensor({ id: 7, network }));
		await runToStop(runner);
		expect(runner.context.criticalError && runner.context.criticalError.message).toBe("MemoryNotReadable");
		expect(runner.realContext.getRegister(0)).toBe(42);
	});

	test("put to a device without memory halts with MemoryNotWriteable", async () => {
		const runner = await runnerWith("put d0 0 1", (network) => new StructureGasSensor({ id: 7, network }));
		await runToStop(runner);
		expect(runner.context.criticalError && runner.context.criticalError.message).toBe("MemoryNotWriteable");
	});

	test("clr on a device without memory halts with MemoryNotReadable", async () => {
		const runner = await runnerWith("clr d0", (network) => new StructureGasSensor({ id: 7, network }));
		await runToStop(runner);
		expect(runner.context.criticalError && runner.context.criticalError.message).toBe("MemoryNotReadable");
	});
});

/** Runs `code` to its stop (or 100 steps) on the real context. */
async function runCode(code: string) {
	const runner = await realRunner(code);
	await runToStop(runner, 100);
	return runner;
}

/** The game rounds rotates and wide bit fields a few units off the exact value above about 2^40 (G28). */
const GAME_ROUNDING = 8;

describe("ext / ins bit fields and rotates follow the game (G27, G28)", () => {
	test("ext reads the wiki's example, and offset 0 is allowed", async () => {
		expect((await runCode("move r0 $DEADBEEF\next r1 r0 8 16")).realContext.getRegister(1)).toBe(0xadbe);
		expect((await runCode("ext r1 255 0 4")).realContext.getRegister(1)).toBe(15);
	});

	test("ins writes the wiki's example into the register's current value", async () => {
		const runner = await runCode("move r0 $DE0000EF\nmove r1 $ADBE\nins r0 r1 8 16");
		expect(runner.realContext.getRegister(0)).toBe(0xdeadbeef);
		expect(runner.context.errors.filter((e) => e.severity === ErrorSeverity.Strong)).toEqual([]);
	});

	test.each([
		["ext, length 0", "ext r1 255 4 0", "ShiftUnderflow"],
		["ext, offset 53", "ext r1 255 53 1", "ShiftOverflow"],
		["ext, length 60", "ext r1 255 4 60", "PayloadOverflow"],
		["ins, length 0", "ins r1 5 4 0", "ShiftUnderflow"],
		["ins, offset + length 54", "ins r1 1 51 3", "PayloadOverflow"],
	])("%s records %s and leaves the register alone", async (_kind, line, name) => {
		const runner = await runCode(`move r1 9\n${line}\nmove r2 1`);
		expect(runner.context.errors.filter((e) => e.severity === ErrorSeverity.Strong).map((e) => e.message)).toEqual([
			name,
		]);
		expect(runner.realContext.getRegister(1)).toBe(9);
	});

	test("ins writes a field at bit 50 (within the game's rounding)", async () => {
		const runner = await runCode("move r1 0\nins r1 1 50 3");
		expect(Math.abs(runner.realContext.getRegister(1) - 2 ** 50)).toBeLessThanOrEqual(GAME_ROUNDING);
	});

	test("rol rotates the 54-bit signed value, so bit 53 is the sign", async () => {
		expect((await runCode("rol r0 1 31")).realContext.getRegister(0)).toBe(2 ** 31);
		expect((await runCode("rol r0 1 40")).realContext.getRegister(0)).toBe(2 ** 40);
		expect((await runCode("rol r0 1 54")).realContext.getRegister(0)).toBe(1);
		expect((await runCode("rol r0 1 55")).realContext.getRegister(0)).toBe(2);
		expect((await runCode("rol r0 1 63")).realContext.getRegister(0)).toBe(512);
		expect(Math.abs((await runCode("rol r0 1 53")).realContext.getRegister(0) + 2 ** 53)).toBeLessThanOrEqual(
			GAME_ROUNDING,
		);
	});

	test("ror rotates right, and the count wraps modulo 54", async () => {
		expect((await runCode("ror r0 1 1")).realContext.getRegister(0)).toBe(-(2 ** 53));
		expect(Math.abs((await runCode("ror r0 1 2")).realContext.getRegister(0) - 2 ** 52)).toBeLessThanOrEqual(
			GAME_ROUNDING,
		);
		expect((await runCode("ror r0 1 55")).realContext.getRegister(0)).toBe(-(2 ** 53));
	});
});

describe("labels, jumps, numbers and -Infinity follow the game (G30-G33, G35)", () => {
	test("-Infinity keeps its sign through a register copy (G30)", async () => {
		const runner = await runCode("move r0 ninf\nmove r1 r0");
		expect(runner.realContext.getRegister(1)).toBe(-Infinity);
	});

	test("jr -2 at line index 4 lands on index 2 (G31)", async () => {
		// Steps 1-4 run lines 0-3; step 5 is the jr; step 6 is the line it lands on (index 2, which writes 2).
		const runner = await realRunner("move r7 0\nmove r7 1\nmove r7 2\nmove r7 3\njr -2\nmove r9 1");
		await runToStop(runner, 6);
		expect(runner.realContext.getRegister(7)).toBe(2);
	});

	test("jr with a bad argument records a strong error and does not re-run its line (G31)", async () => {
		// In game `jr Nope` halts with IncorrectVariable at that line (2026-10-12). The fork used to re-run it forever.
		const runner = await runCode("jr Nope\nmove r7 5");
		expect(strong(runner)).toHaveLength(1);
		expect(runner.realContext.getRegister(7)).toBe(5);
	});

	test("a jump to its own line spins on it (G32)", async () => {
		const runner = await realRunner("move r0 0\nj 1\nmove r0 1");
		await runToStop(runner, 10);
		expect(runner.realContext.getRegister(0)).toBe(0);
		expect(runner.realContext.getNextLineIndex()).toBe(1);
	});

	test("a branch to its own line spins on it (G32)", async () => {
		const runner = await realRunner("move r0 0\nbeqz r0 1\nmove r1 1");
		await runToStop(runner, 10);
		expect(runner.realContext.getRegister(1)).toBe(0);
		expect(runner.realContext.getNextLineIndex()).toBe(1);
	});

	// The game raises IncorrectVariable for each of these (in game: $ZZ, %2 and 12abc, 2026-10-12).
	test.each(["$ZZ", "%2", "12abc"])("a malformed number (%s) is an error and is not written (G33)", async (literal) => {
		const runner = await runCode(`move r0 7\nmove r0 ${literal}\nmove r1 5`);
		expect(strong(runner)).toHaveLength(1);
		expect(runner.realContext.getRegister(0)).toBe(7);
		expect(await strongErrors(`move r0 ${literal}`)).not.toEqual([]);
	});

	test("a label with an instruction on the same line refuses the whole script (G35)", async () => {
		// The game refuses the script to compile (UnrecognisedInstruction), so no line runs, not even the later move.
		const runner = await runCode("top: add r0 r0 1\nmove r1 1");
		expect(runner.context.criticalError && runner.context.criticalError.code).toBe("UnrecognisedInstruction");
		expect(runner.realContext.getRegister(0)).toBe(0);
		expect(runner.realContext.getRegister(1)).toBe(0);
	});
});

describe("tolerance forms take b, and NaN is never 'not equal' (G21, G22)", () => {
	test("sapz and snaz take the b operand, and the game's answers hold", async () => {
		const runner = await runCode("sapz r1 5 1\nsapz r2 5 0.1\nsnaz r3 5 0.1");
		expect(strong(runner)).toEqual([]);
		expect(runner.realContext.getRegister(1)).toBe(1);
		expect(runner.realContext.getRegister(2)).toBe(0);
		expect(runner.realContext.getRegister(3)).toBe(1);
	});

	test("bapz takes a, b and the line, and branches when the wiki's test holds", async () => {
		const branched = await runCode("bapz 5 1 3\nmove r0 1\nj 4\nmove r0 2");
		expect(branched.realContext.getRegister(0)).toBe(2);
		const fell = await runCode("bapz 5 0.1 3\nmove r0 1\nj 4\nmove r0 2");
		expect(fell.realContext.getRegister(0)).toBe(1);
	});

	test("sna gives 0 for a NaN operand, as the game does", async () => {
		const runner = await runCode("sna r1 nan 1 0.1");
		expect(runner.realContext.getRegister(1)).toBe(0);
	});

	test("bna does not branch on a NaN operand", async () => {
		const runner = await runCode("bna nan 1 0.1 3\nmove r0 1\nj 4\nmove r0 2");
		expect(runner.realContext.getRegister(0)).toBe(1);
	});
});

describe("get, put, bdnvl and bdnvs take a register holding an ID (G23)", () => {
	// A gas sensor on d0 with ID 7; r5 holds that ID, so the register names the sensor. (`l ReferenceId`
	// reads 0 for a sensor in the fork, so the ID is set by hand.)
	const sensor = (network: Network) => new StructureGasSensor({ id: 7, network });

	test("get reaches the device the register names (a sensor has no memory, so MemoryNotReadable)", async () => {
		const runner = await runnerWith("move r5 7\nget r1 r5 0", sensor);
		await runToStop(runner);
		expect(runner.context.criticalError && runner.context.criticalError.message).toBe("MemoryNotReadable");
	});

	test("put reaches the device the register names (MemoryNotWriteable)", async () => {
		const runner = await runnerWith("move r5 7\nput r5 0 1", sensor);
		await runToStop(runner);
		expect(runner.context.criticalError && runner.context.criticalError.message).toBe("MemoryNotWriteable");
	});

	test("bdnvl and bdnvs test the device the register names, as they do a pin", async () => {
		// The sensor can load Temperature (no branch) and has no Setting (branch).
		const bdnvl = async (line: string) => {
			const runner = await runnerWith(`move r5 7\n${line}\nmove r0 1\nj 5\nmove r0 2`, sensor);
			await runToStop(runner, 10);
			return runner.realContext.getRegister(0);
		};
		expect(await bdnvl("bdnvl r5 Temperature 4")).toBe(1);
		expect(await bdnvl("bdnvl r5 Setting 4")).toBe(2);
		expect(await bdnvl("bdnvs r5 Temperature 4")).toBe(2);
	});
});

describe("hcf, ss, rmap (G34 and G26)", () => {
	test("hcf halts the chip, so the next line never runs (G34)", async () => {
		const runner = await realRunner("move r0 1\nhcf\nmove r0 2");
		await runToStop(runner);
		expect(runner.isStopped()).toBe(true);
		expect(runner.context.criticalError && runner.context.criticalError.message).toBe("hcf");
		expect(runner.realContext.getRegister(0)).toBe(1);
	});

	test("ss with a channel on a pin records the error and writes nothing (G34)", async () => {
		const runner = await runnerWith("ss d0:1 0 Occupied 1", (network) => new StructureGasSensor({ id: 7, network }));
		const write = vi.spyOn(runner.realContext, "setDeviceSlotParameterByPin");
		await runToStop(runner);
		expect(strong(runner)).toHaveLength(1);
		expect(write).not.toHaveBeenCalled();
	});

	test("rmap writes the item a reagent maps to, and 0 for a hash with no reagent (G26)", async () => {
		const copper = Reagents.getByValue("Copper")!;
		const runner = await runnerWith(
			`rmap r0 d0 ${copper}\nrmap r1 d0 0`,
			(network) => new StructureGasSensor({ id: 7, network }),
		);
		await runToStop(runner);
		expect(runner.context.criticalError).toBe(false);
		expect(runner.realContext.getRegister(0)).not.toBe(0);
		expect(runner.realContext.getRegister(1)).toBe(0);
	});
});

describe("lr Recipe and Required follow the game (G26)", () => {
	// In game (2026-10-12): an Autolathe set to the EVA suit (1677018918: Iron 5, Copper 5), empty, then with 2
	// iron, then with 8; and a Furnace and an Advanced Furnace, which raise IncorrectReagentDevice.
	const IRON = Reagents.getByValue("Iron")!;
	const lathe = (iron: number) => (network: Network) => {
		const device = new StructureAutolathe({ id: 7, network });
		if (iron) device.reagents!.set(IRON, iron);
		return device;
	};
	const code = [
		"s d0 RecipeHash 1677018918",
		'lr r0 d0 Recipe HASH("Iron")',
		'lr r1 d0 Recipe HASH("Copper")',
		'lr r2 d0 Recipe HASH("Gold")',
		'lr r3 d0 Required HASH("Iron")',
		'lr r5 d0 Contents HASH("Iron")',
	].join("\n");
	const registers = async (iron: number) => {
		const runner = await runnerWith(code, lathe(iron));
		await runToStop(runner);
		expect(runner.context.criticalError).toBe(false);
		return [0, 1, 2, 3, 5].map((r) => runner.realContext.getRegister(r));
	};

	test("Recipe reads the selected recipe; a reagent it doesn't use reads 0", async () => {
		expect(await registers(0)).toEqual([5, 5, 0, 5, 0]);
	});

	test("Required is what the recipe still lacks", async () => {
		expect(await registers(2)).toEqual([5, 5, 0, 3, 2]);
	});

	test("Required is 0, not negative, when the device holds more than the recipe takes", async () => {
		expect(await registers(8)).toEqual([5, 5, 0, 0, 8]);
	});

	test("a device that isn't a fabricator raises IncorrectReagentDevice and writes nothing", async () => {
		const runner = await runnerWith(
			'move r7 -1\nlr r7 d0 Recipe HASH("Iron")',
			(network) => new StructureFurnace({ id: 7, network }),
		);
		await runToStop(runner);
		expect(runner.context.criticalError && runner.context.criticalError.message).toBe("IncorrectReagentDevice");
		expect(runner.realContext.getRegister(7)).toBe(-1);
	});
});

describe("slot reads of a device with no slots halt, as in the game's code (G34)", () => {
	// From the game's DLL (ProgrammableChip, 2026-10-12): a device that can't read the slot halts the chip before
	// the register is written. ls raises IncorrectLogicType; lbs and lbns IncorrectLogicSlotType. A gas sensor has no slots.
	const SENSOR = 'HASH("StructureGasSensor")';
	test.each([
		["ls", "ls r0 d0 0 Occupied", "IncorrectLogicType"],
		["lbs", `lbs r0 ${SENSOR} 0 Occupied Sum`, "IncorrectLogicSlotType"],
		["lbns", `lbns r0 ${SENSOR} ${SENSOR} 0 Occupied Sum`, "IncorrectLogicSlotType"],
	])("%s halts with %s and leaves the register alone", async (_kind, line, name) => {
		const runner = await runnerWith(`move r0 7\n${line}`, (network) => new StructureGasSensor({ id: 7, network }));
		await runToStop(runner);
		expect(runner.context.criticalError && runner.context.criticalError.message).toBe(name);
		expect(runner.realContext.getRegister(0)).toBe(7);
	});
});

describe("define is set when the script compiles, as in the game's code (G34)", () => {
	test("a define can be used above its own line", async () => {
		const runner = await runCode("move r0 FOO\ndefine FOO 5");
		expect(runner.context.errors).toEqual([]);
		expect(runner.realContext.getRegister(0)).toBe(5);
	});

	test("running the define line again (a loop) records nothing", async () => {
		const runner = await realRunner("define FOO 5\nadd r0 r0 FOO\nj 0");
		await runToStop(runner, 30);
		expect(runner.context.errors).toEqual([]);
		expect(runner.realContext.getRegister(0)).toBe(50);
	});

	test("defining the same name twice refuses the whole script (ExtraDefine)", async () => {
		// The game's _DEFINE_Operation throws ExtraDefine at compile time, so no line runs.
		const runner = await runCode("move r0 1\ndefine FOO 5\ndefine FOO 6");
		expect(runner.context.criticalError && runner.context.criticalError.code).toBe("ExtraDefine");
		expect(runner.realContext.getRegister(0)).toBe(0);
	});

	test("defining a built-in constant's name once is not an ExtraDefine", async () => {
		const runner = await runCode("define pi 3\nmove r0 pi");
		expect(runner.context.criticalError).toBe(false);
		expect(runner.realContext.getRegister(0)).toBe(3);
	});
});
