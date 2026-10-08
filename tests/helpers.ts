import { Chip } from "../src/Core/Chip.ts";
import { Network } from "../src/Core/Network.ts";
import { Ic10Runner } from "../src/Ic10/Ic10Runner.ts";
import type { InstructionTestData, InstructionTestExpected } from "../src/Ic10/Instruction/Helpers/Instruction.ts";
import { Ic10Error, StructureCircuitHousing } from "../src/index.ts";

export type CreateRunnerOptions = {
	register_length: number;
	stack_length: number;
	hash: number;
	network?: Network;
};

export function createRunner(ic10Code: string | string[], options?: Partial<CreateRunnerOptions>): Ic10Runner {
	const network = options?.network ?? new Network();
	if (Array.isArray(ic10Code)) {
		ic10Code = ic10Code.join("\n");
	}
	const chip = new Chip({
		id: 0,
		ic10Code,
		register_length: options?.register_length ?? 18,
		stack_length: options?.stack_length ?? 512,
	});
	const socket = new StructureCircuitHousing({
		network,
		chip,
	});
	socket.id = 0;
	return new Ic10Runner({ housing: socket });
}

export async function runInstructionTest(runner: Ic10Runner, testData: InstructionTestData) {
	if (testData.devices !== undefined) {
		for (const device of testData.devices) {
			runner.realContext.network.apply(device.device);
			if (typeof device.pin !== "undefined") {
				runner.realContext.housing.connectDevices(device.pin, device.device);
			}
		}
	}
	await runner.run(); // sandbox
	runner.switchContext("real");
	if (testData.iterations_count) {
		for (let i = 0; i < testData.iterations_count; i++) {
			await runner.step();
		}
	} else {
		await runner.run();
	}
	runner.contextSwitcher.getErrors().forEach((err) => {
		if (err instanceof Ic10Error) {
			console.log("🟥", err.formated_message);
		}
	});
	return runner;
}

export async function runDualContext(runner: Ic10Runner) {
	await runner.run(); // sandbox
	await runner.switchContext().run(); // production environment
	return runner;
}

export type InstructionLike = {
	tests?: () => InstructionTestData[] | undefined;
};

/** Internal utility for getting the actual value and the expectation description */
export function resolveExpectation(
	runner: Ic10Runner,
	exp: InstructionTestExpected,
): { label: string; expected: number; got: number } {
	switch (exp.type) {
		case "register": {
			const got = runner.realContext.chip.registers.get(exp.register) ?? 0;
			return { label: `r${exp.register}`, expected: exp.value, got };
		}
		case "device": {
			const got = runner.realContext.getDeviceParameterByPin(exp.pin, exp.prop);
			return {
				label: `pin ${exp.pin}.${String(exp.prop)}`,
				expected: exp.value,
				got,
			};
		}
		case "loop": {
			const got = runner.realContext.getNextLineIndex();
			return { label: "nextLineIndex", expected: exp.nextLineIndex, got };
		}
		case "stack": {
			const got = runner.realContext.stack().get(exp.index);
			return { label: `get db ${exp.index}`, expected: exp.value, got };
		}
	}
}

/** Log the expectation result (for CLI scripts) */
export function logExpectation(runner: Ic10Runner, exp: InstructionTestExpected) {
	const { label, expected, got } = resolveExpectation(runner, exp);
	console.log(`exp ${label} = ${expected} | got ${got}`);
}

/** Check the expectation via expect (for tests) */
export function expectExpectation(
	runner: Ic10Runner,
	exp: InstructionTestExpected,
	expectImpl: (val: any) => { toBe: (v: any) => void },
) {
	const { expected, got } = resolveExpectation(runner, exp);
	expectImpl(got).toBe(expected);
}

/** Check all expectations */
export function expectAll(
	runner: Ic10Runner,
	expectedList: InstructionTestExpected[],
	expectImpl: (val: any) => { toBe: (v: any) => void },
) {
	for (const exp of expectedList) {
		expectExpectation(runner, exp, expectImpl);
	}
}

/** Log all expectations */
export function logAll(runner: Ic10Runner, expectedList: InstructionTestExpected[]) {
	for (const exp of expectedList) {
		logExpectation(runner, exp);
	}
}
