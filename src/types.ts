export type Operator =
  | "$eq"
  | "$ne"
  | "$not"
  | "$gt"
  | "$gte"
  | "$lt"
  | "$lte"
  | "$in"
  | "$contains"
  | "$has"
  | "$between"
  | "$not_in"
  | "$like";

export type ParsedOperator = Operator extends `$${infer Op}` ? Op : never;

export type FilterValue = `${Operator}(${string})`;

// Base filter condition interface
export interface FilterCondition {
  field: string;
  operator: ParsedOperator;
  value: unknown;
}

// Group operators for AND/OR
export type LogicalOperator = "or" | "and";

// Represents a group of conditions joined by AND or OR
export interface FilterGroup {
  joinLogic: LogicalOperator;
  conditions: Array<FilterCondition | FilterGroup>;
}

// Union type for all possible filter expressions
export type FilterExpression = FilterCondition | FilterGroup;

// Field values accepted by buildAbstractFilterTree (compile-time only)
export type FilterFieldValue =
  | FilterValue
  | string
  | number
  | bigint
  | boolean
  | null
  | undefined
  | Date
  | ReadonlyArray<string | number | bigint | boolean | null | Date>;

type GroupInput<V> = V extends Function | readonly unknown[] ? never : V extends object ? FilterInput<V> : never;

// Symbol keys ($and/$or) hold nested filters, every other key holds a field value
export type FilterInput<T> = { [K in keyof T]: K extends symbol ? GroupInput<T[K]> : FilterFieldValue };
