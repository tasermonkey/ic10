import { trimZerosFromEnd } from "../../helpers.ts";
import { ErrorSeverity, Ic10Error } from "../../Ic10/Errors/Errors.ts";
import i18n from "../../Languages/lang.ts";
import type { StackInterface } from "../Stack.ts";
import { DeviceScope, type DeviceScopeConstructor } from "./DeviceScope.ts";

export type DeviceMemoryConstructor = {
	stack_length: number;
} & DeviceScopeConstructor;

export class DeviceMemory extends DeviceScope implements StackInterface {
	protected readonly $stack: Map<number, number> = new Map();
	public readonly stack_length: number;

	constructor(props: DeviceMemoryConstructor) {
		super(props);
		this.stack_length = props.stack_length;
	}
	public get length(): number {
		return this.$stack.size;
	}

	/** The same bounds as the housing's stack: StackUnderFlow below 0, StackOverFlow at or above the capacity. */
	protected checkIndex(index: number): void {
		if (index < 0) {
			throw new Ic10Error({ message: i18n.t("error.stack_underflow"), severity: ErrorSeverity.Strong });
		}
		if (index >= this.stack_length) {
			throw new Ic10Error({ message: i18n.t("error.stack_overflow"), severity: ErrorSeverity.Strong });
		}
	}

	public get(index: number): number {
		this.checkIndex(index);
		return this.$stack.get(index) ?? 0;
	}

	public set(index: number, value: number): void {
		this.checkIndex(index);
		this.$stack.set(index, value);
	}

	public delete(index: number): void {
		if (this.$stack.has(index)) {
			this.$stack.delete(index);
		}
	}

	public push(value: number): void {
		this.$stack.set(this.$stack.size, value);
	}

	public pop(): number {
		if (this.$stack.size <= 0) {
			throw new Ic10Error({ message: i18n.t("error.stack_underflow"), severity: ErrorSeverity.Strong });
		}
		const value = this.$stack.get(this.$stack.size - 1)!;
		this.$stack.delete(this.$stack.size - 1);
		return value;
	}

	public reset(): void {
		this.$stack.clear();
	}

	toArray(): number[] {
		const arr: number[] = new Array(this.stack_length).fill(0);
		this.$stack.forEach((value, index) => {
			if (index < this.stack_length) {
				arr[index] = value;
			}
		});
		return trimZerosFromEnd(arr);
	}
}
