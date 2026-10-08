import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { dirname, join, matchesGlob, relative } from "node:path";

// Same `.match()` API as Bun's Glob, backed by Node's path.matchesGlob.
class Glob {
	private readonly pattern: string;

	constructor(pattern: string) {
		this.pattern = pattern;
	}

	match(path: string): boolean {
		return matchesGlob(path.replaceAll("\\", "/"), this.pattern);
	}
}

console.log("🚀 Whatching ...");

// === SETTINGS ===
const CONFIG: {
	watchPath: string;
	debounceDelay: number;
	scripts: {
		pattern: Glob;
		command: string;
	}[];
	ignoreFiles: Glob[];
} = {
	// Path to the watched folder
	watchPath: join(dirname(import.meta.dirname), "src"),

	// Debounce delay (ms)
	debounceDelay: 1500,

	// Scripts for different patterns (in order of specificity)
	// More specific patterns must come first
	scripts: [
		{
			pattern: new Glob("Ic10/Instruction/**"),
			command: "npm run generate:intruction && npm run generate:vscode",
		},
		{
			pattern: new Glob("Defines/**"),
			command: "npm run generate:device",
		},
		{
			pattern: new Glob("Schemas/**"),
			command: "npm run generate:schema",
		},
		{
			pattern: new Glob("**"),
			command: "npm run generate:index",
		},
	],

	// Ignored files
	ignoreFiles: [new Glob("**/index.ts"), new Glob("Defines/data.ts"), new Glob("**/*.json")],
};
// === END OF SETTINGS ===

console.log(`Watching ${CONFIG.watchPath} for changes...`);

// For debounce
let timeoutId: NodeJS.Timeout | null = null;
const changedFiles = new Set<string>();

// Function to check whether a file is ignored
function isIgnored(filepath: string): boolean {
	const relativePath = relative(`${CONFIG.watchPath}/`, filepath);
	return CONFIG.ignoreFiles.some((glob) => glob.match(relativePath));
}

// Function to check whether a file matches a pattern
function matchesPattern(filepath: string, pattern: Glob): boolean {
	const relativePath = relative(`${CONFIG.watchPath}/`, filepath);
	console.warn(relativePath, pattern.match(relativePath));
	return pattern.match(relativePath);
}

// Function to determine which scripts need to run
function getScriptsToRun(filepaths: string[]): Set<string> {
	const scriptsToRun = new Set<string>();

	for (const filepath of filepaths) {
		for (const { pattern, command } of CONFIG.scripts) {
			if (matchesPattern(filepath, pattern)) {
				scriptsToRun.add(command);
			}
		}
	}
	console.table(scriptsToRun);
	return scriptsToRun;
}

// Function to run a script
function runScript(command: string) {
	console.log(`\n🔄 Running: ${command}`);

	// Split commands on && and run them sequentially
	const commands = command.split("&&").map((cmd) => cmd.trim());

	const runNextCommand = async (index: number) => {
		if (index >= commands.length) {
			console.log(`✅ All commands completed`);
			return;
		}

		const [cmd, ...args] = commands[index].split(" ");
		console.log(`▶️ Executing: ${cmd} ${args.join(" ")}`);

		const child = spawn(cmd, args, { stdio: "inherit", shell: true });

		child.on("close", (code) => {
			if (code === 0) {
				console.log(`✅ Command completed: ${commands[index]}`);
				runNextCommand(index + 1);
			} else {
				console.log(`❌ Command failed with code ${code}: ${commands[index]}`);
			}
		});
	};

	runNextCommand(0);
}

const watcher = watch(CONFIG.watchPath, { recursive: true }, (event, filename) => {
	const filepath = join(CONFIG.watchPath, filename!);

	if (!filename || isIgnored(filepath)) {
		return;
	}
	console.log(`Detected ${event} in ${filename}`);

	// Add the file to the change set
	changedFiles.add(filepath);

	// Reset the previous timer
	if (timeoutId) {
		clearTimeout(timeoutId);
	}

	// Set a new timer
	timeoutId = setTimeout(() => {
		if (changedFiles.size > 0) {
			console.log(`\n📁 Processing ${changedFiles.size} changed files...`);

			// Determine which scripts need to run
			const scriptsToRun = getScriptsToRun(Array.from(changedFiles));

			if (scriptsToRun.size > 0) {
				console.log(`🚀 Will run ${scriptsToRun.size} script(s):`);
				scriptsToRun.forEach((script) => console.log(`  - ${script}`));

				// Run all required scripts
				scriptsToRun.forEach(runScript);
			} else {
				console.log(`ℹ️ No scripts to run for the changes`);
			}

			// Clear the change set
			changedFiles.clear();
		}
		timeoutId = null;
	}, CONFIG.debounceDelay);
});

process.on("SIGINT", () => {
	console.log("Closing watcher...");

	// Clear the timer
	if (timeoutId) {
		clearTimeout(timeoutId);
	}

	watcher.close();
	process.exit(0);
});
