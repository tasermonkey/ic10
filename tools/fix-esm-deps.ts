/**
 * Workaround for dependencies whose published ESM build uses extensionless relative imports
 * (`from "./functions"`), which Node's ESM loader and TypeScript's `nodenext` resolution reject.
 * Adds the `.js` extension in their `dist/*.js` and `dist/*.d.ts` files.
 *
 * Runs as `postinstall`. Idempotent. Remove once the packages publish valid ESM.
 * Affected: @stationeers-ic/exact-ic10-math (1.1.1).
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const PACKAGES = ["@stationeers-ic/exact-ic10-math"];
const require = createRequire(import.meta.url);

// Relative specifiers without an extension, in `from "./x"` / `import("./x")` / `export … from "./x"`.
const EXTENSIONLESS_RE = /(\bfrom\s*|\bimport\s*\(\s*)(["'])(\.{1,2}\/[^"']+?)\2/g;

for (const pkg of PACKAGES) {
	let distDir: string;
	try {
		// Resolves to dist/index.cjs (the `require` condition); the ESM files sit beside it.
		distDir = dirname(require.resolve(pkg));
	} catch {
		console.warn(`fix-esm-deps: ${pkg} not installed, skipping`);
		continue;
	}
	let fixed = 0;
	for (const name of readdirSync(distDir)) {
		if (!name.endsWith(".js") && !name.endsWith(".d.ts")) continue;
		const file = join(distDir, name);
		const source = readFileSync(file, "utf8");
		const code = source.replace(EXTENSIONLESS_RE, (match, prefix: string, quote: string, spec: string) => {
			if (/\.(m?js|cjs|json)$/.test(spec)) return match;
			if (existsSync(join(distDir, `${spec}.js`))) return `${prefix}${quote}${spec}.js${quote}`;
			if (existsSync(join(distDir, spec, "index.js"))) return `${prefix}${quote}${spec}/index.js${quote}`;
			return match;
		});
		if (code !== source) {
			writeFileSync(file, code);
			fixed++;
		}
	}
	console.log(`fix-esm-deps: ${pkg}: ${fixed} file(s) patched`);
}
