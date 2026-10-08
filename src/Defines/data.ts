import { BiMap } from "../helpers.ts";
import { GROUPED_CONSTS } from "./consts.ts";
import DEVICES from "./devices.ts";
import ITEMS from "./items.ts";
import REAGENTS from "./reagents.ts";

// Readonly types for greater precision
export type LogicConstType = typeof GROUPED_CONSTS.LogicType;
export type LogicSlotConstType = typeof GROUPED_CONSTS.LogicSlotType;
export type LogicBatchMethodType = typeof GROUPED_CONSTS.LogicBatchMethod;
export type LogicReagentModeType = typeof GROUPED_CONSTS.LogicReagentMode;

export const Logics = new BiMap<keyof LogicConstType, LogicConstType[keyof LogicConstType]>();
export const LogicSlot = new BiMap<keyof LogicSlotConstType, LogicSlotConstType[keyof LogicSlotConstType]>();
export const LogicReagentMode = new BiMap<
	keyof LogicReagentModeType,
	LogicReagentModeType[keyof LogicReagentModeType]
>();
export const LogicBatchMethod = new BiMap<
	keyof LogicBatchMethodType,
	LogicBatchMethodType[keyof LogicBatchMethodType]
>();

// For exact union types of all possible values
export type ReagentHash = (typeof REAGENTS)[number] extends { hash: infer H } ? H : never;
export type ReagentName = (typeof REAGENTS)[number]["name"];

export type ItemHash = (typeof ITEMS)[number] extends { PrefabHash: infer H } ? H : never;
export type ItemName = (typeof ITEMS)[number]["PrefabName"];

export type DeviceHash = {
	[K in keyof typeof DEVICES]: (typeof DEVICES)[K] extends { PrefabHash: infer H } ? H : never;
}[keyof typeof DEVICES];

type DeviceName = (typeof DEVICES)[keyof typeof DEVICES]["PrefabName"];

// Usage
export const Reagents = new BiMap<ReagentHash, ReagentName>();
export const Devices = new BiMap<Exclude<DeviceHash, null>, Exclude<DeviceName, null>>();
export const Items = new BiMap<ItemHash, ItemName>();
REAGENTS.forEach((reagent) => {
	if (reagent.hash) {
		Reagents.set(reagent.hash, reagent.name);
	}
});
ITEMS.forEach((item) => {
	if (item.PrefabHash) {
		Items.set(item.PrefabHash, item.PrefabName);
	}
});
Object.entries(DEVICES).forEach(([_, device]) => {
	if (device.PrefabHash) {
		Devices.set(device.PrefabHash, device.PrefabName as Exclude<DeviceName, null>);
	}
});

// Type-safe population
Object.entries(GROUPED_CONSTS.LogicType).forEach(([key, val]) => {
	Logics.set(key as keyof LogicConstType, val as LogicConstType[keyof LogicConstType]);
});

Object.entries(GROUPED_CONSTS.LogicSlotType).forEach(([key, val]) => {
	LogicSlot.set(key as keyof LogicSlotConstType, val as LogicSlotConstType[keyof LogicSlotConstType]);
});

Object.entries(GROUPED_CONSTS.LogicBatchMethod).forEach(([key, val]) => {
	LogicBatchMethod.set(key as keyof LogicBatchMethodType, val as LogicBatchMethodType[keyof LogicBatchMethodType]);
});
Object.entries(GROUPED_CONSTS.LogicReagentMode).forEach(([key, val]) => {
	LogicReagentMode.set(key as keyof LogicReagentModeType, val as LogicReagentModeType[keyof LogicReagentModeType]);
});

export default { Logics, LogicSlot, LogicReagentMode, LogicBatchMethod, Reagents };
