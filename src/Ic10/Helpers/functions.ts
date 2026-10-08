import { hashString } from "@stationeers-ic/exact-ic10-math";

export function crc32(str: string) {
	return hashString(str);
}

// Converts a string (up to 6 ASCII characters) to a numeric code (base 256)
export function stringToCode(str: string): number {
	if (str.length > 6) {
		throw new Error("Maximum of 6 characters");
	}

	let code = 0;
	for (let i = 0; i < str.length; i++) {
		const ch = str.charCodeAt(i);
		if (ch > 127) {
			throw new Error("Invalid character: not ASCII");
		}
		code = code * 256 + ch;
	}
	return code;
}

// Converts a numeric code back to a string
export function codeToString(code: number): string {
	if (!Number.isInteger(code) || code < 0) {
		throw new Error("Invalid code");
	}
	if (code === 0) return "";

	const bytes: number[] = [];
	while (code > 0) {
		bytes.push(code % 256);
		code = Math.floor(code / 256);
	}

	if (bytes.length > 6) {
		throw new Error("Code cannot be represented in 6 characters");
	}

	// Restore the character order
	let result = "";
	for (let i = bytes.length - 1; i >= 0; i--) {
		const b = bytes[i];
		if (b > 127) {
			// To return only ASCII characters
			throw new Error("Invalid unpacked character");
		}
		result += String.fromCharCode(b);
	}

	return result;
}
