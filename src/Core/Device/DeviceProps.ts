import { Logics } from "../../Defines/data.ts";
import { BiMap } from "../../helpers.ts";
import { ErrorSeverity, Ic10Error } from "../../Ic10/Errors/Errors.ts";
import i18n from "../../Languages/lang.ts";
import type { LogicType } from "../Device.ts";
import { DeviceScope, type DeviceScopeConstructor } from "./DeviceScope.ts";

type prop = number | string;

interface PropIterator
	extends Iterator<{
		logicName: string;
		logicCode: number;
		canRead: boolean;
		canWrite: boolean;
		value: number;
	}> {
	[Symbol.iterator](): PropIterator;
}

export class DeviceProps extends DeviceScope {
	constructor(props: DeviceScopeConstructor) {
		super(props);
		this.initProps();
	}
	// Raw device properties, stored by numeric code
	#propertiesRaw: Map<number, number> = new Map();
	// BiMap linking logic names to codes
	private logicNameToCode = new BiMap<string, number>();
	// Logic metadata (access permissions)
	private logicMeta: Map<
		number,
		{
			canWrite: boolean;
			canRead: boolean;
		}
	> = new Map();

	public getRaw() {
		return Object.fromEntries(this.#propertiesRaw);
	}

	public reset() {
		this.#propertiesRaw.clear();
	}

	public read(prop: prop): number {
		const logicCode = this.resolveLogicCode(prop);
		if (logicCode === undefined) {
			this.scope.errors.add(
				new Ic10Error({
					message: i18n.t("error.device_property_not_found", { hash: this.scope.hash, prop }),
					severity: ErrorSeverity.Warning,
				}),
			);
			return 0;
		}

		const meta = this.logicMeta.get(logicCode);
		if (meta?.canRead) {
			return this.#propertiesRaw.get(logicCode) ?? 0;
		} else {
			const logicName = this.logicNameToCode.getByValue(logicCode) ?? String(prop);
			this.scope.errors.add(
				new Ic10Error({
					message: i18n.t("error.device_no_permission_to_read", {
						hash: this.scope.hash,
						logicName,
					}),
					severity: ErrorSeverity.Warning,
				}),
			);
			return 0;
		}
	}

	public write(prop: prop, value: number): void {
		const logicCode = this.resolveLogicCode(prop);
		if (logicCode === undefined) {
			this.scope.errors.add(
				new Ic10Error({
					message: i18n.t("error.device_property_not_found", { hash: this.scope.hash, prop }),
					severity: ErrorSeverity.Strong,
				}),
			);
			return;
		}

		const meta = this.logicMeta.get(logicCode);
		if (meta?.canWrite) {
			this.#propertiesRaw.set(logicCode, value);
		} else {
			const logicName = this.logicNameToCode.getByValue(logicCode) ?? String(prop);
			this.scope.errors.add(
				new Ic10Error({
					message: i18n.t("error.device_no_permission_to_write", {
						hash: this.scope.hash,
						logicName,
					}),
					severity: ErrorSeverity.Strong,
				}),
			);
		}
	}

	/**
	 * Resolves a prop (name or code) to a logic code
	 */
	private resolveLogicCode(prop: prop): number | undefined {
		if (typeof prop === "number") {
			return this.logicNameToCode.hasValue(prop) ? prop : undefined;
		}
		return this.logicNameToCode.getByKey(prop);
	}

	/**
	 * Force-set a property value by name or code.
	 * @param prop - property name or code
	 * @param value - property value
	 */
	public forceWrite(prop: prop, value: number) {
		const logicCode = this.resolveLogicCode(prop);
		if (logicCode === undefined) {
			throw new Error(i18n.t("error.logic_not_found_in_global", { prop }));
		}
		this.#propertiesRaw.set(logicCode, value);
	}

	/**
	 * Force-get a value without raising errors.
	 * @param prop - property name or code
	 * @param value - property value
	 */
	public forceRead(prop: prop): number | undefined {
		const logicCode = this.resolveLogicCode(prop);
		if (logicCode === undefined) {
			return undefined;
		}
		return this.#propertiesRaw.get(logicCode);
	}

	/**
	 * Initialize the device's properties and logic.
	 * If the device is not found in DEVICES, a warning is added.
	 */
	public initProps() {
		if (typeof this.scope.rawData === "undefined") {
			// Device not found
			this.scope.errors.add(
				new Ic10Error({
					message: i18n.t("error.device_not_found_in_init", { hash: this.scope.hash }),
					severity: ErrorSeverity.Warning,
				}),
			);
			// Add default logic for every LogicType from CONSTS
			for (const [key, _value] of Logics) {
				this.addLogic({
					name: key,
					permissions: ["Read", "Write"],
				});
			}
		} else {
			// If device data exists, initialize logic from rawData
			const l = this.scope.rawData?.logics;
			if (l) {
				l.forEach((logic) => {
					this.addLogic(logic);
				});
			}
		}
	}

	/**
	 * Finds a logic code by name or code in the global Logics
	 */
	private findLogicCode(prop: prop): number | undefined {
		if (typeof prop === "string") {
			if (!Logics.hasKey(prop)) {
				this.scope.errors.add(
					new Ic10Error({
						message: i18n.t("error.logic_not_found_in_global", { prop }),
						severity: ErrorSeverity.Critical,
					}),
				);
				return undefined;
			}
			return Logics.getByKey(prop);
		}
		if (!Logics.hasValue(prop)) {
			this.scope.errors.add(
				new Ic10Error({
					message: i18n.t("error.logic_code_not_found_in_global", { prop }),
					severity: ErrorSeverity.Critical,
				}),
			);
			return undefined;
		}
		return prop;
	}

	/**
	 * Add logic (a property with permissions) to the device.
	 * @param logic - logic object with a name and permissions
	 */
	private addLogic(logic: LogicType) {
		const code = this.findLogicCode(logic.name);
		if (code !== undefined) {
			this.logicNameToCode.set(logic.name, code);
			this.logicMeta.set(code, {
				canRead: logic.permissions.includes("Read"),
				canWrite: logic.permissions.includes("Write"),
			});
		}
	}

	public canLoad(prop: prop): boolean {
		const logicCode = this.resolveLogicCode(prop);
		if (logicCode === undefined) return false;
		return this.logicMeta.get(logicCode)?.canRead ?? false;
	}

	public canStore(prop: prop): boolean {
		const logicCode = this.resolveLogicCode(prop);
		if (logicCode === undefined) return false;
		return this.logicMeta.get(logicCode)?.canWrite ?? false;
	}

	[Symbol.iterator](): PropIterator {
		const entries = Array.from(this.#propertiesRaw);
		let i = 0;

		return {
			[Symbol.iterator]() {
				return this;
			},
			next: (): IteratorResult<{
				logicName: string;
				logicCode: number;
				canRead: boolean;
				canWrite: boolean;
				value: number;
			}> => {
				while (i < entries.length) {
					const [logicCode, value] = entries[i++];
					const logicName = this.logicNameToCode.getByValue(logicCode);
					const meta = this.logicMeta.get(logicCode);

					if (logicName && meta) {
						return {
							done: false,
							value: {
								logicName,
								logicCode,
								canRead: meta.canRead,
								canWrite: meta.canWrite,
								value,
							},
						};
					}
				}
				return { value: undefined, done: true };
			},
		};
	}
}
