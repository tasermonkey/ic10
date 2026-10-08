import { describe, expect, test } from "vitest";
import { Languages } from "../../src/Languages/index.ts";
import { i18n } from "../../src/Languages/lang.ts";

describe("переводы ", async () => {
	await i18n.init({
		lng: "en", // язык по умолчанию
		fallbackLng: "en",
		debug: false,
		resources: Languages,
	});

	test("переменные", () => {
		expect(i18n.t("error.alias_already_defined", { alias: "test" })).toBe("test is already defined");
	});
});
