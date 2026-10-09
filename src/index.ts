import { buildAbstractFilterTree } from "./builder";
import { FilterError } from "./FilterError";
import type {
  FilterCondition,
  FilterExpression,
  FilterFieldValue,
  FilterGroup,
  FilterInput,
  FilterValue,
  LogicalOperator,
  Operator,
  ParsedOperator,
} from "./types";
import { QueryHelpers } from "./QueryHelpers";

export const $and = QueryHelpers.$and;
export const $or = QueryHelpers.$or;
export const joinOr = QueryHelpers.joinOr;

export { buildAbstractFilterTree, FilterError, QueryHelpers }
export type {
  FilterCondition,
  FilterExpression,
  FilterFieldValue,
  FilterGroup,
  FilterInput,
  FilterValue,
  LogicalOperator,
  Operator,
  ParsedOperator,
};

/**
 * Type guard to check if an expression is a group
 */
export function isFilterGroup(expr: FilterExpression): expr is FilterGroup {
  return "joinLogic" in expr;
}
