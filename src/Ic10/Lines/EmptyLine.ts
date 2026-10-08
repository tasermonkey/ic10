import { Line, type LineConstructorType } from "./Line.ts";

export class EmptyLine extends Line {
	constructor({ contextSwitcher, position, originalText = "" }: LineConstructorType) {
		super({ contextSwitcher, position, originalText });
	}

	override run(): void {}

	override end(): void {
		this.context.setNextLineIndex();
	}
	override toString(): string {
		return "";
	}
}
