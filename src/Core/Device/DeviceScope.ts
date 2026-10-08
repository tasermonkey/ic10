import type { Device } from "../Device.ts";

export type DeviceScopeConstructor = {
	device: Device;
};

export abstract class DeviceScope {
	protected scope: Device;

	constructor({ device }: DeviceScopeConstructor) {
		this.scope = device;
	}
}
