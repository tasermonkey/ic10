import {
	array,
	type InferOutput,
	type Literal,
	literal,
	minLength,
	minValue,
	number,
	object,
	optional,
	pipe,
	regex,
	strictObject,
	string,
	union,
} from "valibot";
import { GROUPED_CONSTS } from "../Defines/consts.ts";
import { type ItemName, Items, type ReagentName, Reagents } from "../Defines/data.ts";
import { DeviceClassesByBase, DevicesByPrefabName } from "../Devices/index.ts";

function picklist<T extends Literal>(values: T[]) {
	return union(values.map((value) => literal(value)));
}

// --- Helper functions for building unions from keys ---

/**
 * Creates a picklist from an array or iterator, removing duplicates
 */
function unionLiterals<T extends string>(items: IterableIterator<T> | T[]) {
	const uniqueItems = Array.from(new Set(items));
	return picklist(uniqueItems);
}

/**
 * Creates a picklist from an object's keys with optional filtering
 */
function unionFromKeys<T extends Record<string, unknown>>(obj: T, filter?: (key: string) => boolean) {
	const keys = Object.keys(obj).filter(filter ?? (() => true));
	return picklist(keys);
}

// --- PrefabName Schemas ---

export const PrefabNameSchema = unionFromKeys(DevicesByPrefabName);

export const PrefabNameDeviceSchema = unionFromKeys(
	Object.assign(DeviceClassesByBase.Structure, DeviceClassesByBase.Item),
);

export const PrefabNameHousingSchema = unionFromKeys(DeviceClassesByBase.Housing);

// --- Props Schemas ---

/** Initial value of one logic property on a device, e.g. `{ name: "Temperature", value: 293.15 }`. */
export const PropsSchema = strictObject({
	/**
	 * LogicType name, as used in IC10 (`l r0 d0 Temperature`). Channel0–7 are excluded here: those
	 * belong to a network (`NetworkSchema.props`). The device must support the property.
	 */
	name: unionFromKeys(GROUPED_CONSTS.LogicType, (key) => !key.startsWith("Channel")),
	/**
	 * Starting value. Written with `forceWrite`, so read-only properties (sensor readings such as
	 * `Temperature` or `PressureOutput`) can be set too. Units are the game's: kelvin, kPa, ratios 0–1.
	 */
	value: number(),
});

/** Initial value of one data channel on a network, e.g. `{ name: "Channel0", value: 1 }`. */
export const ChannelPropsSchema = strictObject({
	/** `Channel0` … `Channel7`, read and written in IC10 through a port, e.g. `l r0 d0:0 Channel0`. */
	name: unionFromKeys(GROUPED_CONSTS.LogicType, (key) => key.startsWith("Channel")),
	/** Starting value of the channel. */
	value: number(),
});

// --- Port Schema ---

const PORT_TYPES = [
	"default",
	"Chute Input",
	"Chute Output",
	"Chute Output 2",
	"Connection",
	"Data Input",
	"Data Output",
	"Landing Pad Input",
	"Pipe Input",
	"Pipe Input 2",
	"Pipe Liquid Input",
	"Pipe Liquid Input 2",
	"Pipe Liquid Output",
	"Pipe Liquid Output 2",
	"Pipe Output",
	"Pipe Output 2",
	"Pipe Waste",
	"Power Input",
	"Power Output",
	"Power and Data Input",
	"Power and Data Output",
];

/** Connects one of a device's ports to a network. */
export const PortSchema = strictObject({
	/**
	 * Which connection on the device, e.g. `"Pipe Input"` or `"Data Input"`. `"default"` connects the
	 * device without naming a port (usually what you want for a data network). A named port must exist
	 * on the device and suit the network's type, or loading fails.
	 */
	port: picklist(PORT_TYPES),
	/** `id` of an entry in `networks`. */
	network: pipe(string(), minLength(1)),
});

// --- Pin Schema ---

const PIN_SHORTCUTS = ["d0", "d1", "d2", "d3", "d4", "d5"];

/** Plugs a device into one of a housing's pins (`d0`–`d5`), as set with a screwdriver in game. */
export const PinSchema = strictObject({
	/** The housing pin, `"d0"` … `"d5"`. The chip addresses the device as this pin (`l r0 d0 On`). */
	pin: pipe(union([picklist(PIN_SHORTCUTS), pipe(string(), regex(/^d\d+$/))])),
	/** `id` of the device to plug in. It must be on the same network as the housing. */
	device: pipe(number(), minValue(0)),
});

// --- Slot Schema ---

/** An item placed in one of a device's slots. Ignored if the device has no slots. */
export const SlotSchema = strictObject({
	/** Slot number, from 0 (as in `ls r0 d0 0 Quantity`). The slot must exist on the device. */
	index: pipe(number(), minValue(0)),
	/** Item prefab name, e.g. `"ItemIronOre"`. */
	item: unionLiterals<ItemName>(Items.values()),
	/** Stack size, at least 1. */
	amount: pipe(number(), minValue(1)),
});

// --- Reagent Schema ---

/** A reagent held by a device (e.g. a fabricator's stock). Ignored if the device has no reagents. */
export const ReagentSchema = strictObject({
	/** Reagent name, e.g. `"Iron"`; read in IC10 with `lr`. */
	name: unionLiterals<ReagentName>(Reagents.values()),
	/** Amount, at least 1. */
	amount: pipe(number(), minValue(1)),
});

// --- Register Schema ---

/** Initial value of one chip register. */
export const RegisterSchema = strictObject({
	/** Register name, `"r0"` … `"r17"` (`sp` is r16 and `ra` is r17 by default). */
	name: pipe(string(), regex(/^r\d+$/)),
	/** Starting value. */
	value: number(),
});

// --- Chip Schema ---

/** An IC10 chip: its program and starting state. Put it in a housing with `HousingSchema.chip`. */
export const ChipSchema = strictObject({
	/**
	 * Chip id, referenced by a housing's `chip` field. Use a non-zero id: the parser treats a
	 * housing's `chip: 0` as "no chip".
	 */
	id: pipe(number(), minValue(0)),
	/** Number of registers. Default 18 (r0–r17); 0 also means the default. */
	register_length: optional(pipe(number(), minValue(0))),
	/** Stack size in entries. Default 512; 0 also means the default. */
	stack_length: optional(pipe(number(), minValue(0))),
	/** Index of the register used as `sp` (stack pointer). Default 16. */
	SP: optional(number()),
	/** Index of the register used as `ra` (return address, set by `jal`). Default 17. */
	RA: optional(number()),
	/** Starting register values. Unlisted registers start at 0. */
	registers: optional(array(RegisterSchema)),
	/** Values pushed onto the stack in order (index 0 first); `sp` is set to their count. */
	stack: optional(array(number())),
	/** The IC10 program source. Use `\n` line endings. */
	code: optional(string()),
	/** Line the chip was on. Written by debug exports only; ignored when loading. */
	lineNumber: optional(pipe(number(), minValue(0))),
});

// --- Device Schemas ---

const BaseDeviceSchema = {
	/**
	 * The device's reference ID, unique in the environment. IC10 reads and writes it by ID with
	 * `ld`/`sd` (`ld r0 $1488 On`), and pins and `HousingSchema.chip` refer to it.
	 */
	id: pipe(number(), minValue(0)),
	/** Labeller name. `lbn`/`sbn` match on its hash, `HASH("name")`. */
	name: optional(pipe(string(), minLength(1))),
	/** Network connections. A device with no ports isn't on any network, so the chip can't reach it. */
	ports: optional(array(PortSchema)),
	/** Starting values of logic properties (`Mode`, `On`, `Temperature`, …). */
	props: optional(array(PropsSchema)),
	/** Items in the device's slots. */
	slots: optional(array(SlotSchema)),
	/** Reagents held by the device. */
	reagents: optional(array(ReagentSchema)),
};

const HousingOnlySchema = {
	/** `id` of the entry in `chips` to insert. Must be non-zero (see `ChipSchema.id`). */
	chip: optional(pipe(number(), minValue(0))),
	/** Devices plugged into `d0`–`d5`. The housing itself is `db`. */
	pins: optional(array(PinSchema)),
};

/** A chip housing (e.g. `StructureCircuitHousing`). Each housing with a chip gets its own runner. */
export const HousingSchema = strictObject({
	...BaseDeviceSchema,
	PrefabName: PrefabNameHousingSchema,
	...HousingOnlySchema,
});

/** Any other device (structure or item) on the networks, e.g. a vent or a gas sensor. */
export const DeviceSchema = strictObject({
	...BaseDeviceSchema,
	PrefabName: PrefabNameDeviceSchema,
});

// Type-only views used to build the exported device types below (see the note there).
const DeviceBaseObject = strictObject(BaseDeviceSchema);
const HousingOnlyObject = strictObject(HousingOnlySchema);

// --- Network Schemas ---

const NETWORK_TYPES = ["data", "power", "chute", "liquid", "pipe", "wireless", "landing"];

export const NetworkTypeSchema = picklist(NETWORK_TYPES);

/** A cable or pipe network that devices connect to through `ports`. */
export const NetworkSchema = strictObject({
	/** Name for this network, referenced by `PortSchema.network`, e.g. `"data"`. */
	id: pipe(string(), minLength(1)),
	/**
	 * Network kind: `data` (cables; what `l`/`s`, batch ops and `ld`/`sd` see), `power`, `pipe`,
	 * `liquid`, `chute`, `wireless` or `landing`.
	 */
	type: NetworkTypeSchema,
	/** Starting values of the network's data channels (`Channel0`–`Channel7`). */
	props: optional(array(ChannelPropsSchema)),
});

// --- Environment Schema ---
const semVerPattern =
	/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
/** Descriptive metadata. Kept with the environment; it doesn't affect the simulation. */
const ProjectSchema = object({
	/** Project name. */
	name: optional(pipe(string(), minLength(1))),
	/** Author. */
	author: optional(pipe(string(), minLength(1))),
	/** What the environment is for. */
	description: optional(pipe(string(), minLength(1))),
	/** Project version, SemVer (e.g. `"1.0.0"`). */
	version: optional(pipe(string(), regex(semVerPattern, "Must be SemVer eg: (1.0.0)"))),
	/** Free-form tags. */
	tags: optional(pipe(array(string()), minLength(1))),
});
/**
 * A whole emulated world: chips, devices and the networks joining them. Load it with
 * `Builder.from(JSON.stringify(env))`.
 */
export const EnvSchema = object({
	/** Format version. Only `1` exists. */
	version: picklist([1]),
	/** Optional descriptive metadata. */
	project: optional(ProjectSchema),
	/** Chips and their programs. A chip runs once a housing references it. */
	chips: array(ChipSchema),
	/** Housings and other devices. A housing's `pins` may refer to devices listed after it. */
	devices: array(union([DeviceSchema, HousingSchema])),
	/** Networks, referenced by the devices' `ports`. */
	networks: array(NetworkSchema),
});

// --- Exported Types ---

// The device types are assembled from shared parts instead of being inferred from DeviceSchema and
// HousingSchema directly. `devices` holds either kind, and for a field both kinds have, TypeScript
// would otherwise make a merged union property with no documentation, so hovering `ports` or
// `PrefabName` in an environment literal showed nothing. Shared parts keep one documented symbol.
// The shapes are identical to the inferred ones.

type DeviceBase = InferOutput<typeof DeviceBaseObject> & {
	/**
	 * Prefab name of the device, e.g. `"StructureActiveVent"`, `"StructureGasSensor"`, or for a
	 * housing `"StructureCircuitHousing"` / `"StructureCircuitHousingCompact"`.
	 */
	PrefabName: InferOutput<typeof PrefabNameDeviceSchema>;
};

/** Descriptive metadata of an environment. */
export type ProjectSchema = InferOutput<typeof ProjectSchema>;
/** A whole emulated world: chips, devices and the networks joining them. */
export type EnvSchema = Omit<InferOutput<typeof EnvSchema>, "devices"> & {
	/** Housings and other devices. A housing's `pins` may refer to devices listed after it. */
	devices: (DeviceSchema | HousingSchema)[];
};
/** Connects one of a device's ports to a network. */
export type PortSchema = InferOutput<typeof PortSchema>;
/** Initial value of one logic property on a device. */
export type PropsSchema = InferOutput<typeof PropsSchema>;
/** Initial value of one data channel on a network. */
export type ChannelPropsSchema = InferOutput<typeof ChannelPropsSchema>;
/** An item placed in one of a device's slots. */
export type SlotSchema = InferOutput<typeof SlotSchema>;
/** A reagent held by a device. */
export type ReagentSchema = InferOutput<typeof ReagentSchema>;
/** Initial value of one chip register. */
export type RegisterSchema = InferOutput<typeof RegisterSchema>;
/** An IC10 chip: its program and starting state. */
export type ChipSchema = InferOutput<typeof ChipSchema>;
/** Any device that isn't a housing, e.g. a vent or a gas sensor. */
export type DeviceSchema = DeviceBase;
/** A chip housing and the devices on its pins. */
export type HousingSchema = DeviceBase & InferOutput<typeof HousingOnlyObject>;
/** A cable or pipe network. */
export type NetworkSchema = InferOutput<typeof NetworkSchema>;
/** Network kind: data, power, chute, liquid, pipe, wireless or landing. */
export type NetworkTypeSchema = InferOutput<typeof NetworkTypeSchema>;
/** Plugs a device into one of a housing's pins. */
export type PinSchema = InferOutput<typeof PinSchema>;
/** Any device prefab name known to the emulator. */
export type PrefabName = InferOutput<typeof PrefabNameSchema>;
