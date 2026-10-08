import { ArgumentCalculators } from "../Helpers/ArgumentCalculators.ts";
import { Instruction, type InstructionArgument } from "../Helpers/Instruction.ts";

export class SleepInstruction extends Instruction {
	public argumentList(): InstructionArgument[] {
		return [ArgumentCalculators.anyNumber("second")];
	}
	public run(): void {
		// Seconds of game time. (This used to multiply by 1000 here and again in the context.)
		// In game, `sleep 0` behaves like `yield`; negative values are treated the same way.
		const seconds = this.getArgumentValue<number>("second");
		if (seconds > 0) {
			this.context.sleep(seconds);
		} else {
			this.context.yield();
		}
	}
}
export class YieldInstruction extends Instruction {
	public argumentList(): InstructionArgument[] {
		return [];
	}
	public run(): void {
		this.context.yield();
	}
}

export class HcfInstruction extends Instruction {
	public argumentList(): InstructionArgument[] {
		return [];
	}
	public run(): void | Promise<void> {
		this.context.hcf();
	}
}
