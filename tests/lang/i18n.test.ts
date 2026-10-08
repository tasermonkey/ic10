import { describe, expect, test } from "vitest";
import { Languages } from "../../src/Languages/index.ts";
import { i18n } from "../../src/Languages/lang.ts";

describe("translations ", async () => {
	await i18n.init({
		lng: "en", // default language
		fallbackLng: "en",
		debug: false,
		resources: Languages,
	});

	test("variables", () => {
		expect(i18n.t("error.alias_already_defined", { alias: "test" })).toBe("test is already defined");
	});
});
