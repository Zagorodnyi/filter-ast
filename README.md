# @sirzag/filter-ast

Turns a declarative filter object with operator strings into a database-agnostic filter tree.

## Install

```sh
npm install @sirzag/filter-ast
```

```sh
bun add @sirzag/filter-ast
```

## Quick start

```ts
import { buildAbstractFilterTree } from "@sirzag/filter-ast";

buildAbstractFilterTree({
  status: "$in(active,pending)",
  age: "$gte(18)",
  name: "John",
});
```

```js
[
  {
    joinLogic: 'and',
    conditions: [
      { field: 'status', operator: 'in', value: [ 'active', 'pending' ] },
      { field: 'age', operator: 'gte', value: 18 },
      { field: 'name', operator: 'eq', value: 'John' }
    ]
  }
]
```

The package has named exports only: `buildAbstractFilterTree`, `$and`, `$or`, `joinOr`, `isFilterGroup`, `QueryHelpers`, `FilterError`, and the types `FilterGroup`, `FilterCondition`, `FilterExpression`, `FilterValue`, `FilterFieldValue`, `FilterInput`, `LogicalOperator`, `Operator`, `ParsedOperator`.

## Filter syntax

### Bare values

A value that is not an operator string becomes an `eq` condition and is passed through as is. `undefined` fields are dropped.

```ts
buildAbstractFilterTree({ name: "John", age: 30, deletedAt: null, archived: undefined });
```

```js
[
  {
    joinLogic: 'and',
    conditions: [
      { field: 'name', operator: 'eq', value: 'John' },
      { field: 'age', operator: 'eq', value: 30 },
      { field: 'deletedAt', operator: 'eq', value: null }
    ]
  }
]
```

A string that starts with `$` but is not a known `$operator(payload)` is also matched literally (`"$100"` → `eq "$100"`).

### Operators

An operator string has the form `$operator(payload)`. An empty or whitespace-only payload (`$eq()`, `$eq( )`) drops the condition, except for `$in` and `$not_in`, where `$in()` and `$in( )` are kept as an empty list. A quoted blank is a value: `$eq(" ")` → `' '`.

| Input | Output `operator` | Example | Output `value` |
|---|---|---|---|
| `$eq` | `eq` | `$eq(42)` | `42` |
| `$ne` | `ne` | `$ne(42)` | `42` |
| `$not` | `not` | `$not(42)` | `42` |
| `$gt` | `gt` | `$gt(10)` | `10` |
| `$gte` | `gte` | `$gte(10)` | `10` |
| `$lt` | `lt` | `$lt(10)` | `10` |
| `$lte` | `lte` | `$lte(10)` | `10` |
| `$in` | `in` | `$in(1,2,3)` | `[ 1, 2, 3 ]` |
| `$not_in` | `not_in` | `$not_in(a,b)` | `[ 'a', 'b' ]` |
| `$contains` | `contains` | `$contains(foo)` | `'foo'` |
| `$has` | `has` | `$has(tag)` | `'tag'` |
| `$like` | `like` | `$like(%john%)` | `'%john%'` |
| `$between` | `between` | `$between(1,10)` | `[ 1, 10 ]` |

`$in`, `$not_in` and `$between` split the payload on `,`; every other operator keeps commas as part of the value. An item that starts with `"` keeps its commas up to the next `"` not preceded by `\`: `$in("a,b",c)` → `[ 'a,b', 'c' ]`. Escaped quotes do not protect commas (`$in(\"a,b\")` → `[ '\\"a', 'b\\"' ]`), and an unterminated `"` is ordinary text (`$in("a,b)` → `[ '"a', 'b' ]`).

## Value coercion

Every operator payload, and every element of `$in`/`$not_in`/`$between`, is coerced with one rule. This includes `$like`, `$contains` and `$has`. The first matching step wins:

1. Wrapped in double quotes → the inner string, verbatim. `\"...\"` keeps the quotes.
2. Starts with `0x`, `0b` or `0o` (any case) → the string, untouched.
3. Starts with a digit, or with `-` followed by a digit, and is `-?digits` followed by `n` → `bigint`.
4. Starts with a digit, or with `-` followed by a digit, and is a complete, finite decimal number → `number`. Integers outside `Number.MAX_SAFE_INTEGER` keep their original text.
5. `true`, `false`, `null` → the literal. `undefined` is not a literal and stays a string.
6. Anything else → the trimmed string.

There is no `Date` coercion. Date-like text stays a string.

| Payload | Value |
|---|---|
| `$eq(007)` | `7` |
| `$eq("007")` | `'007'` |
| `$like(007)` | `7` |
| `$like("007")` | `'007'` |
| `$eq(1e3)` | `1000` |
| `$eq(0x10)` | `'0x10'` |
| `$eq(0b101)` | `'0b101'` |
| `$eq(0o17)` | `'0o17'` |
| `$eq(true)` | `true` |
| `$eq("true")` | `'true'` |
| `$eq(null)` | `null` |
| `$eq(undefined)` | `'undefined'` |
| `$eq(\"quoted\")` | `'"quoted"'` |
| `$eq(Infinity)` | `'Infinity'` |
| `$eq(-Infinity)` | `'-Infinity'` |
| `$eq(NaN)` | `'NaN'` |
| `$eq(+1)` | `'+1'` |
| `$eq(.5)` | `'.5'` |
| `$eq(-.5)` | `'-.5'` |
| `$eq(9007199254740991)` | `9007199254740991` |
| `$eq(9007199254740993)` | `'9007199254740993'` |
| `$eq(123n)` | `123n` |
| `$eq(9007199254740993n)` | `9007199254740993n` |
| `$eq("123n")` | `'123n'` |
| `$gt(2024-01-01)` | `'2024-01-01'` |
| `$gte(2024-01-01T10:20:30Z)` | `'2024-01-01T10:20:30Z'` |
| `$in(1,"2",true,null)` | `[ 1, '2', true, null ]` |

### Quote text that looks like a number

Leading-zero text such as phone numbers or ZIP codes is coerced to a number unless quoted:

| Payload | Value |
|---|---|
| `$eq(0501234567)` | `501234567` |
| `$eq("0501234567")` | `'0501234567'` |

Text ending in digits plus `n` (`123n`) must also be quoted to stay a string.

### Hex, binary and octal stay strings

Radix-prefixed text is never converted, so crypto addresses and hex-encoded values reach the database as written:

| Payload | Value |
|---|---|
| `$eq(0x742d35Cc6634C0532925a3b844Bc454e4438f44e)` | `'0x742d35Cc6634C0532925a3b844Bc454e4438f44e'` |
| `$eq(0xdeadbeef)` | `'0xdeadbeef'` |
| `$in(0x1,0b1,0o1,1)` | `[ '0x1', '0b1', '0o1', 1 ]` |

Convert the value yourself when you need the number: `Number(value)` or `BigInt(value)`.

`$between` on these strings compares text, not magnitude: `$between(0xf,0x10)` throws because `'0xf' > '0x10'`. Use equal-length, zero-padded values or convert them first.

### Big integers

- Use the `n` suffix for integers beyond `Number.MAX_SAFE_INTEGER`: `$eq(9007199254740993n)` → `9007199254740993n`.
- Without the suffix they stay strings: `$eq(9007199254740993)` → `'9007199254740993'`.
- `bigint` values are not JSON-serializable. `JSON.stringify` throws a `TypeError` on a tree that contains one, so serialize them yourself.

### `$between`

`$between` takes exactly two values of the same type, and the first must be less than or equal to the second.

| Payload | Result |
|---|---|
| `$between(1,10)` | `[ 1, 10 ]` |
| `$between(2024-01-01,2024-12-31)` | `[ '2024-01-01', '2024-12-31' ]` |
| `$between(1,9007199254740993n)` | `[ 1n, 9007199254740993n ]` |
| `$between(1,9007199254740993)` | throws `$between operator values must be of the same type` |
| `$between(1,abc)` | throws `$between operator values must be of the same type` |
| `$between(,5)` | throws `$between operator requires exactly 2 values` |
| `$between(10,1)` | throws `First value in $between must be less than or equal to second value` |
| `$between(0xf,0x10)` | throws `First value in $between must be less than or equal to second value` |
| `$between(1.5,10n)` | throws `$between operator cannot combine a bigint with a non-integer number` |
| `$between(true,false)` | throws `$between operator received an unsupported value type (boolean or null)` |

- When either side is a `bigint`, an integer `number` on the other side is converted to `bigint`.
- Strings are ordered with JavaScript string comparison. ISO dates in one format order correctly: `$between(2024-09-01,2024-10-01)` → `[ '2024-09-01', '2024-10-01' ]`. Mixed or non-ISO formats can throw on a valid range: `$between(9/1/2024,10/1/2024)` throws `First value in $between must be less than or equal to second value`. `Date.prototype.toString()` output also orders incorrectly.

## Groups

### `$and`

```ts
import { buildAbstractFilterTree, $and } from "@sirzag/filter-ast";

buildAbstractFilterTree({ name: "John", [$and]: { age: "$gte(18)", country: "UA" } });
```

```js
[
  {
    joinLogic: 'and',
    conditions: [
      { field: 'name', operator: 'eq', value: 'John' },
      {
        joinLogic: 'and',
        conditions: [
          { field: 'age', operator: 'gte', value: 18 },
          { field: 'country', operator: 'eq', value: 'UA' }
        ]
      }
    ]
  }
]
```

### `$or`

One object can hold several `[$or]` branches. The remaining fields of that object become the first branch.

```ts
import { buildAbstractFilterTree, $or } from "@sirzag/filter-ast";

buildAbstractFilterTree({
  status: "active",
  [$or]: { role: "admin" },
  [$or]: { role: "owner", verified: true },
});
```

```js
[
  {
    joinLogic: 'or',
    conditions: [
      {
        joinLogic: 'and',
        conditions: [ { field: 'status', operator: 'eq', value: 'active' } ]
      },
      {
        joinLogic: 'and',
        conditions: [ { field: 'role', operator: 'eq', value: 'admin' } ]
      },
      {
        joinLogic: 'and',
        conditions: [
          { field: 'role', operator: 'eq', value: 'owner' },
          { field: 'verified', operator: 'eq', value: true }
        ]
      }
    ]
  }
]
```

### `joinOr`

`joinOr` joins the fields of one level with OR, without creating a nested group.

```ts
import { buildAbstractFilterTree, $and, joinOr } from "@sirzag/filter-ast";

buildAbstractFilterTree({
  name: "John",
  [$and]: joinOr({ createdAt: "$lte(2020-01-04)", twoFactorEnabled: true }),
});
```

```js
[
  {
    joinLogic: 'and',
    conditions: [
      { field: 'name', operator: 'eq', value: 'John' },
      {
        joinLogic: 'or',
        conditions: [
          { field: 'createdAt', operator: 'lte', value: '2020-01-04' },
          { field: 'twoFactorEnabled', operator: 'eq', value: true }
        ]
      }
    ]
  }
]
```

At the root, `buildAbstractFilterTree(joinOr({ a: 1, b: 2 }))` returns:

```js
[
  {
    joinLogic: 'or',
    conditions: [ { field: 'a', operator: 'eq', value: 1 }, { field: 'b', operator: 'eq', value: 2 } ]
  }
]
```

## Output shape

`buildAbstractFilterTree` returns `FilterGroup[]`: an empty array for `undefined`, `null`, or a filter with no conditions left, otherwise one root group. A group whose conditions were all dropped (`undefined` fields, empty payloads, empty nested groups) is dropped at every depth, so `{ x: 1, [$or]: { a: undefined } }` matches `x = 1`, never everything. Any other non-object root, and any array, throws `TypeError: Filter must be a non-array object`.

```ts
type ParsedOperator =
  | "eq" | "ne" | "not" | "gt" | "gte" | "lt" | "lte"
  | "in" | "not_in" | "contains" | "has" | "like" | "between";

interface FilterCondition {
  field: string;
  operator: ParsedOperator;
  value: unknown;
}

interface FilterGroup {
  joinLogic: "or" | "and";
  conditions: Array<FilterCondition | FilterGroup>;
}
```

`isFilterGroup` tells groups and conditions apart:

```ts
import { buildAbstractFilterTree, $and, isFilterGroup } from "@sirzag/filter-ast";

const [root] = buildAbstractFilterTree({ a: 1, [$and]: { b: 2 } });
root.conditions.map((c) => isFilterGroup(c)); // [ false, true ]
```

## Errors

Every `$between` validation error is a `FilterError`. It extends `Error` and carries the field and the raw operator string:

```ts
import { buildAbstractFilterTree, FilterError } from "@sirzag/filter-ast";

try {
  buildAbstractFilterTree({ age: "$between(30,18)" });
} catch (error) {
  if (error instanceof FilterError) {
    error.name;    // 'FilterError'
    error.field;   // 'age'
    error.value;   // '$between(30,18)'
    error.message; // 'First value in $between must be less than or equal to second value'
  }
}
```

A non-object root throws a plain `TypeError`, not a `FilterError`.

## Limitations

- `$and` and `$or` work only as computed keys in object literals. They are not reusable symbols: each use creates a new key, so `obj[$and] = { a: 1 }` followed by `obj[$and]` returns `undefined`.
- Any symbol key whose description is `"or"` is treated as an OR branch. `{ a: 1, [Symbol("or")]: { b: 2 } }` builds an OR of `a` and `b`.
- Input types are compile-time only. `FilterInput` rejects functions, symbols and plain objects as field values, but field values are not checked at runtime.
- There are no adapters and no SQL generation. Field names are passed through unsanitized (`{ "name; DROP TABLE users": "x" }` → `field: 'name; DROP TABLE users'`). Never concatenate them into SQL.

## License

[MIT](./LICENSE)
