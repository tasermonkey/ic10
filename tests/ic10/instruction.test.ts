import { Random } from "@stationeers-ic/exact-ic10-math";
import { describe, expect, test } from "vitest";
import { Ic10Error } from "../../src/Ic10/Errors/Errors.ts";
import type { InstructionTestData } from "../../src/Ic10/Instruction/Helpers/Instruction.ts";
import { instructions } from "../../src/Ic10/Instruction/index.ts";
import { createRunner, expectExpectation, type InstructionLike, runInstructionTest } from "../helpers.ts";

describe("Check every instruction", () => {
	// Collect all tests synchronously
	const testCases: [string, InstructionLike, InstructionTestData][] = [];

	Object.entries(instructions).forEach(([key, instruction]) => {
		if (!instruction) return;

		const instr = instruction as InstructionLike;
		const tests = instr.tests?.();
		if (!tests || tests.length === 0) return;

		tests.forEach((testData, index) => {
			testCases.push([`${key} ${testData?.title ?? `#${index}`}`, instr, testData]);
		});
	});

	// Run the tests sequentially
	for (const [testName, _instruction, testData] of testCases) {
		test(testName, async () => {
			Random.resetGlobalRandom(0);
			// console.time(`🚀 Running test: ${testName}`);
			// Previous tests used a register length of 18 — keep that behavior
			const runner = createRunner(testData.code, { register_length: 18 });
			try {
				await runInstructionTest(runner, testData);
			} catch (e) {
				if (e instanceof Ic10Error) {
					console.error(e.message);
				} else {
					console.error(e);
				}
				// Rethrow so this test fails on its own. (It used to call process.exit(), which ended the
				// whole run early and hid every later test.)
				throw e;
			}
			// Unified checks
			for (const exp of testData.expected) {
				expectExpectation(runner, exp, expect);
			}
			// console.timeEnd(`🚀 Running test: ${testName}`);
		});
	}
});
