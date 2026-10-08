/* Auto-generated. Do not edit. */
import { Housing, type SocketDeviceConstructor } from "../Core/Housing.ts";
export class StructureNitrolyzer extends Housing {
	constructor({ ...args }: Omit<SocketDeviceConstructor, "hash" | "pin_count">) {
		super({ ...args, pin_count: 2, hash: 1898243702 });
	}
}
