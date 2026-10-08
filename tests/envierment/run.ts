import { readFile } from "node:fs/promises";
import { ValiError } from "valibot";
import { Builder } from "../../src/Envierment/Builder.ts";
import { Languages } from "../../src/Languages/index.ts";
import i18n from "../../src/Languages/lang.ts";

await i18n
	.init({
		lng: "ru", // язык по умолчанию
		fallbackLng: "en",
		debug: false,
		resources: Languages,
	})
	.then(() => console.log("🟦🟦 Язык загружен 🟦🟦"));

const f = await readFile(`${import.meta.dirname}/test.ic.json`, "utf8");

try {
	const builder = Builder.from(f);
	await builder.init();
	while ((await builder.step()) === true) {}
	console.log(builder.toJson(true));
} catch (e) {
	if (e instanceof ValiError) {
		console.error(e.message);
	} else {
		console.error(e);
	}
}
// console.table(builder.Runners.get(1).realContext.housing.chip.registers);
