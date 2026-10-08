import type { Device } from "../../../Core/Device.ts";
import i18n from "../../../Languages/lang.ts";
import type { Context } from "../../Context/Context.ts";
import { ArgumentIc10Error, ErrorSeverity, type Ic10Error } from "../../Errors/Errors.ts";
import type { InstructionLine } from "../../Lines/InstructionLine.ts";
import type { Line } from "../../Lines/Line.ts";
import type { Argument } from "./Argument.ts";

export type InstructionConstructorType = {
	/** Instruction execution context (access to registers, devices, defines, etc.) */
	context: Context;
	/** Source code line the instruction is bound to (for tracing/errors) */
	line: Line;
	/** Raw instruction arguments obtained from the parser */
	args: Argument[];
};

export type InstructionArgument = {
	/** Optional argument name (for access by name) */
	name?: string;
	/** Whether alias substitution is allowed for this argument */
	canBeAlias: boolean;
	/** Whether const substitution is allowed for this argument */
	canBeConst: boolean;
	/** Whether define substitution is allowed for this argument */
	canBeDefine: boolean;
	/** Whether label substitution is allowed for this argument */
	canBeLabel: boolean;
	/**
	 * Function that computes the argument value.
	 * Performs parsing/validation and conversion of Argument -> the required value.
	 * this is the current instruction instance.
	 */
	calculate: (this: Instruction, context: Context, argument: Argument) => any;
};

/** Expected register value */
export type InstructionTestExpectedRegister = {
	type: "register";
	/** Expected register number */
	register: number;
	/** Expected register value after execution */
	value: number;
};

/** Expected stack value */
export type InstructionTestExpectedStack = {
	type: "stack";
	/** Expected register number */
	index: number;
	/** Expected register value after execution */
	value: number;
};

/** Expected device parameter */
export type InstructionTestExpectedDevice = {
	type: "device";
	/** Device pin */
	pin: number;
	/** Device parameter */
	prop: number;
	/** Expected parameter value after execution */
	value: number;
};

/** Expected next line index (control flow) */
export type InstructionTestExpectedLoop = {
	type: "loop";
	/** Next line number after execution */
	nextLineIndex: number;
};

/** Unified expectation type */
export type InstructionTestExpected =
	| InstructionTestExpectedStack
	| InstructionTestExpectedRegister
	| InstructionTestExpectedDevice
	| InstructionTestExpectedLoop;

export type InstructionTestData = {
	devices?: {
		pin?: number;
		id?: number;
		device: Device;
	}[];
	/** Test title/description (optional) */
	title?: string;
	/** IC10 code to execute in the test */
	code: string | string[];
	/** Number of iterations in the real context */
	iterations_count?: number;
	/** List of expected changes to registers/devices/control flow */
	expected: InstructionTestExpected[];
};

export abstract class Instruction {
	/** Raw instruction arguments received from the parser */
	public args: Argument[] = [];
	/** Execution context */
	public readonly context: Context;
	/** Source code line the instruction is bound to */
	public readonly line: Line;
	/** Cache of argument descriptors (validation/conversion rules) */
	public $argumentList!: InstructionArgument[];

	/**
	 * Creates an instruction instance.
	 * @param context Execution context (registers, devices, defines, etc.)
	 * @param line Source code line for tracing and error messages
	 * @param args Raw instruction arguments
	 */
	public constructor({ context, line, args }: InstructionConstructorType) {
		this.context = context;
		this.line = line;
		this.args = args;
	}

	/**
	 * Cached list of argument descriptors.
	 * Computed once via argumentList() and reused.
	 */
	public get argumentListCached() {
		if (!this.$argumentList) {
			this.$argumentList = this.argumentList();
		}
		return this.$argumentList;
	}

	/**
	 * Set of unit tests for the instruction.
	 * Overridden in concrete implementations as needed.
	 */
	static tests(): InstructionTestData[] {
		return [];
	}

	/**
	 * Entry point for executing the instruction.
	 * 1) Gets the argument rules
	 * 2) Checks that the number of supplied arguments matches the rules
	 * 3) On success, invokes the run() implementation
	 * On mismatch, registers an error and stops execution.
	 */
	public execute(): void | Promise<void> {
		const rules = this.argumentList();
		if (this.args.length !== rules.length) {
			this.context.addError(
				new ArgumentIc10Error({
					message: i18n.t("error.invalid_argument_count", {
						actual: this.args.length,
						expected: rules.length,
					}),
					severity: ErrorSeverity.Strong,
				}).setLine(this.line),
			);
			return;
		}
		return this.run();
	}

	/**
	 * Registers an error, automatically setting the line
	 * and, for ArgumentIc10Error, the offending argument as well.
	 * @param error Error to register
	 * @param argument Argument that caused the error (optional, needed for ArgumentIc10Error)
	 */
	public addError(error: Ic10Error, argument?: Argument) {
		error.setLine(this.line);
		if (error instanceof ArgumentIc10Error && argument) {
			error.setArgument(argument);
		}
		this.context.addError(error);
	}

	/**
	 * Overrides the end function in Line
	 * @see InstructionLine.end
	 * @returns
	 */
	public end(this: InstructionLine): boolean {
		return false;
	}

	/**
	 * Returns the list of rules for the instruction's arguments:
	 * - allowed substitutions (alias/const/define/label)
	 * - the calculate function for computing the value
	 */
	public abstract argumentList(): InstructionArgument[];

	/**
	 * Implementation of the instruction logic.
	 * getArgumentValue() can safely be used here
	 * to get typed argument values.
	 */
	public abstract run(): void | Promise<void>;

	/**
	 * Returns the computed argument value by index or name.
	 * Performs:
	 * - Resolving the argument name to an index (if a string is passed)
	 * - Checking that the argument and its corresponding rule exist
	 * - Substituting define/alias/const/label depending on the rule's permissions
	 * - Calling rule.calculate for the final value computation
	 * @param indexOrName Index (0-based) or argument name as specified in the rules
	 * @returns Argument value of the required type T (number by default)
	 */
	public getArgumentValue<T = number>(indexOrName: number | string): T {
		const list = this.argumentListCached;

		// Support passing the argument name
		let index: number;
		if (typeof indexOrName === "string") {
			index = list.findIndex((rule) => rule.name === indexOrName);
			if (index === -1) {
				this.context.addError(
					new ArgumentIc10Error({
						message: i18n.t("error.missing_argument", { name: indexOrName }),
						severity: ErrorSeverity.Strong,
					}).setLine(this.line),
				);
				return 0 as T;
			}
		} else {
			index = indexOrName;
		}

		if (typeof this.args[index] === "undefined") {
			// Adapt the message depending on whether a name or an index was passed
			const msg =
				typeof indexOrName === "string"
					? i18n.t("error.missing_argument", { name: indexOrName })
					: i18n.t("error.missing_argument_index", { index });
			this.context.addError(
				new ArgumentIc10Error({
					message: msg,
					severity: ErrorSeverity.Strong,
				}).setLine(this.line),
			);
			return 0 as T;
		}

		const arg = this.args[index];
		if (typeof list[index] === "undefined") {
			this.context.addError(
				new ArgumentIc10Error({
					message:
						typeof indexOrName === "string"
							? i18n.t("error.missing_argument_name", { name: indexOrName })
							: i18n.t("error.missing_argument_index", { index }),
					severity: ErrorSeverity.Strong,
				})
					.setLine(this.line)
					.setArgument(arg),
			);
			return 0 as T;
		}

		const rule = list[index];

		// Substitute define/alias/const/label if the rule allows it
		if (this.context.hasDefines(arg.text)) {
			const define = this.context.getDefines(arg.text)!;
			switch (define.type) {
				case "define":
					if (rule.canBeDefine) arg.text = define.value;
					break;
				case "alias":
					if (rule.canBeAlias) arg.text = define.value;
					break;
				case "const":
					if (rule.canBeConst) arg.text = define.value;
					break;
				case "label":
					if (rule.canBeLabel) arg.text = define.value;
					break;
			}
		}

		// Delegate the final value computation to the rule
		return rule.calculate.call(this, this.context, arg) as T;
	}
}
