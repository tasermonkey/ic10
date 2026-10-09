import { Devices, LogicBatchMethod, LogicReagentMode, LogicSlot, Logics, Reagents } from "../../../Defines/data.ts";
import i18n from "../../../Languages/lang.ts";
import type { Context } from "../../Context/Context.ts";
import { ErrorSeverity, TypeIc10Error } from "../../Errors/Errors.ts";
import { getDevicePin, getRegister, parseArgumentAnyNumber } from "../../Helpers/ArgumentParse.ts";
import type { Argument } from "./Argument.ts";
import type { InstructionArgument } from "./Instruction.ts";

// Helper functions for error handling and checks
const ErrorHandlers = {
	handleError: (
		context: Context,
		argument: Argument,
		message: string,
		severity: ErrorSeverity = ErrorSeverity.Strong,
	): 0 => {
		context.addError(new TypeIc10Error({ message, severity }).setArgument(argument));
		return 0;
	},

	validateDeviceConnection: (
		context: Context,
		pin: number | [number, number],
		argument: Argument,
		severity: ErrorSeverity = ErrorSeverity.Strong,
	): number | [number, number] => {
		const pins = Array.isArray(pin) ? pin : [pin];

		for (const singlePin of pins) {
			if (!context.isConnectDeviceByPin(singlePin.valueOf())) {
				context.addError(
					new TypeIc10Error({
						message: i18n.t("error.device_pin_not_connected", { pin }),
						severity: severity,
					}).setArgument(argument),
				);
				break;
			}
		}
		return pin;
	},
};

// Base configurations for different argument types
const BaseConfigs = {
	numberLike: {
		canBeLabel: true,
		canBeDefine: true,
		canBeConst: true,
		canBeAlias: true,
	},
	register: {
		canBeLabel: false,
		canBeDefine: false,
		canBeConst: false,
		canBeAlias: true,
	},
	device: {
		canBeLabel: false,
		canBeAlias: true,
		canBeConst: false,
		canBeDefine: false,
	},
	// Reference IDs are plain numbers, so a `define` can hold one (`define Furnace $4D655`).
	// DefineInstruction stores its value with type "const", hence canBeConst.
	deviceRef: {
		canBeLabel: false,
		canBeAlias: true,
		canBeConst: true,
		canBeDefine: true,
	},
	Enum: {
		canBeLabel: false,
		canBeAlias: false,
		canBeConst: true,
		canBeDefine: false,
	},
};

export type calculateDevicePinOrIdResult = {
	pin?: number;
	port?: number;
	id?: number;
	error?: number;
};

// Helper functions for working with results
const ResultHelpers = {
	formatPinResult: (pinResult: number | [number, number]): calculateDevicePinOrIdResult => {
		if (Array.isArray(pinResult)) {
			return {
				pin: pinResult[0],
				port: pinResult[1],
			};
		}
		return { pin: pinResult };
	},
};

// Main value calculators
export const ValueCalculators = {
	calculateNumberLike: (context: Context, argument: Argument) => {
		const value = parseArgumentAnyNumber(context, argument);
		return value !== false
			? value
			: ErrorHandlers.handleError(context, argument, i18n.t("error.invalid_argument_number_or_register_or_const"));
	},

	calculateRegister: (context: Context, argument: Argument) => {
		const reg = getRegister(context, argument.text);
		return reg !== false
			? reg
			: ErrorHandlers.handleError(context, argument, i18n.t("error.invalid_argument_register"));
	},

	calculateDevicePin: (context: Context, argument: Argument) => {
		const pin = getDevicePin(context, argument.text);
		if (pin === false) {
			return ErrorHandlers.handleError(context, argument, i18n.t("error.invalid_argument_device_pin"));
		}
		return ErrorHandlers.validateDeviceConnection(context, pin, argument);
	},

	/** A pin that may have nothing on it, for the instructions that test exactly that (sdse, bdns, …). */
	calculateDevicePinMaybeEmpty: (context: Context, argument: Argument) => {
		const pin = getDevicePin(context, argument.text);
		if (pin === false) {
			return ErrorHandlers.handleError(context, argument, i18n.t("error.invalid_argument_device_pin"));
		}
		return pin;
	},

	calculateDeviceId: (context: Context, argument: Argument): calculateDevicePinOrIdResult => {
		const value = parseArgumentAnyNumber(context, argument);
		if (value !== false && context.isConnectDeviceById(value)) {
			return {
				id: value,
			};
		}
		return {
			error: ErrorHandlers.handleError(context, argument, i18n.t("error.invalid_argument_device_id")),
		};
	},

	calculateDevicePinOrId: (context: Context, argument: Argument): calculateDevicePinOrIdResult => {
		// First try to handle it as a device pin
		const pinResult = getDevicePin(context, argument.text);
		if (pinResult !== false) {
			return ResultHelpers.formatPinResult(pinResult);
		}

		// Not a pin: try it as a reference ID (number, register, define). Only the housing's network is
		// searched, as in game. No error is recorded for the failed pin parse; that used to turn every
		// ID into pin 0 and made `ld`/`sd` unusable.
		const value = parseArgumentAnyNumber(context, argument);
		if (value === false) {
			return {
				error: ErrorHandlers.handleError(context, argument, i18n.t("error.invalid_argument_device_pin_or_id")),
			};
		}
		if (!context.isConnectDeviceById(value)) {
			return {
				error: ErrorHandlers.handleError(context, argument, i18n.t("error.invalid_argument_device_id")),
			};
		}
		return { id: value };
	},

	calculateLogic: (context: Context, argument: Argument): ReturnType<typeof Logics.getByKey> | 0 => {
		if (Logics.hasKey(argument.text)) {
			return Logics.getByKey(argument.text);
		}

		const prop = parseArgumentAnyNumber(context, argument);
		if (Logics.hasValue(prop)) {
			return prop;
		}

		return ErrorHandlers.handleError(context, argument, i18n.t("error.invalid_argument_valid_device_property"));
	},

	calculateLogicSlot: (context: Context, argument: Argument): ReturnType<typeof LogicSlot.getByKey> | 0 => {
		if (LogicSlot.hasKey(argument.text)) {
			return LogicSlot.getByKey(argument.text);
		}

		const slot = parseArgumentAnyNumber(context, argument);
		if (LogicSlot.hasValue(slot)) {
			return slot;
		}

		return ErrorHandlers.handleError(context, argument, i18n.t("error.invalid_argument_valid_logic_slot"));
	},

	calculateLogicBatchMethod: (
		context: Context,
		argument: Argument,
	): ReturnType<typeof LogicBatchMethod.getByKey> | 0 => {
		if (LogicBatchMethod.hasKey(argument.text)) {
			return LogicBatchMethod.getByKey(argument.text);
		}

		const method = parseArgumentAnyNumber(context, argument);
		if (LogicBatchMethod.hasValue(method)) {
			return method;
		}

		return ErrorHandlers.handleError(context, argument, i18n.t("error.invalid_argument_valid_logic_batch_method"));
	},
	calculateLogicReagentMode: (
		context: Context,
		argument: Argument,
	): ReturnType<typeof LogicReagentMode.getByKey> | 0 => {
		if (LogicReagentMode.hasKey(argument.text)) {
			return LogicReagentMode.getByKey(argument.text);
		}

		const mode = parseArgumentAnyNumber(context, argument);
		if (LogicReagentMode.hasValue(mode)) {
			return mode;
		}

		return ErrorHandlers.handleError(context, argument, i18n.t("error.invalid_argument_valid_logic_reagent_mode"));
	},
	calculateReagentHash: (context: Context, argument: Argument): ReturnType<typeof Reagents.getByValue> | 0 => {
		const value = parseArgumentAnyNumber(context, argument);
		if (Reagents.hasKey(value)) {
			return value;
		}
		return ErrorHandlers.handleError(
			context,
			argument,
			"error:invalid_argument_valid_reagent_hash",
			ErrorSeverity.Weak,
		);
	},
	calculateDeviceHash: (context: Context, argument: Argument): ReturnType<typeof Devices.getByValue> | 0 => {
		const value = parseArgumentAnyNumber(context, argument);
		if (Devices.hasKey(value)) {
			return value;
		}
		return ErrorHandlers.handleError(
			context,
			argument,
			i18n.t("error.invalid_argument_valid_device_hash"),
			ErrorSeverity.Weak,
		);
	},
};

/**
 * List of standard arguments for reuse
 */
export const ArgumentCalculators = {
	anyNumber: (name?: string) => ({
		name,
		...BaseConfigs.numberLike,
		calculate: (context: Context, argument: Argument) => ValueCalculators.calculateNumberLike(context, argument),
	}),

	registerLink: (name?: string) => ({
		name,
		...BaseConfigs.register,
		calculate: (context: Context, argument: Argument) => ValueCalculators.calculateRegister(context, argument),
	}),

	jumpTarget: (name?: string) => ({
		name,
		...BaseConfigs.numberLike,
		calculate: (context: Context, argument: Argument) => ValueCalculators.calculateNumberLike(context, argument),
	}),

	devicePin: (name?: string) => ({
		name,
		...BaseConfigs.device,
		calculate: (context: Context, argument: Argument) => ValueCalculators.calculateDevicePin(context, argument),
	}),

	devicePinMaybeEmpty: (name?: string) => ({
		name,
		...BaseConfigs.device,
		calculate: (context: Context, argument: Argument) =>
			ValueCalculators.calculateDevicePinMaybeEmpty(context, argument),
	}),

	deviceId: (name?: string) => ({
		name,
		...BaseConfigs.deviceRef,
		calculate: (context: Context, argument: Argument) => ValueCalculators.calculateDeviceId(context, argument),
	}),

	devicePinOrId: (name?: string) => ({
		name,
		...BaseConfigs.deviceRef,
		calculate: (context: Context, argument: Argument) => ValueCalculators.calculateDevicePinOrId(context, argument),
	}),

	logic: (name?: string) => ({
		name,
		...BaseConfigs.Enum,
		calculate: (context: Context, argument: Argument) => ValueCalculators.calculateLogic(context, argument),
	}),

	logicSlot: (name?: string) => ({
		name,
		...BaseConfigs.Enum,
		calculate: (context: Context, argument: Argument) => ValueCalculators.calculateLogicSlot(context, argument),
	}),

	logicBatchMethod: (name?: string) => ({
		name,
		...BaseConfigs.Enum,
		calculate: (context: Context, argument: Argument) => ValueCalculators.calculateLogicBatchMethod(context, argument),
	}),

	logicReagentMode: (name?: string) => ({
		name,
		...BaseConfigs.Enum,
		calculate: (context: Context, argument: Argument) => ValueCalculators.calculateLogicReagentMode(context, argument),
	}),
	reagentHash: (name?: string) => ({
		name,
		...BaseConfigs.numberLike,
		calculate: (context: Context, argument: Argument) => ValueCalculators.calculateReagentHash(context, argument),
	}),
	deviceHash: (name?: string) => ({
		name,
		...BaseConfigs.numberLike,
		calculate: (context: Context, argument: Argument) => ValueCalculators.calculateDeviceHash(context, argument),
	}),
} satisfies { [key: string]: (name?: string) => InstructionArgument };
