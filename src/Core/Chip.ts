import CONSTS from "../Defines/consts.ts";
import type { Ic10Runner } from "../Ic10/Ic10Runner.ts";
import { Define } from "../Ic10/Instruction/Helpers/Define.ts";
import { ItemEntity } from "./Device/DeviceSlots.ts";
import type { Housing } from "./Housing.ts";
import { Stack, type StackInterface } from "./Stack.ts";

export type ChipConstructorType = {
	id: number;
	chipHash?: number;
	ic10Code?: string;
	register_length?: number;
	stack_length?: number;
	SP?: number;
	RA?: number;
};

export class Chip extends ItemEntity {
	public registers: Map<number, number> = new Map();
	public readonly id: number;
	public readonly memory: StackInterface;
	public defines: Map<string, Define> = new Map();
	private ic10Code: string;
	public readonly register_length: number;
	public readonly stack_length: number;
	public readonly SP: number;
	public readonly RA: number;
	#housing?: Housing = undefined;

	constructor({
		id,
		chipHash,
		ic10Code = "",
		register_length = 18,
		stack_length = 512,
		SP = 16,
		RA = 17,
	}: ChipConstructorType) {
		super(chipHash ?? -744098481, 1);
		this.id = id;
		this.ic10Code = ic10Code ?? "";
		this.register_length = register_length ?? 18;
		this.stack_length = stack_length ?? 512;
		this.SP = SP ?? 16;
		this.RA = RA ?? 17;
		this.memory = new Stack(this.stack_length);
		this.reset();
	}

	applyHousing(housing: Housing) {
		this.#housing = housing;
	}
	get housing(): Housing | undefined {
		return this.#housing;
	}

	getRunner(): Ic10Runner {
		const runner = this.#housing?.runner;
		if (!runner) {
			throw new Error("Runner not found");
		}
		return runner;
	}

	reset() {
		this.memory.reset();
		this.defines = new Map();
		this.registers = new Map<number, number>();
		for (let i = 0; i < this.register_length; i++) {
			this.registers.set(i, 0);
		}
		Object.entries(CONSTS).forEach(([key, val]) => {
			this.defines.set(key, new Define("const", val));
		});
		this.defines.set("sp", new Define("alias", `r${this.SP}`));
		this.defines.set("ra", new Define("alias", `r${this.RA}`));
	}

	getIc10Code() {
		return this.ic10Code;
	}

	setIc10Code(ic10Code: string) {
		this.ic10Code = ic10Code;
		return this;
	}
}
