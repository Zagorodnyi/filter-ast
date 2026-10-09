import { resolveOperator } from "./operators";
import type { FilterExpression, FilterGroup, FilterInput } from "./types";

const JOIN = Symbol.for("join");
const DOLLAR = 36;
const CLOSE_PAREN = 41;

/**
 * Transforms a filter object into a list tree of conditions
 */
export const buildAbstractFilterTree = <T extends FilterInput<T>>(filterObj?: T | null): FilterGroup[] => {
  if (filterObj === undefined || filterObj === null) {
    return [];
  }
  if (typeof filterObj !== "object" || Array.isArray(filterObj)) {
    throw new TypeError("Filter must be a non-array object");
  }
  const group = buildGroup(filterObj as Record<PropertyKey, unknown>);
  return group === undefined ? [] : [group];
};

function buildGroup(filter: Record<PropertyKey, unknown>): FilterGroup | undefined {
  const conditions: FilterExpression[] = [];

  for (const field in filter) {
    if (!Object.prototype.hasOwnProperty.call(filter, field)) {
      continue;
    }
    const value = filter[field];

    if (typeof value === "string" && value.charCodeAt(0) === DOLLAR) {
      const open = value.indexOf("(");
      const close = value.length - 1;
      const op = open === -1 || value.charCodeAt(close) !== CLOSE_PAREN ? undefined : resolveOperator(value, open);
      if (op !== undefined) {
        const parsed = op.parser(value, open + 1, close, field);
        if (parsed !== undefined) {
          conditions.push({ field, operator: op.operator, value: parsed });
        }
        continue;
      }
    } else if (value === undefined) {
      continue;
    }
    conditions.push({ field, operator: "eq", value });
  }

  const symbols = Object.getOwnPropertySymbols(filter);
  if (symbols.length === 0) {
    return conditions.length === 0 ? undefined : { joinLogic: "and", conditions };
  }

  let orGroups: FilterGroup[] | undefined;
  let joinOr = false;
  for (let i = 0; i < symbols.length; i++) {
    const key = symbols[i];
    const value = filter[key];
    const target: FilterExpression[] = key.description === "or" ? (orGroups ??= []) : conditions;
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      if (key === JOIN && value === "or") {
        joinOr = true;
      }
      continue;
    }
    const nested = buildGroup(value as Record<PropertyKey, unknown>);
    if (nested !== undefined) {
      target.push(nested);
    }
  }

  if (orGroups !== undefined) {
    if (conditions.length > 0) {
      orGroups.unshift({ joinLogic: "and", conditions });
    }
    return orGroups.length === 0 ? undefined : { joinLogic: "or", conditions: orGroups };
  }
  return conditions.length === 0 ? undefined : { joinLogic: joinOr ? "or" : "and", conditions };
}
