import { describe, expect, test } from "vitest";
import { ValidateIc10Runner } from "../../src/index.ts";

describe("Errors", async () => {
	test("syntax", async () => {
		const errors = await ValidateIc10Runner.validate(["move r0"].join("\n"));
		expect(Array.isArray(errors)).toBe(true);
		expect(errors).toHaveLength(1);
		expect(errors).toMatchSnapshot();
	});
});
