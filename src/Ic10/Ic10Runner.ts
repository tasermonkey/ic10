import { Random } from "@stationeers-ic/exact-ic10-math";
import { EventEmitter } from "eventemitter3";
import type { Housing } from "../Core/Housing.ts";
import i18n from "../Languages/lang.ts";
import { ContextSwitcher, type contextNames } from "./Context/ContextSwitcher.ts";
import { RealContext } from "./Context/RealContext.ts";
import { SandboxContext } from "./Context/SandboxContext.ts";
import { ErrorSeverity, FatalIc10Error, type Ic10Error, RuntimeIc10Error } from "./Errors/Errors.ts";
import { Argument } from "./Instruction/Helpers/Argument.ts";
import { CommentLine } from "./Lines/CommentLine.ts";
import { EmptyLine } from "./Lines/EmptyLine.ts";
import { InstructionLine } from "./Lines/InstructionLine.ts";
import { LabelLine } from "./Lines/LabelLine.ts";
import type { Line } from "./Lines/Line.ts";

export const RegExpLabelLine = /((?<label>\w+):)\s*(?<comment>#.*)?/im;
export const RegExpInstructionLine = /^(?<instruction>\w+)(?:\s+(?<arguments>.+?))?(?:\s*#(?<comment>.*))?$/im;

export type Ic10RunnerConstructor = {
	housing: Housing;
	jumpLimit?: number;
	randomSeed?: number;
};

// Event types
export interface Ic10RunnerEvents {
	// Core execution events
	run: () => void;
	runEnd: () => void;
	step: (lineIndex: number, line: Line) => void;
	stepEnd: (lineIndex: number, line: Line) => void;

	// Context events
	contextSwitch: (fromContext: string, toContext: string) => void;
	contextInit: (contextName: string) => void;

	// Error events
	error: (error: Ic10Error) => void;
	fatalError: (error: Ic10Error) => void;

	// Line execution events
	lineExecute: (line: Line) => void;
	lineEnd: (line: Line) => void;

	// Execution control events
	stop: () => void;
	reset: () => void;
}

/**
 * Execution context
 * Class that emulates the CPU and RAM for ic10
 */
export class Ic10Runner extends EventEmitter<Ic10RunnerEvents> {
	public readonly contextSwitcher: ContextSwitcher;
	public lines: Line[] = [];
	private readonly jumpLimit: number;
	private executionStopped: boolean = false;
	public readonly randomSeed?: number;
	public readonly random!: Random;

	constructor({ housing, jumpLimit = 1000, randomSeed }: Ic10RunnerConstructor) {
		super();
		this.randomSeed = randomSeed ?? new Random().next();

		this.jumpLimit = jumpLimit;
		this.contextSwitcher = new ContextSwitcher<contextNames>({
			contexts: {
				real: new RealContext({ housing, name: "real" }),
				sandbox: new SandboxContext({
					id: 0,
					name: "sandbox",
					ic10Code: housing.chip?.getIc10Code() ?? "",
					stack_length: housing.chip?.memory.length,
					register_length: housing.chip?.registers.size,
				}),
			},
			defaultContext: "sandbox",
		});
		housing.applyRunner(this);
	}

	get context() {
		return this.contextSwitcher.context;
	}

	public get realContext() {
		return this.contextSwitcher.getContext("real");
	}

	public get sanboxContext() {
		return this.contextSwitcher.getContext("sandbox");
	}

	public switchContext(context: "real" | "sandbox" | undefined = undefined) {
		const previousContext = this.contextSwitcher.name;

		if (context) {
			if (this.contextSwitcher.name !== context) {
				this.contextSwitcher.switchContext(context);
				this.emit("contextSwitch", previousContext, context);
				this.init(false);
			}
		} else {
			const newContext = this.context instanceof RealContext ? "sandbox" : "real";
			this.contextSwitcher.switchContext(newContext);
			this.emit("contextSwitch", previousContext, newContext);
			this.init(false);
		}
		return this;
	}

	public init(reset: boolean = true) {
		this.emit("reset");
		this.lines = this.lexer(this.context.getIc10Code());
		this.executionStopped = false;
		if (reset) {
			this.context.reset(); // Add a reset() method to Context
		}
		this.lines.filter((l) => l instanceof LabelLine).forEach((l) => l.run());
		this.emit("contextInit", this.contextSwitcher.name);
		return this;
	}

	public async step(): Promise<boolean> {
		const currentLineIndex = this.context.getNextLineIndex();

		if (this.executionStopped) {
			return false;
		}

		if (this.context.getJumpsCount() > this.jumpLimit) {
			const error = new RuntimeIc10Error({
				message: i18n.t("error.jump_limit_exceeded"),
				line: currentLineIndex,
				severity: ErrorSeverity.Critical,
			});
			this.addError(error);
			this.emit("fatalError", error);
			this.executionStopped = true;
			this.emit("stop");
			return false;
		}

		if (currentLineIndex >= this.lines.length) {
			this.executionStopped = true;
			this.emit("stop");
			return false;
		}

		const line = this.lines[currentLineIndex];
		if (typeof line === "undefined") {
			const error = new RuntimeIc10Error({
				message: i18n.t("error.line_not_found"),
				line: currentLineIndex,
				severity: ErrorSeverity.Critical,
			});
			this.addError(error);
			this.emit("fatalError", error);
			this.executionStopped = true;
			this.emit("stop");
			return false;
		}

		// Step start event
		this.emit("step", currentLineIndex, line);
		this.emit("lineExecute", line);

		this.context.setExecuteLine(line);
		await line.runCommentBeforeRun();
		// Execute the current line
		if (line instanceof InstructionLine) {
			await line.run();
		}
		await line.runCommentAfterRun();
		line.end();

		// Step end event
		this.emit("stepEnd", currentLineIndex, line);
		this.emit("lineEnd", line);

		this.context.collectErrors();
		if (this.context.criticalError !== false) {
			this.executionStopped = true;
			this.emit("stop");
			return false;
		}
		return true;
	}

	public async run() {
		this.emit("run");
		this.init();
		let continueRun: boolean;
		do {
			continueRun = await this.step();
		} while (continueRun && !this.executionStopped);
		this.emit("runEnd");
		return this;
	}

	public addError(error: Ic10Error): this {
		this.context.addError(error);
		this.emit("error", error);
		return this;
	}

	public lexer(code: string): Line[] {
		const random = new Random(this.randomSeed);
		let position = -1;
		return code
			.split("\n")
			.map((line) => {
				position++;
				const trimLine = line.trim();
				if (trimLine) {
					if (trimLine.startsWith("#")) {
						return new CommentLine({
							randomSeed: random.next(),
							contextSwitcher: this.contextSwitcher,
							position,
							originalText: line,
							comment: trimLine.slice(1),
						});
					}
					const instructionMatches = RegExpInstructionLine.exec(trimLine);
					if (instructionMatches && instructionMatches.groups?.instruction) {
						let args: Argument[] = [];
						if (instructionMatches.groups?.arguments) {
							args = this.parseArguments(
								instructionMatches.groups?.arguments,
								line.indexOf(instructionMatches.groups?.arguments),
							);
						}
						return new InstructionLine({
							randomSeed: random.next(),
							contextSwitcher: this.contextSwitcher,
							position,
							originalText: line,
							comment: instructionMatches.groups?.comment,
							instruction: instructionMatches.groups?.instruction,
							args: args,
						});
					}
					const labelMatches = RegExpLabelLine.exec(trimLine);
					if (labelMatches && labelMatches.groups?.label) {
						return new LabelLine({
							randomSeed: random.next(),
							contextSwitcher: this.contextSwitcher,
							position,
							originalText: line,
							comment: labelMatches.groups?.comment,
							label: labelMatches.groups?.label,
						});
					}
					this.addError(
						new FatalIc10Error({
							message: i18n.t("error.unknown_line"),
							severity: ErrorSeverity.Strong,
							context: this.context,
							line: position,
							start: 0,
							length: line.length,
							originalText: line,
						}),
					);
				}
				return new EmptyLine({
					randomSeed: random.next(),
					contextSwitcher: this.contextSwitcher,
					position,
					originalText: line,
				});
			})
			.filter(Boolean);
	}

	private parseArguments(input: string, offset: number): Argument[] {
		const result: Argument[] = [];
		let i = 0;
		const len = input.length;

		while (i < len) {
			// Skip whitespace
			while (i < len && /\s/.test(input[i] as string)) i++;
			if (i >= len) break;

			const argStart = i;

			// Check for an identifier with a parenthesized argument, e.g. HASH("...")
			const funcMatch = input.slice(i).match(/^([A-Za-z_][A-Za-z0-9_]*)\(/);
			if (funcMatch && funcMatch[1]) {
				const funcName = funcMatch[1];
				i += funcName.length + 1; // skip the identifier and (

				let depth = 1;
				let inQuotes = false;
				while (i < len && depth > 0) {
					const ch = input[i];
					if (ch === '"') {
						inQuotes = !inQuotes;
					} else if (!inQuotes) {
						if (ch === "(") depth++;
						else if (ch === ")") depth--;
					}
					i++;
				}
				result.push(
					new Argument({
						start: offset + argStart,
						length: i - argStart,
						text: input.slice(argStart, i),
					}),
				);
				continue;
			}

			// Regular argument up to the next space
			let argEnd = i;
			while (argEnd < len && !/\s/.test(input[argEnd] as string)) argEnd++;
			result.push(
				new Argument({
					start: offset + argStart,
					length: argEnd - argStart,
					text: input.slice(argStart, argEnd),
				}),
			);
			i = argEnd;
		}

		return result;
	}

	// Additional methods for controlling execution
	public stopExecution(): void {
		this.executionStopped = true;
		this.emit("stop");
	}

	public isStopped(): boolean {
		return this.executionStopped;
	}
}

export type ValidateOptions = {
	jumpLimit?: number;
	randomSeed?: number;
	stack_length?: number;
	register_length?: number;
};

export class ValidateIc10Runner extends Ic10Runner {
	private constructor(code: string, options?: ValidateOptions) {
		const randomSeed = options?.randomSeed ?? new Random().next();
		const jumpLimit = options?.jumpLimit ?? 1000;

		// Create a temporary sandbox context
		const sandboxContext = new SandboxContext({
			id: 0,
			name: "validation",
			ic10Code: code,
			stack_length: options?.stack_length ?? 512,
			register_length: options?.register_length ?? 18,
		});

		// Create a temporary ContextSwitcher
		const contextSwitcher = new ContextSwitcher<"validation">({
			contexts: {
				validation: sandboxContext,
			},
			defaultContext: "validation",
		});

		// Create a fake housing (minimal stub)
		const fakeHousing = {
			chip: null,
			applyRunner: () => {},
		} as any;

		super({ housing: fakeHousing, jumpLimit, randomSeed });

		// Swap in the contextSwitcher
		(this as any).contextSwitcher = contextSwitcher;
	}

	public static async validate(code: string, options?: ValidateOptions): Promise<Ic10Error[]> {
		const validator = new ValidateIc10Runner(code, options);

		try {
			await validator.run();
		} catch (error) {
			// Errors should already be in the context
		}

		return validator.context.errors;
	}
}
