import { v4 as uuidv4 } from "uuid";
import DEVICES, { type LogicsType } from "../Defines/devices.ts";
import { HashString } from "../helpers.ts";
import { ErrorSeverity, Ic10Error } from "../Ic10/Errors/Errors.ts";
import { crc32 } from "../Ic10/Helpers/functions.ts";
import i18n from "../Languages/lang.ts";
import { DeviceError } from "./Device/DeviceError.ts";
import { DeviceMemory } from "./Device/DeviceMemory.ts";
import { DevicePorts } from "./Device/DevicePorts.ts";
import { DeviceProps } from "./Device/DeviceProps.ts";
import { DeviceReagent } from "./Device/DeviceReagent.ts";
import { DeviceSlots } from "./Device/DeviceSlots.ts";
import type { Network } from "./Network.ts";
import type { StackInterface } from "./Stack.ts";

export type LogicType = NonNullable<LogicsType>[number];

export type DeviceConstructor = {
	name?: string;
	hash: number;
	network?: Network;
	id?: number;
};

/**
 * Abstract device class (Device).
 * Provides the base logic for all devices in the system.
 */
export abstract class Device {
	// Reference to the network the device belongs to
	// Unique device hash (device type identifier)
	public readonly hash: number;
	public readonly prefabName?: HashString;
	private _name!: HashString;
	// Raw device data from DEVICES, looked up by hash
	public readonly rawData: (typeof DEVICES)[keyof typeof DEVICES];

	private _id: number;

	protected readonly $errors: DeviceError;
	protected readonly $ports: DevicePorts;
	protected readonly $props?: DeviceProps = undefined;
	protected readonly $reagents?: DeviceReagent = undefined;
	protected readonly $memory?: StackInterface = undefined;
	protected $slots?: DeviceSlots = undefined;

	/**
	 * Device constructor.
	 * @param network - the network the device belongs to
	 * @param hash - device type hash
	 */
	public constructor({ network, hash, id, name }: DeviceConstructor) {
		this._id = id ?? crc32(uuidv4()); // Generate a unique ID
		this.hash = hash;
		this.rawData = DEVICES[this.hash]; // Get device data by hash

		this.name = name ?? this?.rawData?.PrefabName ?? "";
		if (this?.rawData?.PrefabName) {
			this.prefabName = new HashString(this.rawData.PrefabName);
		}

		this.$errors = new DeviceError({ device: this });
		this.$ports = new DevicePorts({ device: this });
		if (this.rawData === undefined || this.rawData.tags.includes("HasLogic")) {
			this.$props = new DeviceProps({ device: this });
		}
		if (this.rawData === undefined || this.rawData.tags.includes("HasReagent")) {
			this.$reagents = new DeviceReagent({ device: this });
		}
		if (this.rawData === undefined || this.rawData.tags.includes("HasMemory")) {
			this.$memory = new DeviceMemory({ device: this, stack_length: this.rawData?.memorySize ?? 512 });
		}
		if (this.rawData === undefined || this.rawData.tags.includes("HasSlot")) {
			this.$slots = new DeviceSlots({ device: this });
		}

		this.reset(); // Initialize properties and errors
		this.$props?.forceWrite("PrefabHash", hash); // Set the PrefabHash property
		if (this.rawData === undefined) {
			this.$errors.add(
				new Ic10Error({
					message: i18n.t("error.device_not_found_by_hash", { hash }),
					severity: ErrorSeverity.Weak,
				}),
			);
		}
		if (network) {
			network.apply(this);
		}
	}

	get name(): HashString {
		return this._name;
	}

	set name(name: string) {
		this._name = new HashString(name);
	}

	setName(name: HashString) {
		this._name = name;
	}

	get network(): Network {
		return this.$ports.getNetwork();
	}

	get errors(): DeviceError {
		return this.$errors;
	}

	get ports(): DevicePorts {
		return this.$ports;
	}

	get props(): DeviceProps | undefined {
		if (this.$props) {
			return this.$props;
		}
		this.$errors.add(
			new Ic10Error({
				message: i18n.t("error.device_no_props"),
				severity: ErrorSeverity.Weak,
			}),
		);
		return undefined;
	}

	get hasProps(): boolean {
		return this.$props !== undefined;
	}

	get reagents(): DeviceReagent | undefined {
		if (this.$reagents) {
			return this.$reagents;
		}
		this.$errors.add(
			new Ic10Error({
				message: i18n.t("error.device_no_reagents"),
				severity: ErrorSeverity.Weak,
			}),
		);
		return undefined;
	}

	get hasReagents(): boolean {
		return this.$reagents !== undefined;
	}

	get memory(): StackInterface | undefined {
		if (this.$memory) {
			return this.$memory;
		}
		this.$errors.add(
			new Ic10Error({
				message: i18n.t("error.device_no_memory"),
				severity: ErrorSeverity.Weak,
			}),
		);
		return undefined;
	}

	get hasMemory(): boolean {
		return this.$memory !== undefined;
	}

	get slots(): DeviceSlots | undefined {
		if (this.$slots) {
			return this.$slots;
		}
		this.$errors.add(
			new Ic10Error({
				message: i18n.t("error.device_no_slots"),
				severity: ErrorSeverity.Weak,
			}),
		);
		return undefined;
	}

	get hasSlots(): boolean {
		if (this.$slots) {
			return true;
		}
		return false;
	}

	/**
	 * Reset the device: initialize properties, logic and errors.
	 */
	public reset() {
		this.$errors.reset(); // Clear errors
		this.$props?.reset(); // reset properties
		this.$reagents?.reset(); // reset properties
	}

	/**
	 * Getter for the device's unique identifier.
	 */
	public get id(): number {
		return this._id;
	}

	public set id(id: number) {
		this._id = id;
	}
}

// Abstract subclasses for different device types
export abstract class Structure extends Device {}
export abstract class Item extends Device {}
export abstract class Entity extends Device {}
