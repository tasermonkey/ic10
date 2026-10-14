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
import { Instruction, type InstructionArgument, type InstructionTestData } from "../Helpers/Instruction.ts";

const expectReg = (register: number, value: number) => ({ type: "register", register, value }) as const;

export class AliasInstruction extends Instruction {
	static override tests(): InstructionTestData[] {
		if (typeof isProd !== "undefined" && isProd) {
			return [];
		}
		return [
			{ title: "a register", code: "alias x r3\nmove x 5", expected: [expectReg(3, 5)] },
			{
				title: "rr0 names the register r0 points at when the alias runs",
				code: "move r0 3\nalias x rr0\nmove r0 4\nmove x 9",
				expected: [expectReg(3, 9), expectReg(4, 0)],
			},
			{
				title: "a later alias of the same name wins",
				code: "alias x r1\nalias x r2\nmove x 4",
				expected: [expectReg(1, 0), expectReg(2, 4)],
			},
			{
				title: "a device pin",
				code: "alias here db\ns here Setting 7\nl r0 here Setting",
				expected: [expectReg(0, 7)],
			},
		];
	}
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
