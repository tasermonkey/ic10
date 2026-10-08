import type { Ic10Error } from "../../Ic10/Errors/Errors.ts";
import { DeviceScope } from "./DeviceScope.ts";

export class DeviceError extends DeviceScope {
	protected $errors: Map<number, Ic10Error> = new Map();

	/**
	 * Getter for the device's error array.
	 */
	public get(): Ic10Error[] {
		// Convert the Map to an array
		return this.$errors.values().toArray();
	}

	/**
	 * Clear all device errors.
	 */
	public reset(): void {
		this.$errors.clear();
	}

	/**
	 * Add an error to the device.
	 * @param error - error object
	 */
	public add(error: Ic10Error): void {
		error.setDevice(this.scope); // Associate the error with the device
		this.$errors.set(error.id, error);
	}
}
