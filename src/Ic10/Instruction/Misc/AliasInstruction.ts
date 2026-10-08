import i18n from "../../../Languages/lang.ts";
import { ErrorSeverity, RuntimeIc10Error, TypeIc10Error } from "../../Errors/Errors.ts";
import {
	getRegister,
	recursiveDevice,
	recursiveRegister,
	singleDevice,
	singleRegister,
} from "../../Helpers/ArgumentParse.ts";
import { Define } from "../Helpers/Define.ts";
import { Instruction, type InstructionArgument } from "../Helpers/Instruction.ts";

export class AliasInstruction extends Instruction {
	override argumentList(): InstructionArgument[] {
		return [
			{
				name: "alias",
				canBeLabel: false,
				canBeAlias: false,
				canBeConst: false,
				canBeDefine: false,
				calculate: function (_context, argument) {
					const t = argument.text;
					if (this.context.hasDefines(t)) {
						const v = this.context.getDefines(t)!;
						// if the value is a string, it is an alias and can be redefined
						this.addError(
							new RuntimeIc10Error({
								message: i18n.t("error.alias_already_defined", { alias: t }),
								severity:
									v.type === "alias"
										? ErrorSeverity.Weak
										: v.type === "const"
											? ErrorSeverity.Warning
											: ErrorSeverity.Strong,
							}),
							argument,
						);
					}
					return t;
				},
			},
			{
				name: "value",
				canBeLabel: false,
				canBeAlias: false,
				canBeConst: false,
				canBeDefine: false,
				calculate: function (context, argument) {
					const t = argument.text;
					if (
						!singleRegister.test(t) &&
						!singleDevice.test(t) &&
						!recursiveRegister.test(t) &&
						!recursiveDevice.test(t)
					) {
						this.addError(
							new TypeIc10Error({
								message: i18n.t("error.argument_must_be_register_or_device"),
							}),
							argument,
						);
					}
					if (recursiveRegister.test(t)) {
						const r = getRegister(context, t);
						if (r === false) {
							this.addError(
								new RuntimeIc10Error({
									message: i18n.t("error.register_not_found_in_context", { register: t }),
								}),
								argument,
							);
						}
						return new Define("alias", `r${r}`);
					}
					return new Define("alias", t);
				},
			},
		];
	}

	override run(): void {
		const r = this.getArgumentValue<string>("alias");
		const v = this.getArgumentValue<Define>("value");
		if (this.context.hasDefines(r)) {
			const old = this.context.getDefines(r)!;
			if (old.type === "alias") {
				this.context.setDefines(r, v);
			}
		} else {
			this.context.setDefines(r, v);
		}
	}
}
