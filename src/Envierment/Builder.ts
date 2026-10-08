import JSON5 from "json5";
import type { Chip } from "../Core/Chip.ts";
import type { Device } from "../Core/Device.ts";
import type { Network } from "../Core/Network.ts";
import { ErrorSeverity } from "../Ic10/Errors/Errors.ts";
import type { Ic10Runner } from "../Ic10/Ic10Runner.ts";
import type { EnvSchema, ProjectSchema } from "../Schemas/EnvSchema.ts";
import { type Parser, ParserV1 } from "./ParserV1.ts";

export class Builder {
	private readonly lattestParser = ParserV1;

	public meta: {
		project?: ProjectSchema;
	} = {};

	public readonly Chips = new Map<number, Chip>();
	public readonly Networks = new Map<string, Network>();
	public readonly Devices = new Map<number, Device>();
	public readonly Runners = new Map<number, Ic10Runner>();
	public readonly FinishedRunners = new Set<number>();

	private initialized = false;

	public reset(): void {
		this.Chips.clear();
		this.Devices.clear();
		this.Networks.clear();
		this.Runners.clear();
		this.FinishedRunners.clear();
		this.initialized = false;
	}

	static from(yml: string): Builder {
		const BUILDER = new Builder();
		const data = JSON5.parse(yml) as EnvSchema;
		let Parser: Parser;
		switch (data.version) {
			case 1:
				Parser = new ParserV1({ builder: BUILDER });
				break;
			default:
				throw new Error(`Unsupported version: ${data.version}`);
		}
		Parser.parse(data);
		return BUILDER;
	}

	// Одноразовая инициализация: прогнать sandbox и проверить ошибки
	public async init(): Promise<boolean> {
		if (this.initialized) return true;

		for (const [, runner] of this.Runners.entries()) {
			runner.switchContext("sandbox");
			await runner.run();
			runner.init();

			const err = runner.context.errors.filter((error) => error.severity === ErrorSeverity.Strong);
			if (err.length > 0) {
				return false;
			}

			runner.switchContext("real");
			runner.init();
		}

		this.initialized = true;
		return true;
	}

	// Один тик исполнения без sandbox-прогона
	public async step(): Promise<boolean> {
		const promises: Promise<{ key: any; result: boolean }>[] = [];
		for (const [key, runner] of this.Runners.entries()) {
			if (this.FinishedRunners.has(key)) {
				continue;
			}
			promises.push(runner.step().then((result) => ({ key, result })));
		}

		const results = await Promise.all(promises);

		// Удаляем завершённые runners
		for (const { key, result } of results) {
			if (!result) {
				this.FinishedRunners.add(key);
			}
		}

		// true — если остались активные runners
		return this.Runners.size - this.FinishedRunners.size > 0;
	}

	public toYaml(): string {
		throw new Error("ТЫ ЕБАННУТЫЙ?????");
	}

	public toJson(debug: boolean = false, minify: boolean = false): string {
		return new this.lattestParser({ builder: this }).stringify(debug, minify);
	}

	[Symbol.toPrimitive](hint: string): string {
		return this.toJson(false);
	}
	valueOf(): string {
		return this.toJson(false);
	}
	toString(): string {
		return this.toJson(false);
	}
	toData(debug: boolean = false): EnvSchema {
		try {
			return new this.lattestParser({ builder: this }).toData(debug);
		} catch (e) {
			return {} as EnvSchema;
		}
	}
}
