import { Random } from "@stationeers-ic/exact-ic10-math";
import type { ContextSwitcher } from "../Context/ContextSwitcher.ts";

export type LineConstructorType = {
	contextSwitcher: ContextSwitcher;
	position: number;
	originalText: string;
	comment?: string;
	randomSeed?: number;
};

export abstract class Line {
	public readonly position: number;
	public readonly originalText: string;
	public readonly text: string;
	public readonly contextSwitcher: ContextSwitcher;
	public readonly randomGenerator: Random;
	public comment: string = "";
	public readonly commnetFunctions: RegExpExecArray[];

	public constructor({ contextSwitcher, position, originalText, comment = "", randomSeed }: LineConstructorType) {
		this.position = position;
		this.originalText = originalText;
		this.text = originalText.replace(/#.*$/, "").trim();
		this.contextSwitcher = contextSwitcher;
		this.comment = comment;
		this.commnetFunctions = Array.from(originalText.matchAll(this.regex));
		this.randomGenerator = this.initializeRandomGenerator(randomSeed);
	}
	private regex = /#(?<fn>\w+):(?<arg>[^;]+);/gm;

	public runCommentBeforeRun(): void | Promise<void> {}
	public runCommentAfterRun(): void | Promise<void> {
		for (const match of this.commnetFunctions) {
			if (!match.groups) continue;

			const { fn, arg } = match.groups;
			const args = arg.split(",");
			switch (fn) {
				case "debug":
					this.context.debug(...args);
					break;

				default:
					break;
			}
		}
	}

	/**
	 * Initializes the random number generator using the following source priority:
	 * 1. Explicitly passed randomSeed
	 * 2. Value from a comment in the format "seed:NUMBER"
	 * 3. Line position as a fallback value
	 */
	private initializeRandomGenerator(randomSeed?: number): Random {
		if (typeof randomSeed !== "undefined") {
			return new Random(randomSeed);
		}

		const seedFromComment = this.extractSeedFromComment(this.comment);
		if (seedFromComment !== null) {
			return new Random(seedFromComment);
		}

		return new Random();
	}

	/**
	 * Extracts the seed value from the comment using a regular expression.
	 * Returns null if the value is not found or invalid.
	 */
	private extractSeedFromComment(comment: string): number | null {
		for (const match of this.commnetFunctions) {
			if (!match.groups) continue;

			const { fn, arg } = match.groups;
			if (fn === "seed") {
				const seed = parseInt(arg, 10);
				return Number.isNaN(arg) ? null : seed;
			}
		}
		return null;
	}

	public get context() {
		return this.contextSwitcher.context;
	}

	/**
	 * runs the line
	 */
	abstract run(): void | Promise<void>;

	/**
	 * action after running the line. Usually advances the cursor to the next step
	 */
	abstract end(): void;

	toString(customComment?: string): string {
		if (this.comment || customComment) {
			const comment = `${this.comment} ${customComment}`.trim();
			if (this.text) {
				return `${this.text} #${comment}`;
			}
			return `# ${comment}`;
		}
		return this.originalText;
	}
}
