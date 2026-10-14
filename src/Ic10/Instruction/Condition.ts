import CONSTS from "../../Defines/consts.ts";
import { ArgumentCalculators } from "./Helpers/ArgumentCalculators.ts";
import { Instruction, type InstructionArgument, type InstructionTestData } from "./Helpers/Instruction.ts";

// ===== Common helpers =====
const EPS = CONSTS.epsilon * 8;
const RA = 17;

function approxEqual(a: number, b: number, c: number): boolean {
	const scale = Math.max(Math.abs(a), Math.abs(b));
	const tol = Math.max(c * scale, EPS);
	return Math.abs(a - b) <= tol;
}

// The wiki's "not approximately equal" is `abs(a - b) > max(...)`, written here directly. Negating
// approxEqual made a NaN operand count as "not equal"; the game gives false for NaN (G22).
function approxNotEqual(a: number, b: number, c: number): boolean {
	const scale = Math.max(Math.abs(a), Math.abs(b));
	const tol = Math.max(c * scale, EPS);
	return Math.abs(a - b) > tol;
}

// sapz/snaz and the branch forms take a second operand b: abs(a) <= max(b * abs(a), eps * 8) (G21).
// The "not" form is written as a direct comparison too, so NaN is false in both (as in the game).
function approxZero(a: number, b: number): boolean {
	return Math.abs(a) <= Math.max(b * Math.abs(a), EPS);
}
function notApproxZero(a: number, b: number): boolean {
	return Math.abs(a) > Math.max(b * Math.abs(a), EPS);
}

const cmp = {
	lt: (a: number, b: number) => a < b,
	gt: (a: number, b: number) => a > b,
	le: (a: number, b: number) => a <= b,
	ge: (a: number, b: number) => a >= b,
	eq: (a: number, b: number) => a === b,
	ne: (a: number, b: number) => a !== b,
};

const un = {
	lt0: (a: number) => a < 0,
	gt0: (a: number) => a > 0,
	le0: (a: number) => a <= 0,
	ge0: (a: number) => a >= 0,
	eq0: (a: number) => a === 0,
	ne0: (a: number) => a !== 0,
	nan: (a: number) => Number.isNaN(a),
	nanz: (a: number) => !Number.isNaN(a),
};

// ===== Test cases and generators =====
// Change notice: the fork tests every s*/b*/br* instruction (upstream tested about a third of them)
// from one table of cases per predicate below, NaN and the ap/na tolerances included. Upstream's
// cases are among them.

/** Operands (numbers, or a pin such as `db`) and whether the condition holds. */
type Case = [operands: (number | string)[], holds: boolean];

/** An operand as IC10 source: NaN and the infinities by their constants. */
const lit = (v: number | string) =>
	typeof v === "string" ? v : Number.isNaN(v) ? "nan" : v === Infinity ? "pinf" : v === -Infinity ? "ninf" : String(v);

// biome-ignore format: one case per line keeps the tables readable
const CASES = {
	lt: [[[1, 2], true], [[2, 1], false], [[2, 2], false], [[-1, 0], true], [[NaN, 1], false], [[1, NaN], false]],
	gt: [[[2, 1], true], [[1, 2], false], [[2, 2], false], [[0, -1], true], [[NaN, 1], false], [[1, NaN], false]],
	le: [[[2, 2], true], [[1, 2], true], [[3, 2], false], [[NaN, 1], false], [[NaN, NaN], false]],
	ge: [[[2, 2], true], [[2, 1], true], [[1, 2], false], [[NaN, 1], false], [[NaN, NaN], false]],
	eq: [[[5, 5], true], [[5, 4], false], [[0, -0], true], [[NaN, NaN], false]],
	ne: [[[5, 4], true], [[5, 5], false], [[NaN, 1], true], [[NaN, NaN], true]],
	// |a - b| <= max(c * max(|a|, |b|), eps * 8); NaN is false either way (G22, checked in game).
	ap: [
		[[100, 101, 0.02], true],
		[[100, 104, 0.02], false],
		[[-100, -101, 0.01], true],
		[[1, 1, 0], true],
		[[1, 1.0001, 0], false],
		[[0, 1e-323, 0], true],
		[[NaN, NaN, 1], false],
		[[NaN, 1, 1], false],
	],
	na: [
		[[100, 101, 0.02], false],
		[[100, 104, 0.02], true],
		[[-100, -101, 0.01], false],
		[[1, 1, 0], false],
		[[1, 1.0001, 0], true],
		[[0, 1e-323, 0], false],
		[[NaN, NaN, 1], false],
		[[NaN, 1, 1], false],
	],
	lt0: [[[-1], true], [[0], false], [[1], false], [[NaN], false]],
	gt0: [[[1], true], [[0], false], [[-1], false], [[NaN], false]],
	le0: [[[0], true], [[-1], true], [[1], false], [[NaN], false]],
	ge0: [[[0], true], [[1], true], [[-1], false], [[NaN], false]],
	eq0: [[[0], true], [[1], false], [[1e-323], false], [[NaN], false]],
	ne0: [[[1], true], [[0], false], [[NaN], true]],
	// |a| <= max(b * |a|, eps * 8) (G21); NaN is false either way.
	apz: [[[0, 0], true], [[0, 1], true], [[1, 0], false], [[5, 1], true], [[5, 0.1], false], [[1e-323, 0], true], [[NaN, 1], false]],
	naz: [[[1, 0], true], [[0, 1], false], [[5, 1], false], [[5, 0.1], true], [[1e-323, 0], false], [[NaN, 1], false]],
	nan: [[[NaN], true], [[0], false], [[Infinity], false]],
	nanz: [[[NaN], false], [[0], true], [[-Infinity], true]],
	// The test housing has nothing on d1.
	dse: [[["db"], true], [["d1"], false]],
	dns: [[["db"], false], [["d1"], true]],
} satisfies Record<string, Case[]>;

const expectReg = (register: number, value: number) => ({ type: "register", register, value }) as const;

/** The tests, or none in a production build (so the bundle leaves them out). */
function devTests(make: () => InstructionTestData[]): InstructionTestData[] {
	return typeof isProd !== "undefined" && isProd ? [] : make();
}

const title = (operands: Case[0], holds: boolean) => `${operands.map(lit).join(" ")}: ${holds}`;

/** `op r2 …`: r2 is 1 when the condition holds. */
function tSet(op: string, cases: Case[]): InstructionTestData[] {
	return cases.map(([operands, holds]) => ({
		title: title(operands, holds),
		code: `${op} r2 ${operands.map(lit).join(" ")}`,
		expected: [expectReg(2, holds ? 1 : 0)],
	}));
}

/** `op … 3` on line 1: a branch skips line 2 (`move r2 1`); the and-link forms set ra to 2. */
function tBranch(op: string, cases: Case[], { link = false } = {}): InstructionTestData[] {
	return cases.map(([operands, br]) => ({
		title: title(operands, br),
		code: `move r2 0\n${op} ${operands.map(lit).join(" ")} 3\nmove r2 1\nmove r3 1`,
		expected: [expectReg(2, br ? 0 : 1), expectReg(3, 1), ...(link ? [expectReg(RA, br ? 2 : 0)] : [])],
	}));
}

/** `op … 2` on line 0: a branch skips line 1 (`move r2 1`). */
function tRelBranch(op: string, cases: Case[]): InstructionTestData[] {
	return cases.map(([operands, br]) => ({
		title: title(operands, br),
		code: `${op} ${operands.map(lit).join(" ")} 2\nmove r2 1\nmove r3 1`,
		expected: [expectReg(2, br ? 0 : 1), expectReg(3, 1)],
	}));
}

// ===== Base classes for writing 1/0 =====
abstract class UnarySetConditionInstruction extends Instruction {
	override argumentList(): InstructionArgument[] {
		return [ArgumentCalculators.registerLink("result"), ArgumentCalculators.anyNumber("a")];
	}
	public abstract predicate(a: number): boolean;
	override run(): void {
		const r = this.getArgumentValue<number>("result");
		const a = this.getArgumentValue<number>("a");
		this.context.setRegister(r, this.predicate(a) ? 1 : 0);
	}
}

abstract class BinarySetConditionInstruction extends Instruction {
	override argumentList(): InstructionArgument[] {
		return [
			ArgumentCalculators.registerLink("result"),
			ArgumentCalculators.anyNumber("a"),
			ArgumentCalculators.anyNumber("b"),
		];
	}
	public abstract predicate(a: number, b: number): boolean;
	override run(): void {
		const r = this.getArgumentValue<number>("result");
		const a = this.getArgumentValue<number>("a");
		const b = this.getArgumentValue<number>("b");
		this.context.setRegister(r, this.predicate(a, b) ? 1 : 0);
	}
}

abstract class TernarySetConditionInstruction extends Instruction {
	override argumentList(): InstructionArgument[] {
		return [
			ArgumentCalculators.registerLink("result"),
			ArgumentCalculators.anyNumber("a"),
			ArgumentCalculators.anyNumber("b"),
			ArgumentCalculators.anyNumber("c"),
		];
	}
	public abstract predicate(a: number, b: number, c: number): boolean;
	override run(): void {
		const r = this.getArgumentValue<number>("result");
		const a = this.getArgumentValue<number>("a");
		const b = this.getArgumentValue<number>("b");
		const c = this.getArgumentValue<number>("c");
		this.context.setRegister(r, this.predicate(a, b, c) ? 1 : 0);
	}
}

// ===== Base branch classes =====
abstract class BinaryBranchInstruction extends Instruction {
	override argumentList(): InstructionArgument[] {
		return [
			ArgumentCalculators.anyNumber("a"),
			ArgumentCalculators.anyNumber("b"),
			ArgumentCalculators.jumpTarget("line"),
		];
	}
	public abstract predicate(a: number, b: number): boolean;
	override run(): void {
		const line = this.getArgumentValue<number>("line");
		const a = this.getArgumentValue<number>("a");
		const b = this.getArgumentValue<number>("b");
		if (this.predicate(a, b)) this.context.setNextLineIndex(line);
	}
}

abstract class UnaryBranchInstruction extends Instruction {
	override argumentList(): InstructionArgument[] {
		return [ArgumentCalculators.anyNumber("a"), ArgumentCalculators.jumpTarget("line")];
	}
	public abstract predicate(a: number): boolean;
	override run(): void {
		const line = this.getArgumentValue<number>("line");
		const a = this.getArgumentValue<number>("a");
		if (this.predicate(a)) this.context.setNextLineIndex(line);
	}
}

abstract class TernaryBranchInstruction extends Instruction {
	override argumentList(): InstructionArgument[] {
		return [
			ArgumentCalculators.anyNumber("a"),
			ArgumentCalculators.anyNumber("b"),
			ArgumentCalculators.anyNumber("c"),
			ArgumentCalculators.jumpTarget("line"),
		];
	}
	public abstract predicate(a: number, b: number, c: number): boolean;
	override run(): void {
		const line = this.getArgumentValue<number>("line");
		const a = this.getArgumentValue<number>("a");
		const b = this.getArgumentValue<number>("b");
		const c = this.getArgumentValue<number>("c");
		if (this.predicate(a, b, c)) this.context.setNextLineIndex(line);
	}
}

abstract class RelativeBinaryBranchInstruction extends Instruction {
	override argumentList(): InstructionArgument[] {
		return [
			ArgumentCalculators.anyNumber("a"),
			ArgumentCalculators.anyNumber("b"),
			ArgumentCalculators.anyNumber("relative"),
		];
	}
	public abstract predicate(a: number, b: number): boolean;
	override run(): void {
		const relative = this.getArgumentValue<number>("relative");
		const a = this.getArgumentValue<number>("a");
		const b = this.getArgumentValue<number>("b");
		if (this.predicate(a, b)) this.context.setNextLineIndex(this.line.position + relative);
	}
}

abstract class RelativeUnaryBranchInstruction extends Instruction {
	override argumentList(): InstructionArgument[] {
		return [ArgumentCalculators.anyNumber("a"), ArgumentCalculators.anyNumber("relative")];
	}
	public abstract predicate(a: number): boolean;
	override run(): void {
		const relative = this.getArgumentValue<number>("relative");
		const a = this.getArgumentValue<number>("a");
		if (this.predicate(a)) this.context.setNextLineIndex(this.line.position + relative);
	}
}

abstract class RelativeTernaryBranchInstruction extends Instruction {
	override argumentList(): InstructionArgument[] {
		return [
			ArgumentCalculators.anyNumber("a"),
			ArgumentCalculators.anyNumber("b"),
			ArgumentCalculators.anyNumber("c"),
			ArgumentCalculators.anyNumber("relative"),
		];
	}
	public abstract predicate(a: number, b: number, c: number): boolean;
	override run(): void {
		const relative = this.getArgumentValue<number>("relative");
		const a = this.getArgumentValue<number>("a");
		const b = this.getArgumentValue<number>("b");
		const c = this.getArgumentValue<number>("c");
		if (this.predicate(a, b, c)) this.context.setNextLineIndex(this.line.position + relative);
	}
}

abstract class BinaryBranchAndLinkInstruction extends BinaryBranchInstruction {
	override run(): void {
		const line = this.getArgumentValue<number>("line");
		const a = this.getArgumentValue<number>("a");
		const b = this.getArgumentValue<number>("b");
		if (this.predicate(a, b)) {
			this.context.setNextLineIndex(line, true);
		}
	}
}

abstract class UnaryBranchAndLinkInstruction extends UnaryBranchInstruction {
	override run(): void {
		const line = this.getArgumentValue<number>("line");
		const a = this.getArgumentValue<number>("a");
		if (this.predicate(a)) {
			this.context.setNextLineIndex(line, true);
		}
	}
}

abstract class TernaryBranchAndLinkInstruction extends TernaryBranchInstruction {
	override run(): void {
		const line = this.getArgumentValue<number>("line");
		const a = this.getArgumentValue<number>("a");
		const b = this.getArgumentValue<number>("b");
		const c = this.getArgumentValue<number>("c");
		if (this.predicate(a, b, c)) {
			this.context.setNextLineIndex(line, true);
		}
	}
}

// Two-operand tolerance forms (G21): the wiki gives sapz r? a b, bapz a b c, brapz a b relative.
abstract class ToleranceSetConditionInstruction extends Instruction {
	override argumentList(): InstructionArgument[] {
		return [
			ArgumentCalculators.registerLink("result"),
			ArgumentCalculators.anyNumber("a"),
			ArgumentCalculators.anyNumber("b"),
		];
	}
	public abstract predicate(a: number, b: number): boolean;
	override run(): void {
		const r = this.getArgumentValue<number>("result");
		const a = this.getArgumentValue<number>("a");
		const b = this.getArgumentValue<number>("b");
		this.context.setRegister(r, this.predicate(a, b) ? 1 : 0);
	}
}

abstract class ToleranceBranchInstruction extends Instruction {
	override argumentList(): InstructionArgument[] {
		return [
			ArgumentCalculators.anyNumber("a"),
			ArgumentCalculators.anyNumber("b"),
			ArgumentCalculators.jumpTarget("line"),
		];
	}
	public abstract predicate(a: number, b: number): boolean;
	override run(): void {
		const line = this.getArgumentValue<number>("line");
		const a = this.getArgumentValue<number>("a");
		const b = this.getArgumentValue<number>("b");
		if (this.predicate(a, b)) this.context.setNextLineIndex(line);
	}
}

abstract class RelativeToleranceBranchInstruction extends Instruction {
	override argumentList(): InstructionArgument[] {
		return [
			ArgumentCalculators.anyNumber("a"),
			ArgumentCalculators.anyNumber("b"),
			ArgumentCalculators.anyNumber("relative"),
		];
	}
	public abstract predicate(a: number, b: number): boolean;
	override run(): void {
		const relative = this.getArgumentValue<number>("relative");
		const a = this.getArgumentValue<number>("a");
		const b = this.getArgumentValue<number>("b");
		if (this.predicate(a, b)) this.context.setNextLineIndex(this.line.position + relative);
	}
}

abstract class ToleranceBranchAndLinkInstruction extends ToleranceBranchInstruction {
	override run(): void {
		const line = this.getArgumentValue<number>("line");
		const a = this.getArgumentValue<number>("a");
		const b = this.getArgumentValue<number>("b");
		if (this.predicate(a, b)) this.context.setNextLineIndex(line, true);
	}
}

// ===== Devices (unified) =====
abstract class DeviceSetConditionInstruction extends Instruction {
	override argumentList(): InstructionArgument[] {
		return [ArgumentCalculators.registerLink("result"), ArgumentCalculators.devicePinMaybeEmpty("device")];
	}
	public abstract predicateDeviceSet(isSet: boolean): boolean;
	override run(): void {
		const r = this.getArgumentValue<number>("result");
		const device = this.getArgumentValue<number>("device");
		const isSet = this.context.isConnectDeviceByPin(device);
		this.context.setRegister(r, this.predicateDeviceSet(isSet) ? 1 : 0);
	}
}

abstract class DeviceBranchInstruction extends Instruction {
	override argumentList(): InstructionArgument[] {
		return [ArgumentCalculators.devicePinMaybeEmpty("device"), ArgumentCalculators.anyNumber("line")];
	}
	public abstract predicateDeviceSet(isSet: boolean): boolean;
	override run(): void {
		const line = this.getArgumentValue<number>("line");
		const device = this.getArgumentValue<number>("device");
		const isSet = this.context.isConnectDeviceByPin(device);
		if (this.predicateDeviceSet(isSet)) this.context.setNextLineIndex(line);
	}
}

abstract class RelativeDeviceBranchInstruction extends Instruction {
	override argumentList(): InstructionArgument[] {
		return [ArgumentCalculators.devicePinMaybeEmpty("device"), ArgumentCalculators.anyNumber("relative")];
	}
	public abstract predicateDeviceSet(isSet: boolean): boolean;
	override run(): void {
		const relative = this.getArgumentValue<number>("relative");
		const device = this.getArgumentValue<number>("device");
		const isSet = this.context.isConnectDeviceByPin(device);
		if (this.predicateDeviceSet(isSet)) {
			this.context.setNextLineIndex(this.line.position + relative);
		}
	}
}

abstract class DeviceBranchAndLinkInstruction extends Instruction {
	override argumentList(): InstructionArgument[] {
		return [ArgumentCalculators.devicePinMaybeEmpty("device"), ArgumentCalculators.anyNumber("line")];
	}
	public abstract predicateDeviceSet(isSet: boolean): boolean;
	override run(): void {
		const line = this.getArgumentValue<number>("line");
		const device = this.getArgumentValue<number>("device");
		const isSet = this.context.isConnectDeviceByPin(device);
		if (this.predicateDeviceSet(isSet)) {
			this.context.setNextLineIndex(line, true);
		}
	}
}

// ===== Factory to reduce duplication =====
/** A base class above whose `predicate` takes the operands as numbers. */
type PredicateBase<Args extends number[]> = abstract new (
	...args: any[]
) => Instruction & { predicate(...operands: Args): boolean };

/** `Base` with its abstract `predicate` filled in by `pred`. */
function withPredicate<Args extends number[], TBase extends PredicateBase<Args>>(
	Base: TBase,
	pred: (...operands: Args) => boolean,
) {
	abstract class WithPredicate extends Base {
		public predicate(...operands: Args): boolean {
			return pred(...operands);
		}
	}
	return WithPredicate;
}

// ===== S* implementations (write 1/0) =====
export class SltInstruction extends withPredicate(BinarySetConditionInstruction, cmp.lt) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tSet("slt", CASES.lt));
	}
}
export class SgtInstruction extends withPredicate(BinarySetConditionInstruction, cmp.gt) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tSet("sgt", CASES.gt));
	}
}
export class SleInstruction extends withPredicate(BinarySetConditionInstruction, cmp.le) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tSet("sle", CASES.le));
	}
}
export class SgeInstruction extends withPredicate(BinarySetConditionInstruction, cmp.ge) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tSet("sge", CASES.ge));
	}
}
export class SeqInstruction extends withPredicate(BinarySetConditionInstruction, cmp.eq) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tSet("seq", CASES.eq));
	}
}
export class SneInstruction extends withPredicate(BinarySetConditionInstruction, cmp.ne) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tSet("sne", CASES.ne));
	}
}

// Approximate
export class SapInstruction extends withPredicate(TernarySetConditionInstruction, approxEqual) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tSet("sap", CASES.ap));
	}
}
export class SnaInstruction extends withPredicate(TernarySetConditionInstruction, approxNotEqual) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tSet("sna", CASES.na));
	}
}

// Relative to 0
export class SltzInstruction extends withPredicate(UnarySetConditionInstruction, un.lt0) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tSet("sltz", CASES.lt0));
	}
}
export class SgtzInstruction extends withPredicate(UnarySetConditionInstruction, un.gt0) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tSet("sgtz", CASES.gt0));
	}
}
export class SlezInstruction extends withPredicate(UnarySetConditionInstruction, un.le0) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tSet("slez", CASES.le0));
	}
}
export class SgezInstruction extends withPredicate(UnarySetConditionInstruction, un.ge0) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tSet("sgez", CASES.ge0));
	}
}
export class SeqzInstruction extends withPredicate(UnarySetConditionInstruction, un.eq0) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tSet("seqz", CASES.eq0));
	}
}
export class SnezInstruction extends withPredicate(UnarySetConditionInstruction, un.ne0) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tSet("snez", CASES.ne0));
	}
}

// |a| comparison against eps*8
// Change notice (G21): sapz and snaz take the b operand. The upstream tests used the one-operand form.
export class SapzInstruction extends withPredicate(ToleranceSetConditionInstruction, approxZero) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tSet("sapz", CASES.apz));
	}
}
export class SnazInstruction extends withPredicate(ToleranceSetConditionInstruction, notApproxZero) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tSet("snaz", CASES.naz));
	}
}

// NaN checks
export class SnanInstruction extends withPredicate(UnarySetConditionInstruction, un.nan) {
	static override tests(): InstructionTestData[] {
		return devTests(() => [
			...tSet("snan", CASES.nan),
			{
				title: "the NaN from 0 / 0",
				code: "div r0 0 0\nsnan r1 r0\nsnanz r2 r0",
				expected: [expectReg(1, 1), expectReg(2, 0)],
			},
		]);
	}
}
export class SnanzInstruction extends withPredicate(UnarySetConditionInstruction, un.nanz) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tSet("snanz", CASES.nanz));
	}
}

// Device set/not set
export class SdseInstruction extends DeviceSetConditionInstruction {
	static override tests(): InstructionTestData[] {
		return devTests(() => tSet("sdse", CASES.dse));
	}
	public predicateDeviceSet(isSet: boolean): boolean {
		return isSet;
	}
}
export class SdnsInstruction extends DeviceSetConditionInstruction {
	static override tests(): InstructionTestData[] {
		return devTests(() => tSet("sdns", CASES.dns));
	}
	public predicateDeviceSet(isSet: boolean): boolean {
		return !isSet;
	}
}

// ===== Absolute branches a ? b -> line =====
export class BltInstruction extends withPredicate(BinaryBranchInstruction, cmp.lt) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tBranch("blt", CASES.lt));
	}
}
export class BgtInstruction extends withPredicate(BinaryBranchInstruction, cmp.gt) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tBranch("bgt", CASES.gt));
	}
}
export class BleInstruction extends withPredicate(BinaryBranchInstruction, cmp.le) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tBranch("ble", CASES.le));
	}
}
export class BgeInstruction extends withPredicate(BinaryBranchInstruction, cmp.ge) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tBranch("bge", CASES.ge));
	}
}
export class BeqInstruction extends withPredicate(BinaryBranchInstruction, cmp.eq) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tBranch("beq", CASES.eq));
	}
}
export class BneInstruction extends withPredicate(BinaryBranchInstruction, cmp.ne) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tBranch("bne", CASES.ne));
	}
}

// Absolute branches with approximate comparison
export class BapInstruction extends withPredicate(TernaryBranchInstruction, approxEqual) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tBranch("bap", CASES.ap));
	}
}
export class BnaInstruction extends withPredicate(TernaryBranchInstruction, approxNotEqual) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tBranch("bna", CASES.na));
	}
}

// Absolute branches against zero/NaN
export class BeqzInstruction extends withPredicate(UnaryBranchInstruction, un.eq0) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tBranch("beqz", CASES.eq0));
	}
}
export class BnezInstruction extends withPredicate(UnaryBranchInstruction, un.ne0) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tBranch("bnez", CASES.ne0));
	}
}
export class BapzInstruction extends withPredicate(ToleranceBranchInstruction, approxZero) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tBranch("bapz", CASES.apz));
	}
}
export class BnazInstruction extends withPredicate(ToleranceBranchInstruction, notApproxZero) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tBranch("bnaz", CASES.naz));
	}
}
export class BnanInstruction extends withPredicate(UnaryBranchInstruction, un.nan) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tBranch("bnan", CASES.nan));
	}
}

// Absolute branches on device
export class BdseInstruction extends DeviceBranchInstruction {
	static override tests(): InstructionTestData[] {
		return devTests(() => tBranch("bdse", CASES.dse));
	}
	public predicateDeviceSet(isSet: boolean): boolean {
		return isSet;
	}
}
export class BdnsInstruction extends DeviceBranchInstruction {
	static override tests(): InstructionTestData[] {
		return devTests(() => tBranch("bdns", CASES.dns));
	}
	public predicateDeviceSet(isSet: boolean): boolean {
		return !isSet;
	}
}

// ===== Relative branches =====
export class BrltInstruction extends withPredicate(RelativeBinaryBranchInstruction, cmp.lt) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tRelBranch("brlt", CASES.lt));
	}
}
export class BrgtInstruction extends withPredicate(RelativeBinaryBranchInstruction, cmp.gt) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tRelBranch("brgt", CASES.gt));
	}
}
export class BrleInstruction extends withPredicate(RelativeBinaryBranchInstruction, cmp.le) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tRelBranch("brle", CASES.le));
	}
}
export class BrgeInstruction extends withPredicate(RelativeBinaryBranchInstruction, cmp.ge) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tRelBranch("brge", CASES.ge));
	}
}
export class BreqInstruction extends withPredicate(RelativeBinaryBranchInstruction, cmp.eq) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tRelBranch("breq", CASES.eq));
	}
}
export class BrneInstruction extends withPredicate(RelativeBinaryBranchInstruction, cmp.ne) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tRelBranch("brne", CASES.ne));
	}
}

export class BrapInstruction extends withPredicate(RelativeTernaryBranchInstruction, approxEqual) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tRelBranch("brap", CASES.ap));
	}
}
export class BrnaInstruction extends withPredicate(RelativeTernaryBranchInstruction, approxNotEqual) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tRelBranch("brna", CASES.na));
	}
}

export class BreqzInstruction extends withPredicate(RelativeUnaryBranchInstruction, un.eq0) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tRelBranch("breqz", CASES.eq0));
	}
}
export class BrnezInstruction extends withPredicate(RelativeUnaryBranchInstruction, un.ne0) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tRelBranch("brnez", CASES.ne0));
	}
}
export class BrapzInstruction extends withPredicate(RelativeToleranceBranchInstruction, approxZero) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tRelBranch("brapz", CASES.apz));
	}
}
export class BrnazInstruction extends withPredicate(RelativeToleranceBranchInstruction, notApproxZero) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tRelBranch("brnaz", CASES.naz));
	}
}
export class BrnanInstruction extends withPredicate(RelativeUnaryBranchInstruction, un.nan) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tRelBranch("brnan", CASES.nan));
	}
}

// ===== Variants that save ra (AL) =====
// ra is the line after the branch, as in game
export class BltalInstruction extends withPredicate(BinaryBranchAndLinkInstruction, cmp.lt) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tBranch("bltal", CASES.lt, { link: true }));
	}
}
export class BgtalInstruction extends withPredicate(BinaryBranchAndLinkInstruction, cmp.gt) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tBranch("bgtal", CASES.gt, { link: true }));
	}
}
export class BlealInstruction extends withPredicate(BinaryBranchAndLinkInstruction, cmp.le) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tBranch("bleal", CASES.le, { link: true }));
	}
}
export class BgealInstruction extends withPredicate(BinaryBranchAndLinkInstruction, cmp.ge) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tBranch("bgeal", CASES.ge, { link: true }));
	}
}
export class BeqalInstruction extends withPredicate(BinaryBranchAndLinkInstruction, cmp.eq) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tBranch("beqal", CASES.eq, { link: true }));
	}
}
export class BnealInstruction extends withPredicate(BinaryBranchAndLinkInstruction, cmp.ne) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tBranch("bneal", CASES.ne, { link: true }));
	}
}

export class BapalInstruction extends withPredicate(TernaryBranchAndLinkInstruction, approxEqual) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tBranch("bapal", CASES.ap, { link: true }));
	}
}
export class BnaalInstruction extends withPredicate(TernaryBranchAndLinkInstruction, approxNotEqual) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tBranch("bnaal", CASES.na, { link: true }));
	}
}

export class BeqzalInstruction extends withPredicate(UnaryBranchAndLinkInstruction, un.eq0) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tBranch("beqzal", CASES.eq0, { link: true }));
	}
}
export class BnezalInstruction extends withPredicate(UnaryBranchAndLinkInstruction, un.ne0) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tBranch("bnezal", CASES.ne0, { link: true }));
	}
}
export class BapzalInstruction extends withPredicate(ToleranceBranchAndLinkInstruction, approxZero) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tBranch("bapzal", CASES.apz, { link: true }));
	}
}
export class BnazalInstruction extends withPredicate(ToleranceBranchAndLinkInstruction, notApproxZero) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tBranch("bnazal", CASES.naz, { link: true }));
	}
}

// ===== Relative device branches =====
export class BrdseInstruction extends RelativeDeviceBranchInstruction {
	static override tests(): InstructionTestData[] {
		return devTests(() => tRelBranch("brdse", CASES.dse));
	}
	public predicateDeviceSet(isSet: boolean): boolean {
		return isSet;
	}
}
export class BrdnsInstruction extends RelativeDeviceBranchInstruction {
	static override tests(): InstructionTestData[] {
		return devTests(() => tRelBranch("brdns", CASES.dns));
	}
	public predicateDeviceSet(isSet: boolean): boolean {
		return !isSet;
	}
}

// Absolute device branches with AL
export class BdsealInstruction extends DeviceBranchAndLinkInstruction {
	static override tests(): InstructionTestData[] {
		return devTests(() => tBranch("bdseal", CASES.dse, { link: true }));
	}
	public predicateDeviceSet(isSet: boolean): boolean {
		return isSet;
	}
}
export class BdnsalInstruction extends DeviceBranchAndLinkInstruction {
	static override tests(): InstructionTestData[] {
		return devTests(() => tBranch("bdnsal", CASES.dns, { link: true }));
	}
	public predicateDeviceSet(isSet: boolean): boolean {
		return !isSet;
	}
}
// ===== Absolute branches (Unary) =====
export class BltzInstruction extends withPredicate(UnaryBranchInstruction, un.lt0) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tBranch("bltz", CASES.lt0));
	}
}
export class BgezInstruction extends withPredicate(UnaryBranchInstruction, un.ge0) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tBranch("bgez", CASES.ge0));
	}
}
export class BlezInstruction extends withPredicate(UnaryBranchInstruction, un.le0) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tBranch("blez", CASES.le0));
	}
}
export class BgtzInstruction extends withPredicate(UnaryBranchInstruction, un.gt0) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tBranch("bgtz", CASES.gt0));
	}
}

// ===== Absolute branches that save the return address (Unary AL) =====
export class BltzalInstruction extends withPredicate(UnaryBranchAndLinkInstruction, un.lt0) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tBranch("bltzal", CASES.lt0, { link: true }));
	}
}
export class BgezalInstruction extends withPredicate(UnaryBranchAndLinkInstruction, un.ge0) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tBranch("bgezal", CASES.ge0, { link: true }));
	}
}
export class BlezalInstruction extends withPredicate(UnaryBranchAndLinkInstruction, un.le0) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tBranch("blezal", CASES.le0, { link: true }));
	}
}
export class BgtzalInstruction extends withPredicate(UnaryBranchAndLinkInstruction, un.gt0) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tBranch("bgtzal", CASES.gt0, { link: true }));
	}
}

// ===== Relative branches (Relative Unary) =====
export class BrltzInstruction extends withPredicate(RelativeUnaryBranchInstruction, un.lt0) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tRelBranch("brltz", CASES.lt0));
	}
}
export class BrgezInstruction extends withPredicate(RelativeUnaryBranchInstruction, un.ge0) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tRelBranch("brgez", CASES.ge0));
	}
}
export class BrlezInstruction extends withPredicate(RelativeUnaryBranchInstruction, un.le0) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tRelBranch("brlez", CASES.le0));
	}
}
export class BrgtzInstruction extends withPredicate(RelativeUnaryBranchInstruction, un.gt0) {
	static override tests(): InstructionTestData[] {
		return devTests(() => tRelBranch("brgtz", CASES.gt0));
	}
}

export class SelectInstruction extends Instruction {
	override argumentList(): InstructionArgument[] {
		return [
			ArgumentCalculators.registerLink("result"),
			ArgumentCalculators.anyNumber("a"),
			ArgumentCalculators.anyNumber("b"),
			ArgumentCalculators.anyNumber("c"),
		];
	}

	override run(): void {
		const result = this.getArgumentValue<number>("result");
		const a = this.getArgumentValue<number>("a");
		const b = this.getArgumentValue<number>("b");
		const c = this.getArgumentValue<number>("c");

		// Select b if a is non-zero, otherwise c
		const value = a !== 0 ? b : c;
		this.context.setRegister(result, value);
	}

	static override tests(): InstructionTestData[] {
		return devTests(() => [
			{
				code: "select r2 1 10 20",
				expected: [expectReg(2, 10)], // a=1 (non-zero) → select b=10
			},
			{
				code: "select r2 0 10 20",
				expected: [expectReg(2, 20)], // a=0 → select c=20
			},
			{
				code: "select r3 -5 100 200",
				expected: [expectReg(3, 100)], // a=-5 (non-zero) → select b=100
			},
			{
				code: "select r4 0.0001 50 60",
				expected: [expectReg(4, 50)], // a=0.0001 (non-zero) → select b=50
			},
		]);
	}
}
