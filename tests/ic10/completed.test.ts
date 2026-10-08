import { describe, expect, test } from "vitest";
import INSTRUCTIONS from "../../src/Defines/instructions.ts";
import { instructions } from "../../src/Ic10/Instruction/index.ts";

describe("Completed", () => {
	test("Percentage of implemented instructions", () => {
		const implemented = Object.keys(instructions);
		const required = Object.keys(INSTRUCTIONS).filter((i) => i !== "label");

		// Find extra instructions (implemented but not required)
		const extraInstructions = implemented.filter((i) => !required.includes(i));

		// Build the table for required instructions
		const requiredTable = required.map((key) => ({
			instruction: key,
			status: implemented.includes(key) ? "✅" : "❌",
			type: "required",
		}));

		// Build the table for extra instructions
		const extraTable = extraInstructions.map((key) => ({
			instruction: key,
			status: "🟡",
			type: "extra",
		}));

		// Merge the tables
		const table = [...requiredTable, ...extraTable].sort((a, b) => {
			// Sort by status first, then by type
			if (a.status !== b.status) {
				return a.status.localeCompare(b.status);
			}
			return a.type.localeCompare(b.type);
		});

		// Print the table
		console.table(table);

		// Print details of unimplemented ones
		const notImplemented = required.filter((key) => !implemented.includes(key));
		if (notImplemented.length > 0) {
			console.log("\nUnimplemented instructions:");
			notImplemented.forEach((key) => {
				console.log(`\n${key}:`);
				console.log(`  ${(INSTRUCTIONS as any)[key].description}  ${(INSTRUCTIONS as any)[key].example}`);
			});
		}

		// Print information about extra instructions
		if (extraInstructions.length > 0) {
			console.log("\nExtra instructions (implemented but not required):");
			extraInstructions.forEach((key) => {
				console.log(`  ${key}`);
			});
		}

		// Calculate the implementation percentage (required instructions only)
		const percent = (implemented.filter((i) => required.includes(i)).length / required.length) * 100;

		// Print overall statistics
		console.log(`\nOverall statistics:`);
		console.log(`  - Required instructions: ${required.length}`);
		console.log(`  - Implemented required: ${implemented.filter((i) => required.includes(i)).length}`);
		console.log(`  - Extra instructions: ${extraInstructions.length}`);
		console.log(`  - Total implemented: ${implemented.length}`);

		// Print the percentage with an emoji
		if (percent >= 100) {
			console.log(
				`\n🎉 Implemented 100% of required instructions (${implemented.filter((i) => required.includes(i)).length} of ${required.length})`,
			);
		} else {
			console.log(
				`\n⚠️ Implemented ${percent.toFixed(2)}% of required instructions (${implemented.filter((i) => required.includes(i)).length} of ${required.length})`,
			);
		}

		if (extraInstructions.length > 0) {
			console.log(`📝 Extra instructions found: ${extraInstructions.length}`);
		}

		expect(percent).toBeGreaterThanOrEqual(100);
	});
});
