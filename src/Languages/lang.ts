import i18next from "i18next";
import { Languages } from "./index.ts";

export const i18n: ReturnType<typeof i18next.createInstance> = i18next.createInstance();
const oldT = i18n.t;

const newT = (...args: Parameters<typeof i18n.t>): ReturnType<typeof i18n.t> => {
	if (!i18n.isInitialized) {
		return `WARN: init i18n | ${args[0]}` as string;
	}
	return oldT.call(i18n, ...args);
};

// Copy all properties, including the brand
Object.assign(newT, oldT);

i18n.t = newT as typeof i18n.t;

// Initialise synchronously in English, so error messages are readable without any setup by the
// library's user. Every bundled language is loaded: switch with `i18n.changeLanguage("ru")`.
i18n.init({
	lng: "en",
	fallbackLng: "en",
	resources: Languages,
	initAsync: false,
});

// Export the singleton
export default i18n;
