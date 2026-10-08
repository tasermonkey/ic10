import { EventEmitter } from "eventemitter3";
import type { Chip } from "../../Core/Chip.ts";
import type { Housing } from "../../Core/Housing.ts";
import type { StackInterface } from "../../Core/Stack.ts";
import { ErrorSeverity, type Ic10Error } from "../Errors/Errors.ts";
import type { Define } from "../Instruction/Helpers/Define.ts";
import type { Line } from "../Lines/Line.ts";

export type ContextConstructor = {
	/** Human-readable context name (for logging/debugging) */
	name: string;
	/** Owning device (Housing) that provides access to the network, chip, etc. */
	housing: Housing;
};

// Event types for Context
export interface ContextEvents {
	// Execution events
	lineChange: (line: Line | undefined) => void;
	lineExecute: (line: Line) => void;
	lineEnd: (line: Line) => void;

	// Error events
	error: (error: Ic10Error) => void;
	criticalError: (error: Ic10Error) => void;

	// Memory events
	registerRead: (register: number, value: number) => void;
	registerWrite: (register: number, oldValue: number, newValue: number) => void;

	// Stack events
	stackPush: (value: number) => void;
	stackPop: (value: number) => void;
	stackPeek: (value: number) => void;

	// Device events
	deviceParameterRead: (pin: number, property: number, value: number) => void;
	deviceParameterWrite: (pin: number, property: number, oldValue: number, newValue: number) => void;
	deviceStackClear: (pin: number) => void;
	deviceStackRead: (pin: number, index: number, value: number) => void;
	deviceStackWrite: (pin: number, index: number, oldValue: number, newValue: number) => void;

	// Define events
	defineSet: (name: string, value: Define) => void;
	defineGet: (name: string, value: Define | undefined) => void;

	// General events
	reset: () => void;
	jump: (fromLine: number, toLine: number) => void;
}

// =============================================
// Interfaces for logical groups
// =============================================

/** Interface for controlling code execution */
export interface IExecutionContext {
	/** Get the jump count */
	getJumpsCount(): number;
	/** Increment the jump counter */
	incrementJumpsCount(): void;
	/** Get the next line index */
	getNextLineIndex(): number;
	/** Set the next line index */
	setNextLineIndex(index?: number, writeRA?: boolean): void;
	/** Set the line currently being executed */
	setExecuteLine(line: Line): void;
}

/** Interface for working with aliases and constants */
export interface IDefinesContext {
	/** Check whether a Define exists by name */
	hasDefines(name: string): boolean;
	/** Set a Define value */
	setDefines(name: string, value: Define): void;
	/** Get a Define by name */
	getDefines(name: string): Define | undefined;
}

/** Interface for working with memory/registers */
export interface IMemoryContext {
	/** Check whether a register exists */
	hasRegister(reg: number): boolean;
	/** Get a register value */
	getRegister(reg: number): number;
	/** Set a register value */
	setRegister(reg: number, value: number): void;
}

/** Interface for working with devices by pin */
export interface IDevicesByPinContext {
	/** Check whether a device is connected to a pin */
	isConnectDeviceByPin(pin: number): boolean;
	/** Get a device parameter by pin */
	getDeviceParameterByPin(pin: number, prop: number): number;
	/** Set a device parameter by pin */
	setDeviceParameterByPin(pin: number, prop: number, value: number): void;
	/** Clear a device's stack by pin */
	clearDeviceStackByPin(pin: number): void;
	/** Get a value from a device's stack by pin */
	getDeviceStackByPin(pin: number, index: number): number;
	/** Set a value in a device's stack by pin */
	setDeviceStackByPin(pin: number, index: number, value: number): void;

	canLoadDeviceParameterByPin(pin: number, prop: number): boolean;
	canStoreDeviceParameterByPin(pin: number, prop: number): boolean;

	getDevicePortChanelByPin(pin: number, port: number, chanel: number): number;
	/** Set a device parameter by pin */
	setDevicePortChanelByPin(pin: number, port: number, chanel: number, value: number): void;
}

/** Interface for batch operations on devices by hash */
export interface IDevicesByHashContext {
	/** Batch read of a device parameter by hash */
	deviceBatchReadByHash(deviceHash: number, prop: number, mode: number): number;
	/** Batch write of a device parameter by hash */
	deviceBatchWriteByHash(deviceHash: number, prop: number, value: number): void;
	/** Batch read of a device slot parameter by hash */
	deviceSlotBatchReadByHash(deviceHash: number, slot: number, param: number, mode: number): number;
}

/** Interface for batch operations on devices by hash and name */
export interface IDevicesByHashAndNameContext {
	/** Batch read of a device parameter by hash and name */
	deviceBatchReadByHashAndName(deviceHash: number, deviceName: number, param: number, mode: number): number;
	/** Batch write of a device parameter by hash and name */
	deviceBatchWriteByHashAndName(deviceHash: number, deviceName: number, param: number, value: number): void;
}

/** Interface for working with the stack */
export interface IStackContext {
	/** Push a value onto the stack */
	push(value: number): void;
	/** Pop a value from the stack */
	pop(): number;
	/** Peek at the value on top of the stack */
	peek(): number;
	/** Get the stack */
	stack(): StackInterface;
}

/** Interface for basic context operations */
export interface IBaseContext {
	/** Fully reset the context */
	reset(): void;
	/** Check that the chip is valid */
	validChip(): boolean;
	/** Collect errors from the network */
	collectErrors(): void;
	/** Add an error */
	addError(error: Ic10Error): this;

	/** Request a suspend of `seconds` of game time. Doesn't wait: the driver of the runner does. */
	sleep(seconds: number): void;
	/** Request a suspend until the next game tick. Doesn't wait: the driver of the runner does. */
	yield(): void;
	hcf(): void;
}

/**
 * A request, made by `yield` or `sleep`, to suspend the chip after the current line. The runner exposes
 * it as `Ic10Runner.suspend` after each step; whoever drives the runner (e.g. a game-tick scheduler)
 * decides what it means. No real time passes inside the emulator.
 */
export type SuspendRequest = { kind: "yield" } | { kind: "sleep"; seconds: number };

export interface IDevicesByIdContext {
	isConnectDeviceById(id: number): boolean;
	clearDeviceStackById(id: number): void;
	getDeviceStackById(id: number, index: number): number;
	setDeviceStackById(id: number, index: number, value: number): void;
	getDeviceParameterById(id: number, prop: number): number;
	setDeviceParameterById(id: number, prop: number, value: number): void;
}

export interface IDevicesSlotContext {
	getDeviceSlotParameterById(deviceId: number, slot: number, prop: number): number;
	getDeviceSlotParameterByPin(devicePin: number, slot: number, prop: number): number;
	getBatchDeviceSlotParameterByHash(deviceHash: number, slot: number, prop: number, mode: number): number;
	getBatchDeviceSlotParameterByHashAndName(
		deviceHash: number,
		deviceName: number,
		slot: number,
		prop: number,
		mode: number,
	): number;

	setDeviceSlotParameterById(deviceId: number, slot: number, prop: number, value: number): void;
	setDeviceSlotParameterByPin(devicePin: number, slot: number, prop: number, value: number): void;
	setBatchDeviceSlotParameterByHash(deviceHash: number, slot: number, prop: number, value: number): void;
}

export interface IDevicesReagentContext {
	getDeviceReagentByPin(deviceId: number, mode: number, reagent: number): number;
	getDeviceReagentById(devicePin: number, mode: number, reagent: number): number;
}

/**
 * Provides a simple API for Instructions with access to Network, Housing, ... elements
 */
export abstract class Context
	extends EventEmitter<ContextEvents>
	implements
		IBaseContext,
		IExecutionContext,
		IDefinesContext,
		IMemoryContext,
		IDevicesByPinContext,
		IDevicesByHashContext,
		IDevicesByHashAndNameContext,
		IStackContext,
		IDevicesByIdContext,
		IDevicesSlotContext,
		IDevicesReagentContext
{
	debug(...args: any[]): void {}
	/** Context name (used for debugging/logging) */
	public readonly name: string;

	/** Local pool of errors collected during an iteration/tick (deduplicated by id) */
	public $errors: Map<number, Ic10Error> = new Map();

	/** Reference to the owning device, through which the chip, network, etc. are accessed */
	public readonly $housing: Housing;
	public $executeLine?: Line;
	public $criticalError?: Ic10Error = undefined;

	/**
	 * Creates a new context.
	 * @param name Context name
	 * @param housing Owning device that provides access to the chip and network
	 */
	constructor({ name, housing }: ContextConstructor) {
		super();
		this.name = name;
		this.$housing = housing;
	}
	abstract sleep(seconds: number): void;
	abstract yield(): void;

	/** Suspend requested by the line being executed, if any. */
	private $pendingSuspend: SuspendRequest | null = null;

	protected requestSuspend(request: SuspendRequest): void {
		this.$pendingSuspend = request;
	}

	/** Return the pending suspend request (if any) and clear it. */
	takeSuspend(): SuspendRequest | null {
		const request = this.$pendingSuspend;
		this.$pendingSuspend = null;
		return request;
	}
	abstract hcf(): void;

	get executeLine(): Line {
		return this.$executeLine!;
	}

	get currentLinePosition(): number {
		return this.$executeLine?.position || 0;
	}

	/**
	 * Returns the current list of accumulated errors (without duplicates).
	 * Note: errors are deduplicated by id.
	 */
	get errors() {
		return this.$errors.values().toArray();
	}

	/**
	 * Convenient access to the chip attached to this Housing.
	 * Assumes the chip exists at the time of the call.
	 */
	public get chip(): Chip {
		return this.$housing.chip!;
	}

	/**
	 * Access to the Housing for subclasses.
	 */
	public get housing() {
		return this.$housing;
	}

	public get network() {
		return this.$housing.network;
	}

	public get criticalError(): Ic10Error | false {
		if (this.$criticalError) {
			return this.$criticalError;
		} else {
			return false;
		}
	}

	// =============================================
	// IBaseContext implementation
	// =============================================

	abstract reset(): void;
	abstract validChip(): boolean;

	public collectErrors(): void {
		this.$housing.network.devices.forEach((device) => {
			device.errors.get().forEach((error: Ic10Error) => {
				if (this.$executeLine) {
					error.setLine(this.$executeLine);
				}
				this.addError(error);
			});
			device.errors.reset();
		});
	}

	public addError(error: Ic10Error): this {
		error.setContext(this);
		if (this.$executeLine) {
			error.setLine(this.$executeLine);
		}
		if (error.device === undefined) {
			error.setDevice(this.housing);
		}
		if (error.severity === ErrorSeverity.Critical) {
			this.$criticalError = error;
			this.emit("criticalError", error);
		}
		if (!this.$errors.has(error.id)) {
			this.$errors.set(error.id, error);
			this.emit("error", error);
		}
		return this;
	}

	/**
	 * Returns the IC10 source code loaded into the chip.
	 * Checks that the chip is valid before retrieving it. If the chip is invalid,
	 * registers (and probably throws) a FatalIc10Error.
	 * @throws FatalIc10Error When the chip is invalid
	 */
	public getIc10Code(): string {
		if (!this.validChip()) {
			return "";
		}
		return this.chip.getIc10Code();
	}

	// =============================================
	// IExecutionContext implementation
	// =============================================

	abstract getJumpsCount(): number;
	abstract incrementJumpsCount(): void;
	abstract getNextLineIndex(): number;
	abstract setNextLineIndex(index?: number, writeRA?: boolean): void;

	public setExecuteLine(line: Line): void {
		const previousLine = this.$executeLine;
		this.$executeLine = line;
		this.emit("lineChange", line);

		if (previousLine !== line && previousLine) {
			this.emit("lineEnd", previousLine);
		}
		if (line) {
			this.emit("lineExecute", line);
		}
	}

	// =============================================
	// IDefinesContext implementation
	// =============================================

	abstract hasDefines(name: string): boolean;
	abstract setDefines(name: string, value: Define): void;
	abstract getDefines(name: string): Define | undefined;

	// =============================================
	// IMemoryContext implementation
	// =============================================

	abstract hasRegister(reg: number): boolean;
	abstract getRegister(reg: number): number;
	abstract setRegister(reg: number, value: number): void;

	// =============================================
	// IDevicesByPinContext implementation
	// =============================================

	abstract isConnectDeviceByPin(pin: number): boolean;
	abstract getDeviceParameterByPin(pin: number, prop: number): number;
	abstract setDeviceParameterByPin(pin: number, prop: number, value: number): void;
	abstract clearDeviceStackByPin(pin: number): void;
	abstract getDeviceStackByPin(pin: number, index: number): number;
	abstract setDeviceStackByPin(pin: number, index: number, value: number): void;
	abstract canLoadDeviceParameterByPin(pin: number, prop: number): boolean;
	abstract canStoreDeviceParameterByPin(pin: number, prop: number): boolean;
	abstract getDevicePortChanelByPin(pin: number, port: number, chanel: number): number;
	abstract setDevicePortChanelByPin(pin: number, port: number, chanel: number, value: number): void;

	// =============================================
	// IDevicesByIDContext implementation
	// =============================================

	abstract isConnectDeviceById(pin: number): boolean;
	abstract clearDeviceStackById(id: number): void;
	abstract getDeviceStackById(id: number, index: number): number;
	abstract setDeviceStackById(id: number, index: number, value: number): void;
	abstract getDeviceParameterById(id: number, prop: number): number;
	abstract setDeviceParameterById(id: number, prop: number, value: number): void;

	// =============================================
	// IDevicesSlotContext implementation
	// =============================================
	abstract getDeviceSlotParameterById(deviceId: number, slot: number, prop: number): number;
	abstract getDeviceSlotParameterByPin(deviceId: number, slot: number, prop: number): number;
	abstract getBatchDeviceSlotParameterByHash(deviceHash: number, slot: number, prop: number, mode: number): number;
	abstract getBatchDeviceSlotParameterByHashAndName(
		deviceHash: number,
		deviceName: number,
		slot: number,
		prop: number,
		mode: number,
	): number;
	abstract setDeviceSlotParameterById(deviceId: number, slot: number, prop: number, value: number): void;
	abstract setDeviceSlotParameterByPin(devicePin: number, slot: number, prop: number, value: number): void;
	abstract setBatchDeviceSlotParameterByHash(deviceHash: number, slot: number, prop: number, value: number): void;

	// =============================================
	// IDevicesByHashContext implementation
	// =============================================

	abstract deviceBatchReadByHash(deviceHash: number, prop: number, mode: number): number;
	abstract deviceBatchWriteByHash(deviceHash: number, prop: number, value: number): void;
	abstract deviceSlotBatchReadByHash(deviceHash: number, slot: number, param: number, mode: number): number;

	// =============================================
	// IDevicesByHashAndNameContext implementation
	// =============================================

	abstract deviceBatchReadByHashAndName(deviceHash: number, deviceName: number, param: number, mode: number): number;
	abstract deviceBatchWriteByHashAndName(deviceHash: number, deviceName: number, param: number, value: number): void;

	// =============================================
	// IStackContext implementation
	// =============================================

	abstract push(value: number): void;
	abstract pop(): number;
	abstract peek(): number;
	abstract stack(): StackInterface;

	// =============================================
	// IDevicesReagentContext implementation
	// =============================================
	abstract getDeviceReagentByPin(deviceId: number, mode: number, reagent: number): number;
	abstract getDeviceReagentById(devicePin: number, mode: number, reagent: number): number;
}
