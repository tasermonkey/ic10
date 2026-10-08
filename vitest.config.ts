import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["tests/**/*.test.ts"],
		setupFiles: ["./tests/setup.ts"],
		reporters: process.env.CI ? ["default", "junit"] : ["default"],
		outputFile: { junit: "./tests/reports/report.xml" },
	},
});
