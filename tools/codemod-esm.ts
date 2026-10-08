/**
 * Rewrites import specifiers so the sources run natively on Node (type stripping) and as real ESM:
 *   - `@/x`, `@tests/x`, `@tools/x` aliases become relative paths
 *   - every relative specifier gets an explicit file extension (`.ts`, `/index.ts`, `.json`)
 *   - JSON imports get `with { type: "json" }`
 *
 * Idempotent: safe to run repeatedly, and it runs at the end of `npm run generate` so regenerated
 * files (which the generators still emit with `@/` aliases) are fixed up automatically.
 *
 * Usage: node tools/codemod-esm.ts [--check]
 *   --check  report files that would change and exit 1 if any, without writing
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_DIRS = ["src", "tools", "tests"];
const ALIASES: Record<string, string> = {
	"@/": join(ROOT, "src"),
	"@tests/": join(ROOT, "tests"),
	"@tools/": join(ROOT, "tools"),
};

// `from "x"`, `import "x"`, `import("x")`, `export … from "x"` — captures the specifier and anything
// already following it on the same statement (to detect an existing `with { … }` clause).
const SPECIFIER_RE = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(["'])([^"'\n]+)\2(\s*with\s*\{[^}]*\})?/g;

function walk(dir: string, out: string[] = []): string[] {
	if (!existsSync(dir)) return out;
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "node_modules" || entry.name === "reports") continue;
			walk(full, out);
		} else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
			out.push(full);
		}
	}
	return out;
}

function isFile(path: string): boolean {
	return existsSync(path) && statSync(path).isFile();
}

/** Resolve an alias/relative specifier to an absolute file path, or undefined if it isn't local. */
function resolveTarget(fromFile: string, specifier: string): string | undefined {
	let base: string | undefined;
	for (const [alias, dir] of Object.entries(ALIASES)) {
		if (specifier.startsWith(alias)) {
			base = join(dir, specifier.slice(alias.length));
			break;
		}
	}
	if (!base && (specifier.startsWith("./") || specifier.startsWith("../"))) {
		base = resolve(dirname(fromFile), specifier);
	}
	if (!base) return undefined;

	const candidates = [base, `${base}.ts`, join(base, "index.ts"), `${base}.json`];
	if (base.endsWith(".js")) candidates.unshift(`${base.slice(0, -3)}.ts`);
	return candidates.find(isFile);
}

function toRelativeSpecifier(fromFile: string, target: string): string {
	let rel = relative(dirname(fromFile), target).replaceAll("\\", "/");
	if (!rel.startsWith(".")) rel = `./${rel}`;
	return rel;
}

/** True when the match sits on a line comment or inside a block comment (doc examples, not real imports). */
function isInComment(source: string, offset: number): boolean {
	const lineStart = source.lastIndexOf("\n", offset) + 1;
	const line = source.slice(lineStart, offset).trimStart();
	return line.startsWith("//") || line.startsWith("*") || line.startsWith("/*");
}

function transform(file: string, source: string): { code: string; unresolved: string[] } {
	const unresolved: string[] = [];
	const code = source.replace(
		SPECIFIER_RE,
		(match, prefix: string, quote: string, spec: string, withClause: string | undefined, offset: number) => {
			const isLocal = spec.startsWith(".") || Object.keys(ALIASES).some((a) => spec.startsWith(a));
			if (!isLocal || isInComment(source, offset)) return match;
			const target = resolveTarget(file, spec);
			if (!target) {
				unresolved.push(spec);
				return match;
			}
			const newSpec = toRelativeSpecifier(file, target);
			const isDynamic = prefix.includes("(");
			let attributes = withClause ?? "";
			if (target.endsWith(".json") && !withClause) {
				attributes = isDynamic ? "" : ' with { type: "json" }';
			}
			return `${prefix}${quote}${newSpec}${quote}${attributes}`;
		},
	);
	return { code, unresolved };
}

const checkOnly = process.argv.includes("--check");
let changed = 0;
const problems: string[] = [];

for (const dir of SCAN_DIRS) {
	for (const file of walk(join(ROOT, dir))) {
		const source = readFileSync(file, "utf8");
		const { code, unresolved } = transform(file, source);
		for (const spec of unresolved) problems.push(`${relative(ROOT, file)}: cannot resolve "${spec}"`);
		if (code !== source) {
			changed++;
			if (checkOnly) console.log(`would change: ${relative(ROOT, file)}`);
			else writeFileSync(file, code);
		}
	}
}

for (const p of problems) console.warn(`warning: ${p}`);
console.log(`${checkOnly ? "files needing changes" : "files changed"}: ${changed}`);
if (checkOnly && changed > 0) process.exit(1);
