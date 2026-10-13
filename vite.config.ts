import path from "node:path";
import { defineConfig } from "vite";

// Builds the ESM and CommonJS bundles, each self-contained. Bundling the ESM build inlines
// @stationeers-ic/exact-ic10-math, whose published ESM uses extensionless imports that Node
// rejects (tools/fix-esm-deps.ts patches it only in this checkout, not in a consumer's install).
// `tsc -p tsconfig.node.json` writes the type declarations.
const FILE_NAMES = { es: "index.js", cjs: "ic10.cjs" };

export default defineConfig(({ mode }) => ({
	build: {
		minify: true,
		sourcemap: false,
		emptyOutDir: false,
		lib: {
			entry: path.resolve(import.meta.dirname, "src/index.ts"),
			formats: ["es", "cjs"],
			fileName: (format) => FILE_NAMES[format as keyof typeof FILE_NAMES],
		},
	},
	define: {
		__VITE_ENV: JSON.stringify(mode),
		isProd: mode === "production",
	},
}));
