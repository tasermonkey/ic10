import i18n from "../../Languages/lang.ts";
import { ErrorSeverity, ReferenceIc10Error } from "../Errors/Errors.ts";
import { Define } from "../Instruction/Helpers/Define.ts";
import { CommentLine, type CommentLineConstructorType } from "./CommentLine.ts";

export type LabelLineConstructorType = {
	label: string;
} & CommentLineConstructorType;

export class LabelLine extends CommentLine {
	public readonly label: string;

	constructor({ contextSwitcher, position, comment, label, originalText }: LabelLineConstructorType) {
		super({ contextSwitcher, position, comment, originalText });
		this.label = label;
	}

	override run(): void {
		if (this.context.hasDefines(this.label)) {
			const old = this.context.getDefines(this.label)!;
			this.context.addError(
				new ReferenceIc10Error({
					message: i18n.t("error.label_already_defined", { label: this.label }),
					severity: old.type === "const" ? ErrorSeverity.Warning : ErrorSeverity.Strong,
				}).setLine(this),
			);
		}
		this.context.setDefines(this.label, new Define("label", this.position));
	}

	override end(): void {
		this.context.setNextLineIndex();
	}
}
