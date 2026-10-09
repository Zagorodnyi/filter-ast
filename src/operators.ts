import { FilterError } from "./FilterError";
import type { Operator, ParsedOperator } from "./types";

type Primitive = string | number | bigint | boolean | null;

interface OperatorConfig {
  readonly operator: ParsedOperator;
  readonly parser: (source: string, start: number, end: number, field: string) => Primitive | Primitive[] | undefined;
}

const TAB = 9;
const CARRIAGE_RETURN = 13;
const SPACE = 32;
const QUOTE = 34;
const MINUS = 45;
const ZERO = 48;
const NINE = 57;
const BACKSLASH = 92;
const LOWER_B = 98;
const LOWER_N = 110;
const LOWER_O = 111;
const LOWER_X = 120;
const ASCII_LOWER_BIT = 32;
const LATIN1_MAX = 255;
const MAX_EXACT_DIGITS = 15;

const scalar = (operator: ParsedOperator): OperatorConfig => ({ operator, parser: parseValue });
const list = (operator: ParsedOperator): OperatorConfig => ({ operator, parser: parseList });

const OPERATORS = {
  $eq: scalar("eq"),
  $ne: scalar("ne"),
  $not: scalar("not"),
  $gt: scalar("gt"),
  $gte: scalar("gte"),
  $lt: scalar("lt"),
  $lte: scalar("lte"),
  $in: list("in"),
  $not_in: list("not_in"),
  $contains: scalar("contains"),
  $has: scalar("has"),
  $like: scalar("like"),
  $between: { operator: "between", parser: parseBetween },
} satisfies Record<Operator, OperatorConfig>;

const EQ = pack("$eq", 3);
const NE = pack("$ne", 3);
const GT = pack("$gt", 3);
const LT = pack("$lt", 3);
const IN = pack("$in", 3);
const NOT = pack("$not", 4);
const GTE = pack("$gte", 4);
const LTE = pack("$lte", 4);
const HAS = pack("$has", 4);

export function resolveOperator(source: string, open: number): OperatorConfig | undefined {
  switch (open) {
    case 3:
      switch (pack(source, 3)) {
        case EQ: return OPERATORS.$eq;
        case NE: return OPERATORS.$ne;
        case GT: return OPERATORS.$gt;
        case LT: return OPERATORS.$lt;
        case IN: return OPERATORS.$in;
      }
      return undefined;
    case 4:
      switch (pack(source, 4)) {
        case NOT: return OPERATORS.$not;
        case GTE: return OPERATORS.$gte;
        case LTE: return OPERATORS.$lte;
        case HAS: return OPERATORS.$has;
      }
      return undefined;
    case 5:
      return source.startsWith("$like") ? OPERATORS.$like : undefined;
    case 7:
      return source.startsWith("$not_in") ? OPERATORS.$not_in : undefined;
    case 8:
      return source.startsWith("$between") ? OPERATORS.$between : undefined;
    case 9:
      return source.startsWith("$contains") ? OPERATORS.$contains : undefined;
  }
  return undefined;
}

function pack(source: string, end: number): number {
  let code = 0;
  for (let i = 1; i < end; i++) {
    const c = source.charCodeAt(i);
    if (c > LATIN1_MAX) {
      return -1;
    }
    code = (code << 8) | c;
  }
  return code;
}

function parseValue(source: string, start: number, end: number): Primitive | undefined {
  start = skipSpace(source, start, end);
  end = trimSpaceEnd(source, start, end);
  const int = readExactInteger(source, start, end);
  if (int === int) {
    return int;
  }
  const str = source.slice(start, end).trim();
  return str === "" ? undefined : parseTrimmed(str);
}

function parseList(source: string, start: number, end: number): Primitive[] {
  const out: Primitive[] = [];
  let from = skipSpace(source, start, end);
  for (;;) {
    const stop = itemEnd(source, from, end);
    const to = trimSpaceEnd(source, from, stop);
    const int = readExactInteger(source, from, to);
    if (int === int) {
      out.push(int);
    } else {
      const part = source.slice(from, to).trim();
      if (part !== "") {
        out.push(parseTrimmed(part));
      }
    }
    if (stop === end) {
      return out;
    }
    from = skipSpace(source, stop + 1, end);
  }
}

function parseBetween(source: string, start: number, end: number, field: string): Primitive[] | undefined {
  const from = skipSpace(source, start, end);
  const comma = itemEnd(source, from, end);
  if (comma === end && parseValue(source, from, end) === undefined) {
    return undefined;
  }
  if (comma === end || itemEnd(source, skipSpace(source, comma + 1, end), end) !== end) {
    throw new FilterError("$between operator requires exactly 2 values", field, source);
  }
  let low = parseValue(source, from, comma);
  let high = parseValue(source, comma + 1, end);

  if (low === undefined || high === undefined) {
    throw new FilterError("$between operator requires exactly 2 values", field, source);
  }
  if (low === null || high === null || typeof low === "boolean" || typeof high === "boolean") {
    throw new FilterError("$between operator received an unsupported value type (boolean or null)", field, source);
  }
  if (typeof low === "bigint" || typeof high === "bigint") {
    low = toBigIntBound(low, field, source);
    high = toBigIntBound(high, field, source);
  }
  if (typeof low !== typeof high) {
    throw new FilterError("$between operator values must be of the same type", field, source);
  }
  if (low > high) {
    throw new FilterError("First value in $between must be less than or equal to second value", field, source);
  }
  return [low, high];
}

function itemEnd(source: string, start: number, end: number): number {
  let search = start;
  if (source.charCodeAt(start) === QUOTE) {
    const close = closingQuote(source, start + 1, end);
    if (close !== -1) {
      search = close + 1;
    }
  }
  const comma = source.indexOf(",", search);
  return comma === -1 || comma > end ? end : comma;
}

function closingQuote(source: string, start: number, end: number): number {
  for (let i = source.indexOf('"', start); i !== -1 && i < end; i = source.indexOf('"', i + 1)) {
    if (source.charCodeAt(i - 1) !== BACKSLASH) {
      return i;
    }
  }
  return -1;
}

function skipSpace(source: string, start: number, end: number): number {
  while (start < end && isSpace(source.charCodeAt(start))) {
    start++;
  }
  return start;
}

function trimSpaceEnd(source: string, start: number, end: number): number {
  while (end > start && isSpace(source.charCodeAt(end - 1))) {
    end--;
  }
  return end;
}

function isSpace(c: number): boolean {
  return c <= SPACE && (c === SPACE || (c >= TAB && c <= CARRIAGE_RETURN));
}

function isDigit(c: number): boolean {
  return c >= ZERO && c <= NINE;
}

function toBigIntBound(value: string | number | bigint, field: string, source: string): string | bigint {
  if (typeof value !== "number") {
    return value;
  }
  if (!Number.isInteger(value)) {
    throw new FilterError("$between operator cannot combine a bigint with a non-integer number", field, source);
  }
  return BigInt(value);
}

function readExactInteger(source: string, start: number, end: number): number {
  const negative = source.charCodeAt(start) === MINUS;
  let i = negative ? start + 1 : start;
  if (i >= end || end - i > MAX_EXACT_DIGITS) {
    return NaN;
  }
  let value = 0;
  for (; i < end; i++) {
    const digit = source.charCodeAt(i) - ZERO;
    if (digit >>> 0 > 9) {
      return NaN;
    }
    value = value * 10 + digit;
  }
  return negative ? -value : value;
}

function parseTrimmed(str: string): Primitive {
  const quoted = readEdgeQuotes(str);
  if (quoted !== null) {
    return quoted;
  }

  const first = str.charCodeAt(0);
  if (isDigit(first) || (first === MINUS && isDigit(str.charCodeAt(1)))) {
    if (hasRadixPrefix(str)) {
      return str;
    }
    if (isBigIntLiteral(str)) {
      return BigInt(str.slice(0, -1));
    }
    const num = Number(str);
    if (Number.isFinite(num) && (!Number.isInteger(num) || Number.isSafeInteger(num))) {
      return num;
    }
    return str;
  }

  switch (str) {
    case "true": return true;
    case "false": return false;
    case "null": return null;
  }
  return str;
}

function readEdgeQuotes(s: string): string | null {
  const len = s.length;
  if (len < 2) {
    return null;
  }
  const first = s.charCodeAt(0);
  const last = s.charCodeAt(len - 1);
  if (first === QUOTE && last === QUOTE && s.charCodeAt(len - 2) !== BACKSLASH) {
    return s.slice(1, len - 1);
  }
  if (
    len >= 4 &&
    first === BACKSLASH && s.charCodeAt(1) === QUOTE &&
    s.charCodeAt(len - 2) === BACKSLASH && last === QUOTE
  ) {
    return '"' + s.slice(2, len - 2) + '"';
  }
  return null;
}

function isBigIntLiteral(s: string): boolean {
  const last = s.length - 1;
  if (last < 1 || s.charCodeAt(last) !== LOWER_N) {
    return false;
  }
  let i = s.charCodeAt(0) === MINUS ? 1 : 0;
  if (i === last) {
    return false;
  }
  for (; i < last; i++) {
    const c = s.charCodeAt(i);
    if (!isDigit(c)) {
      return false;
    }
  }
  return true;
}

function hasRadixPrefix(s: string): boolean {
  if (s.length < 2 || s.charCodeAt(0) !== ZERO) {
    return false;
  }
  const c = s.charCodeAt(1) | ASCII_LOWER_BIT;
  return c === LOWER_X || c === LOWER_B || c === LOWER_O;
}
