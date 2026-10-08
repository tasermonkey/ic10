/* Auto-generated. Do not edit. */
import { Housing, type SocketDeviceConstructor } from "../Core/Housing.ts";
export class StructureCombustor extends Housing {
	constructor({ ...args }: Omit<SocketDeviceConstructor, "hash" | "pin_count">) {
		super({ ...args, pin_count: 2, hash: -1037204948 });
	}
}
