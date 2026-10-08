import { beforeAll } from "vitest";
import { Languages } from "../src/Languages/index.ts";
import i18n from "../src/Languages/lang.ts";

beforeAll(async () => {
	await i18n
		.init({
			lng: "en", // язык по умолчанию
			fallbackLng: "en",
			debug: false,
			resources: Languages,
		})
		.then(() => console.log("🟦🟦 Язык загружен 🟦🟦"));
});
