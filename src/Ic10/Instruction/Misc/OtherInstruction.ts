import { ArgumentCalculators } from "../Helpers/ArgumentCalculators.ts";
import { Instruction, type InstructionArgument, type InstructionTestData } from "../Helpers/Instruction.ts";

const expectReg = (register: number, value: number) => ({ type: "register", register, value }) as const;

export class SleepInstruction extends Instruction {
	static override tests(): InstructionTestData[] {
		if (typeof isProd !== "undefined" && isProd) {
			return [];
		}
		// The test runner doesn't advance game time, so these check that each form runs on to the next line.
		return [
			{ title: "seconds", code: "sleep 5\nmove r0 1", expected: [expectReg(0, 1)] },
			{ title: "from a register", code: "move r1 2\nsleep r1\nmove r0 1", expected: [expectReg(0, 1)] },
			{ title: "0, like yield", code: "sleep 0\nmove r0 1", expected: [expectReg(0, 1)] },
			{ title: "negative, like yield", code: "sleep -1\nmove r0 1", expected: [expectReg(0, 1)] },
			{
				title: "one step moves past it",
				code: "sleep 1\nmove r0 1",
				iterations_count: 1,
				expected: [expectReg(0, 0), { type: "loop", nextLineIndex: 1 }],
			},
		];
	}
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
	static override tests(): InstructionTestData[] {
		if (typeof isProd !== "undefined" && isProd) {
			return [];
		}
		return [
			{
				title: "the line after it runs next",
				code: "move r0 1\nyield\nmove r0 2",
				iterations_count: 2,
				expected: [expectReg(0, 1), { type: "loop", nextLineIndex: 2 }],
			},
			{ title: "the script carries on", code: "move r0 1\nyield\nmove r0 2", expected: [expectReg(0, 2)] },
		];
	}
	public argumentList(): InstructionArgument[] {
		return [];
	}
	public run(): void {
		this.context.yield();
	}
}

export class HcfInstruction extends Instruction {
	static override tests(): InstructionTestData[] {
		if (typeof isProd !== "undefined" && isProd) {
			return [];
		}
		// hcf halts the chip (a critical error), so the line after it never runs.
		return [{ code: "move r0 1\nhcf\nmove r0 2", expected: [expectReg(0, 1)] }];
	}
	public argumentList(): InstructionArgument[] {
		return [];
	}
	public run(): void | Promise<void> {
		this.context.hcf();
	}
}
