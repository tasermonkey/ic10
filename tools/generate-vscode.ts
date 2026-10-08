// scripts/updateLaunchOptions.ts

import { promises as fs } from "node:fs";
import path from "node:path";
import JSON5 from "json5";
import { instructions } from "../src/Ic10/Instruction/index.ts";

console.log("🚀 Generating vscode...");

interface Instruction {
	tests?: () => unknown;
}

interface ErrorStats {
	noInstruction: string[];
	noTestsMethod: string[];
	testsThrew: string[];
	notArray: string[];
	emptyArray: string[];
}

async function main() {
	console.log("Starting launch.json update...\n");

	const allowed: string[] = [];
	const errors: ErrorStats = {
		noInstruction: [],
		noTestsMethod: [],
		testsThrew: [],
		notArray: [],
		emptyArray: [],
	};

	// Sort instruction keys for deterministic behavior
	const sortedInstructionKeys = Object.keys(instructions).sort();

	// Iterate over all instructions in sorted order
	for (const key of sortedInstructionKeys) {
		const instruction = (instructions as any)[key];

		// Check that the instruction exists
		if (!instruction) {
			errors.noInstruction.push(key);
			continue;
		}

		// Check that the tests method exists
		if (typeof (instruction as Instruction).tests !== "function") {
			errors.noTestsMethod.push(key);
			continue;
		}

		let testResults: unknown;
		try {
			// Try to get the tests
			testResults = (instruction as Instruction).tests!();
		} catch (_error) {
			errors.testsThrew.push(key);
			continue;
		}

		// Check that the result is a non-empty array
		if (!Array.isArray(testResults)) {
			errors.notArray.push(key);
			continue;
		}

		if (testResults.length === 0) {
			errors.emptyArray.push(key);
			continue;
		}

		allowed.push(key);
	}

	// Sort the allowed array for deterministic output
	allowed.sort();

	// Sort all error arrays for deterministic output
	errors.noInstruction.sort();
	errors.noTestsMethod.sort();
	errors.testsThrew.sort();
	errors.notArray.sort();
	errors.emptyArray.sort();

	// Print statistics
	console.log(`✅ Instructions added: ${allowed.length}`);

	// Print errors only if there are any
	if (errors.noInstruction.length > 0) {
		console.log(`❌ Skipped (no instruction): ${errors.noInstruction.length}`);
	}

	if (errors.noTestsMethod.length > 0) {
		console.log(`❌ Skipped (no tests method): ${errors.noTestsMethod.length}`);
	}

	if (errors.testsThrew.length > 0) {
		console.log(`❌ Skipped (error in tests()): ${errors.testsThrew.length}`);
	}

	if (errors.notArray.length > 0) {
		console.log(`❌ Skipped (not an array): ${errors.notArray.length}`);
	}

	if (errors.emptyArray.length > 0) {
		console.log(`❌ Skipped (empty array): ${errors.emptyArray.length}`);
	}

	// Detailed output on request (can be commented out if not needed)
	if (process.env.DEBUG) {
		console.log("\nDetailed information (DEBUG mode only):");
		for (const [category, items] of Object.entries(errors)) {
			if (items.length > 0) {
				console.log(`\n${category}: ${items.join(", ")}`);
			}
		}
	}

	// Update launch.json
	const launchPath = path.join(path.dirname(import.meta.dirname), ".vscode/launch.json");

	try {
		const content = await fs.readFile(launchPath, "utf-8");
		const data = JSON5.parse(content);

		// Find the input with id "instrName"
		const inputs = Array.isArray(data?.inputs) ? data.inputs : [];
		const instrInput = inputs.find((i: any) => i?.id === "instrName");

		if (!instrInput) {
			console.warn("⚠️  instrName field not found in launch.json");
			return;
		}

		// Update the options (already sorted)
		instrInput.options = allowed;

		// Save changes
		const updatedContent = JSON.stringify(data, null, 2);
		await fs.writeFile(launchPath, updatedContent, "utf-8");

		console.log("\n✅ launch.json updated successfully");
	} catch (error) {
		console.error("❌ Error while processing launch.json:", error);
		throw error;
	}
}

main().catch((err) => {
	console.error("💥 Fatal error:", err);
	process.exit(1);
});
