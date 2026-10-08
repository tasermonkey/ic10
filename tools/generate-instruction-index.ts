import fs from "node:fs";
import path from "node:path";
import { parse } from "@babel/parser";
import babelTraverse from "@babel/traverse";
import * as t from "@babel/types";
import { glob } from "glob";

// @babel/traverse is CommonJS: under Node ESM the default import is the module object.
const traverse = ((babelTraverse as any).default ?? babelTraverse) as typeof babelTraverse.default;

console.log("🚀 Generating intstructions...");

const SOURCE_DIR = path.resolve(import.meta.dirname, "../src/Ic10/Instruction");
const INDEX_PATH = path.join(SOURCE_DIR, "index.ts");

// Function to check whether a class is abstract
function isAbstractClass(classNode: t.ClassDeclaration): boolean {
	return classNode.abstract === true;
}

// Function to generate the instruction name from the class name
function generateInstructionName(className: string): string {
	// Remove the "Instruction" suffix if present
	const withoutSuffix = className.replace(/Instruction$/, "");

	// Convert PascalCase to snake_case (or keep abbreviations)
	return withoutSuffix
		.replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
		.replace(/([a-z\d])([A-Z])/g, "$1_$2")
		.toLowerCase();
}

// Extended function to check inheritance from Instruction
function extendsInstruction(classNode: t.ClassDeclaration): boolean {
	if (!classNode.superClass) return false;

	// Recursive function to check inheritance through complex expressions
	function checkSuperClass(superClass: t.Node): boolean {
		// Direct inheritance: class A extends Instruction
		if (t.isIdentifier(superClass)) {
			return superClass.name === "Instruction";
		}

		// Via MemberExpression: class A extends Base.Instruction
		if (t.isMemberExpression(superClass)) {
			if (t.isIdentifier(superClass.property)) {
				return superClass.property.name === "Instruction";
			}
		}

		// Via CallExpression: class A extends makeBinarySet(...)
		if (t.isCallExpression(superClass)) {
			// Check the call expression arguments for Instruction
			return superClass.arguments.some((arg) => {
				if (t.isIdentifier(arg)) {
					return arg.name.includes("Instruction");
				}
				if (t.isMemberExpression(arg)) {
					return t.isIdentifier(arg.property) && arg.property.name.includes("Instruction");
				}
				return false;
			});
		}

		return false;
	}

	return checkSuperClass(classNode.superClass);
}

// Alternative approach: check by file name or other indicators
function shouldIncludeClass(className: string, filePath: string): boolean {
	// Exclude abstract classes by name
	const abstractClassNames = [
		"Instruction",
		"AbstractInstruction",
		"BinaryInstruction",
		"BinaryBranchInstruction",
		"UnaryInstruction",
		"BranchInstruction",
	];

	if (abstractClassNames.includes(className)) {
		return false;
	}

	// Include only classes ending in Instruction (but not abstract ones)
	return className.endsWith("Instruction") && !abstractClassNames.includes(className);
}

async function generateInstructionsIndex() {
	let files = await glob([`${SOURCE_DIR}/**/*.ts`, `!${INDEX_PATH}`]);

	// Sort files for a deterministic processing order
	files = files.sort((a, b) => a.localeCompare(b));

	const imports: string[] = [];
	const instructionMap: Map<string, string> = new Map(); // instructionName -> className

	// Collect all classes that inherit from Instruction
	for (const file of files) {
		const content = fs.readFileSync(file, "utf-8");

		try {
			const ast = parse(content, {
				sourceType: "module",
				plugins: ["typescript"],
			});

			const fileClasses: Array<{ name: string; node: t.ClassDeclaration; filePath: string }> = [];

			// First collect all classes in the file
			traverse(ast as any, {
				ClassDeclaration(path) {
					const className = path.node.id?.name;
					if (className) {
						fileClasses.push({
							name: className,
							node: path.node as any,
							filePath: file,
						});
					}
				},
			});

			// Sort the classes in the file by name for a deterministic order
			fileClasses.sort((a, b) => a.name.localeCompare(b.name));

			// Check inheritance from Instruction and build the imports
			if (fileClasses.length > 0) {
				const relativePath = path.relative(SOURCE_DIR, file).replace(/\.ts$/, "").replace("\\", "/");
				// Build the path in the format @/src/Ic10/Instruction/...
				const importPath = `@/Ic10/Instruction/${relativePath}`;

				// Use a combined approach for filtering
				const classNames = fileClasses
					.filter(({ name, node, filePath }) => {
						// Exclude abstract classes
						if (isAbstractClass(node)) return false;

						// Check inheritance using more complex methods
						if (extendsInstruction(node)) return true;

						// Additional check by name
						return shouldIncludeClass(name, filePath);
					})
					.map(({ name }) => name);

				if (classNames.length > 0) {
					// Sort class names before adding them to the import
					const sortedClassNames = classNames.sort((a, b) => a.localeCompare(b));
					imports.push(`import { ${sortedClassNames.join(", ")} } from "${importPath}";`);

					// Add the instructions to the map
					sortedClassNames.forEach((className) => {
						const instructionName = generateInstructionName(className);
						instructionMap.set(instructionName, className);
					});
				}
			}
		} catch (error) {
			console.warn(`Failed to parse ${file}:`, error);
		}
	}

	// Sort imports and instructions for a deterministic result
	imports.sort((a, b) => a.localeCompare(b));
	const sortedInstructions = Array.from(instructionMap.entries()).sort(([a], [b]) => a.localeCompare(b));

	// Build the file contents from strings (simpler and more reliable)
	const instructionsObject = sortedInstructions.map(([key, className]) => `  ${key}: ${className},`).join("\n");

	const content = `// Auto-generated file - DO NOT EDIT MANUALLY
${imports.join("\n")}

export type InstructionName = keyof typeof instructions;

export function isInstructionName(name: string): name is InstructionName {
  return name in instructions;
}

export const instructions = {
${instructionsObject}
} as const;
`;

	fs.writeFileSync(INDEX_PATH, content);
	console.table(sortedInstructions);
	console.log(`Generated ${INDEX_PATH} with ${instructionMap.size} instructions`);
}

// Run
generateInstructionsIndex().catch(console.error);
