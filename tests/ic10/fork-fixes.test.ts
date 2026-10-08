/**
 * Regression tests for engine bugs fixed in this fork. The instruction tests can't catch these:
 * they only compare final values, and a rejected argument silently evaluates to 0.
 */
import { describe, expect, test } from "vitest";
import { ErrorSeverity } from "../../src/Ic10/Errors/Errors.ts";
import { ValidateIc10Runner } from "../../src/index.ts";

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
