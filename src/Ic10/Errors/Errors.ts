// Constructor type for errors

import type { Device } from "../../Core/Device.ts";
import type { Context } from "../Context/Context.ts";
import { crc32 } from "../Helpers/functions.ts";
import type { Argument } from "../Instruction/Helpers/Argument.ts";
import type { Line } from "../Lines/Line.ts";

export type GameLangErrorConstructorType = {
	message: string;
	code?: string;
	severity?: ErrorSeverity;
	context?: Context;
	line?: number;
	start?: number;
	length?: number;
	originalText?: string;
};

// A const object instead of an enum, so Node's type stripping can run this file directly.
export const ErrorSeverity = {
	Weak: "weak", // An error that does not affect program operation
	Warning: "warning", // An error that may cause problems in program operation, e.g. unoptimized code
	Strong: "strong", // An error that prevents the program from running
	Critical: "critical", // An error in the interpreter itself
} as const;
export type ErrorSeverity = (typeof ErrorSeverity)[keyof typeof ErrorSeverity];

// Base class for all game language errors
export class Ic10Error extends Error {
	public severity: ErrorSeverity;
	public code: string;
	public line?: number;
	public start?: number;
	public length?: number;
	public originalText?: string;

	constructor({
		message,
		code = "GENERIC_ERROR",
		severity = ErrorSeverity.Warning,
		context,
		line,
		start,
		length,
		originalText,
	}: GameLangErrorConstructorType) {
		super(message);
		this.name = this.constructor.name;
		this.severity = severity;
		this.code = code;
		this._context = context;
		this.line = line;
		this.start = start;
		this.length = length;
		this.originalText = originalText;
		Object.setPrototypeOf(this, new.target.prototype);
	}

	private _device?: Device;

	get device() {
		return this._device;
	}

	private _context?: Context;

	get context() {
		return this._context;
	}

	/**
	 * The error ID helps identify the error regardless of context,
	 * to avoid duplicate errors
	 */
	get id(): number {
		return crc32([this.line, this.start, this.length, this.name, this.code, this.device?.id ?? 0].join("|"));
	}

	get sort(): number {
		return (this.line ?? 0) + (this.start ?? 0);
	}

	get formated_message() {
		const parts: string[] = [];

		// Severity level (required field)
		parts.push(`[${this.severity}]`);

		// Execution context (if any)
		if (this.context?.name) {
			parts.push(`(${this.context.name})`);
		}

		// Position in the code (if available)
		if (this.line !== undefined) {
			const location = this.start !== undefined ? `${this.line}:${this.start}` : `${this.line}`;
			parts.push(`[${location}]`);
			parts.push(`"${this.originalText}"`);
		}
		if (this.device !== undefined) {
			parts.push(`(device: ${this.device.id})`);
		}

		// Error code (required field)
		parts.push(`${this.code}:`);

		// Main message (required field)
		parts.push(`"${this.message}"`);
		parts.push(this.id.toString(16));

		return parts.join(" ");
	}

	setLine(line: Line) {
		this.line = line.position;
		if (!this.start) {
			this.start = 0;
		}
		if (!this.length) {
			this.length = line.originalText.length;
		}
		if (!this.originalText) {
			this.originalText = line.originalText;
		}
		return this;
	}

	setContext(context: Context) {
		this._context = context;
	}

	setDevice(device: Device) {
		this._device = device;
	}
}

// --- Unable to continue execution ---
export class FatalIc10Error extends Ic10Error {
	constructor(params: GameLangErrorConstructorType) {
		super({
			...params,
			line: 0,
			originalText: "",
			length: 0,
			start: 0,
			code: params.code ?? "FATAL_ERROR",
			severity: params.severity ?? ErrorSeverity.Critical,
		});
	}
}

// --- Syntax errors ---
export class SyntaxIc10Error extends Ic10Error {
	constructor(params: GameLangErrorConstructorType) {
		super({
			...params,
			code: params.code ?? "SYNTAX_ERROR",
			severity: params.severity ?? ErrorSeverity.Strong,
		});
	}
}

// --- Parsing errors ---
export class DeviceIc10Error extends Ic10Error {}

// --- Argument errors ---
export class ArgumentIc10Error extends Ic10Error {
	constructor(params: GameLangErrorConstructorType) {
		super({
			...params,
			code: params.code ?? "ARGUMENT_ERROR",
			severity: params.severity ?? ErrorSeverity.Strong,
		});
	}

	public setArgument(arg: Argument) {
		this.start = arg.start;
		this.length = arg.length;
		this.originalText = arg.text;
		return this;
	}
}

// --- Runtime errors ---
export class RuntimeIc10Error extends ArgumentIc10Error {
	constructor(params: GameLangErrorConstructorType) {
		super({
			...params,
			code: params.code ?? "RUNTIME_ERROR",
			severity: params.severity ?? ErrorSeverity.Critical,
		});
	}
}
export class DebugInfo extends ArgumentIc10Error {
	constructor(params: GameLangErrorConstructorType) {
		super({
			...params,
			code: params.code ?? "DEBUG_INFO",
			severity: params.severity ?? ErrorSeverity.Weak,
		});
	}
}

// --- Other errors ---
export class TypeIc10Error extends ArgumentIc10Error {
	constructor(params: GameLangErrorConstructorType) {
		super({
			...params,
			code: params.code ?? "TYPE_ERROR",
			severity: params.severity ?? ErrorSeverity.Strong,
		});
	}
}

export class ReferenceIc10Error extends ArgumentIc10Error {
	constructor(params: GameLangErrorConstructorType) {
		super({
			...params,
			code: params.code ?? "REFERENCE_ERROR",
			severity: params.severity ?? ErrorSeverity.Critical,
		});
	}
}
