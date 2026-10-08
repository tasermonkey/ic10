import { LogicSlot } from "../../Defines/data.ts";
import type { SlotsType } from "../../Defines/devices.ts";
import { BiMap } from "../../helpers.ts";
import { ErrorSeverity, RuntimeIc10Error } from "../../Ic10/Errors/Errors.ts";
import i18n from "../../Languages/lang.ts";
import type { Device } from "../Device.ts";
import { DeviceScope, type DeviceScopeConstructor } from "./DeviceScope.ts";

export class ItemEntity {
	private _propertiesRaw: Map<number, number> = new Map();
	private _count: number = 0;

	public readonly hash: number;

	constructor(hash: number, count: number = 1) {
		this.hash = hash;
		this.count = count;
	}

	public get count(): number {
		return this._count;
	}

	public set count(value: number) {
		if (value >= 0) {
			this._count = value;
			this.setProp("Quantity", value);
		}
	}

	public setProp(prop: number | string, value: number): void {
		// Triple check: resolve by key, or by value
		let propCode: number | undefined;
		if (LogicSlot.hasKey(prop)) {
			const code = LogicSlot.getByKey(prop);
			if (typeof code === "number") propCode = code;
		} else if (LogicSlot.hasValue(prop)) {
			propCode = prop as number;
		}
		if (propCode !== undefined) {
			this._propertiesRaw.set(propCode, value);
			return;
		}
		throw "unknown_prop";
		// otherwise ignore the unknown property (or an exception could be thrown)
	}

	public getProp(prop: number | string): number {
		let propCode: number | undefined;
		if (LogicSlot.hasKey(prop)) {
			const code = LogicSlot.getByKey(prop);
			if (typeof code === "number") propCode = code;
		} else if (LogicSlot.hasValue(prop)) {
			propCode = prop as number;
		}
		if (propCode !== undefined) {
			return this._propertiesRaw.get(propCode) ?? 0;
		}
		return 0;
	}
}

export class Slot extends DeviceScope {
	private ITEM: ItemEntity | null = null;
	private logicNameToCode = new BiMap<string, number>();

	public slot: NonNullable<SlotsType>[number];

	constructor(device: Device, slot: NonNullable<SlotsType>[number]) {
		super({ device });
		this.slot = slot;
		// Fill the bidirectional mapping with valid codes only
		slot.logic.forEach((l) => {
			if (LogicSlot.hasKey(l)) {
				const c = LogicSlot.getByKey(l);
				if (typeof c === "number") {
					this.logicNameToCode.set(l, c);
				}
			}
		});
	}

	public getProp(prop: number | string): number {
		if (this.ITEM === null) {
			return 0;
		}
		let propCode: number | undefined;
		// Look up by key/value in the BiMap
		if (this.logicNameToCode.hasKey(prop as string)) {
			propCode = this.logicNameToCode.getByKey(prop as string);
		} else if (this.logicNameToCode.hasValue(prop as number)) {
			propCode = prop as number;
		}
		if (propCode !== undefined) {
			return this.ITEM.getProp(propCode);
		}
		return 0;
	}

	public setProp(prop: number | string, value: number): void {
		if (this.ITEM === null) {
			this.scope.errors.add(
				new RuntimeIc10Error({
					message: i18n.t("error.cannot_set_prop_empty_slot"),
					severity: ErrorSeverity.Strong,
				}),
			);
			return;
		}
		try {
			this.ITEM.setProp(prop, value);
			this.scope.errors.add(
				new RuntimeIc10Error({
					message: i18n.t("error.unknown_set_prop_result"),
					severity: ErrorSeverity.Weak,
				}),
			);
		} catch (e) {
			this.scope.errors.add(
				new RuntimeIc10Error({
					message: i18n.t("error.unknown_slot_prop"),
					severity: ErrorSeverity.Strong,
				}),
			);
		}
	}

	public moveItem(newSlot: Slot): void {
		if (this.ITEM !== null) {
			newSlot.putItem(this.ITEM);
			this.removeItem();
		}
	}

	public putItem(item: ItemEntity, force: boolean = false): void {
		if (this.ITEM !== null && !force) {
			throw new Error(i18n.t("error.slot_not_empty"));
		}
		this.ITEM = item;
	}

	public addItem(count: number = 1): void {
		if (this.ITEM === null) {
			throw new Error(i18n.t("error.cannot_add_item_empty_slot"));
		}
		this.ITEM.count += count;
	}

	public removeItem(count: number = -1): void {
		if (this.ITEM === null) {
			return;
		}
		if (count < 0) {
			// Remove all slot contents
			this.ITEM = null;
			return;
		}
		this.ITEM.count -= count;
		if (this.ITEM.count <= 0) {
			this.ITEM = null;
		}
	}

	public hasItem(): boolean {
		return this.ITEM !== null;
	}

	public getItem(): ItemEntity | null {
		return this.ITEM ?? null;
	}
}

export class DeviceSlots extends DeviceScope {
	private slots: Map<number, Slot> = new Map();

	constructor({ device }: DeviceScopeConstructor) {
		super({ device });
		device?.rawData?.slots?.forEach((slot) => {
			if (slot) {
				this.slots.set(slot.SlotIndex, new Slot(device, slot));
			}
		});
	}

	public hasSlot(slotIndex: number): boolean {
		return this.slots.has(slotIndex);
	}

	public getSlot(slotIndex: number): Slot | undefined {
		return this.slots.get(slotIndex);
	}

	[Symbol.iterator](): IterableIterator<[number, Slot]> {
		return this.slots[Symbol.iterator]();
	}
}
