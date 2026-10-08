import path from "node:path";
import { defineConfig } from "vite";

// Builds the CommonJS and UMD bundles only. The ESM build (dist/index.js and friends) is emitted
// per file by `tsc -p tsconfig.node.json`, which also writes the type declarations.
export default defineConfig(({ mode }) => ({
	build: {
		minify: true,
		sourcemap: false,
		emptyOutDir: false,
		lib: {
			entry: path.resolve(import.meta.dirname, "src/index.ts"),
			name: "ic10",
			formats: ["cjs", "umd"],
			fileName: (format) => (format === "umd" ? "ic10.umd.js" : "ic10.cjs"),
		},
		rollupOptions: {
			output: {
				globals: {
					ic10: "ic10",
				},
			},
		},
	},
	define: {
		__VITE_ENV: JSON.stringify(mode),
		isProd: mode === "production",
	},
}));
