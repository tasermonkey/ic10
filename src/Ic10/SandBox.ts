import { Chip, type ChipConstructorType } from "../Core/Chip.ts";
import { Device } from "../Core/Device.ts";
import { Housing } from "../Core/Housing.ts";
import { Network } from "../Core/Network.ts";

export class SandBoxHousing extends Housing {
	constructor(params: ChipConstructorType) {
		super({
			hash: 0,
			network: new SandBoxNetwork(),
			chip: new SandBoxChip(params),
		});
	}
}

export class SandBoxNetwork extends Network {}

export class SandBoxDevice extends Device {}

export class SandBoxChip extends Chip {
	constructor({ ic10Code }: ChipConstructorType) {
		super({
			id: 0,
			ic10Code,
		});
	}
}
