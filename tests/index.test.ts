import { describe, test } from "node:test";
import assert from "node:assert/strict";

import * as api from "../src";
import { buildAbstractFilterTree, $and, $or, joinOr, FilterError, QueryHelpers } from "../src";

describe("Filter Transformation", () => {
  test("basic single level filters", () => {
    const filter = {
      a: "123",
      field2: "$ne(null)",
      status: "$in(completed,declined)",
    };

    const expected = [
      {
        joinLogic: "and",
        conditions: [
          {
            field: "a",
            operator: "eq",
            value: "123",
          },
          {
            field: "field2",
            operator: "ne",
            value: null,
          },
          {
            field: "status",
            operator: "in",
            value: ["completed", "declined"],
          },
        ],
      },
    ];

    assert.deepStrictEqual(buildAbstractFilterTree(filter), expected, "Basic filter transformation failed");
  });

  test("nested AND conditions", () => {
    const filter = {
      a: "123",
      field2: "$ne(null)",
      [$and]: {
        a: "444",
        field2: "red",
      },
    };

    const expected = [
      {
        joinLogic: "and",
        conditions: [
          {
            field: "a",
            operator: "eq",
            value: "123",
          },
          {
            field: "field2",
            operator: "ne",
            value: null,
          },
          {
            joinLogic: "and",
            conditions: [
              {
                field: "a",
                operator: "eq",
                value: "444",
              },
              {
                field: "field2",
                operator: "eq",
                value: "red",
              },
            ],
          },
        ],
      },
    ];

    assert.deepStrictEqual(
      buildAbstractFilterTree(filter),
      expected,
      "Nested AND conditions transformation failed",
    );
  });

  test("nested OR conditions", () => {
    const filter = {
      a: "123",
      field2: "$ne(null)",
      [$or]: {
        b: "444",
        field2: "$ne(red)",
      },
      [$or]: {
        c: "555",
        field2: "$ne(blue)",
      },
    };

    const expected = [
      {
        joinLogic: "or",
        conditions: [
          {
            joinLogic: "and",
            conditions: [
              {
                field: "a",
                operator: "eq",
                value: "123",
              },
              {
                field: "field2",
                operator: "ne",
                value: null,
              },
            ],
          },
          {
            joinLogic: "and",
            conditions: [
              {
                field: "b",
                operator: "eq",
                value: "444",
              },
              {
                field: "field2",
                operator: "ne",
                value: "red",
              },
            ],
          },
          {
            joinLogic: "and",
            conditions: [
              {
                field: "c",
                operator: "eq",
                value: "555",
              },
              {
                field: "field2",
                operator: "ne",
                value: "blue",
              },
            ],
          },
        ],
      },
    ];

    assert.deepStrictEqual(buildAbstractFilterTree(filter), expected, "Nested OR conditions transformation failed");
  });

  test("nested AND with joinOr", () => {
    const filter = {
      a: "123",
      field2: "$ne(null)",
      [$and]: joinOr({
        a: "444",
        field2: "red",
      }),
    };

    const expected = [
      {
        joinLogic: "and",
        conditions: [
          {
            field: "a",
            operator: "eq",
            value: "123",
          },
          {
            field: "field2",
            operator: "ne",
            value: null,
          },
          {
            joinLogic: "or",
            conditions: [
              {
                field: "a",
                operator: "eq",
                value: "444",
              },
              {
                field: "field2",
                operator: "eq",
                value: "red",
              },
            ],
          },
        ],
      },
    ];

    assert.deepStrictEqual(
      buildAbstractFilterTree(filter),
      expected,
      "Nested AND with joinOr transformation failed",
    );
  });

  test("complex nested conditions with joinOr and OR", () => {
    const filter = {
      a: "123",
      field2: "$ne(null)",
      [$and]: joinOr({
        a: "444",
        field2: "red",
      }),
      [$or]: {
        c: "555",
        field2: "$ne(blue)",
      },
    };

    const expected = [
      {
        joinLogic: "or",
        conditions: [
          {
            joinLogic: "and",
            conditions: [
              {
                field: "a",
                operator: "eq",
                value: "123",
              },
              {
                field: "field2",
                operator: "ne",
                value: null,
              },
              {
                joinLogic: "or",
                conditions: [
                  {
                    field: "a",
                    operator: "eq",
                    value: "444",
                  },
                  {
                    field: "field2",
                    operator: "eq",
                    value: "red",
                  },
                ],
              },
            ],
          },
          {
            joinLogic: "and",
            conditions: [
              {
                field: "c",
                operator: "eq",
                value: "555",
              },
              {
                field: "field2",
                operator: "ne",
                value: "blue",
              },
            ],
          },
        ],
      },
    ];

    assert.deepStrictEqual(
      buildAbstractFilterTree(filter),
      expected,
      "Complex nested conditions transformation failed",
    );
  });

  test("filter with only symbols on the first layer", () => {
    const filter = {
      [$or]: {
        a: "123",
        b: "456",
      },
      [$or]: {
        foo: "123",
      },
    };

    const expected = [
      {
        joinLogic: "or",
        conditions: [
          {
            joinLogic: "and",
            conditions: [
              {
                field: "a",
                operator: "eq",
                value: "123",
              },
              {
                field: "b",
                operator: "eq",
                value: "456",
              },
            ],
          },
          {
            joinLogic: "and",
            conditions: [
              {
                field: "foo",
                operator: "eq",
                value: "123",
              },
            ],
          },
        ],
      },
    ];

    assert.deepStrictEqual(
      buildAbstractFilterTree(filter),
      expected,
      // 'Filter with only symbols on the first layer failed'
    );
  });

  test("empty or undefined filter", () => {
    assert.deepStrictEqual(buildAbstractFilterTree(undefined), [], "Undefined filter should return empty array");

    assert.deepStrictEqual(buildAbstractFilterTree({}), []);
  });

  test("unrecognised operator envelopes fall back to literal equality", () => {
    const filter = {
      valid: "$eq(123)", // valid operator
      invalid: "$invalid(123)", // unknown operator, matched literally
      empty: "$eq()", // empty value, dropped
      emptyIn: "$in()", // empty list is retained, see "empty $in / $not_in" test
      field: "normal", // normal field without operator
    };

    const expected = [
      {
        joinLogic: "and",
        conditions: [
          {
            field: "valid",
            operator: "eq",
            value: 123,
          },
          {
            field: "invalid",
            operator: "eq",
            value: "$invalid(123)",
          },
          {
            field: "emptyIn",
            operator: "in",
            value: [],
          },
          {
            field: "field",
            operator: "eq",
            value: "normal",
          },
        ],
      },
    ];

    assert.deepStrictEqual(
      buildAbstractFilterTree(filter),
      expected,
      "Only an empty payload on a non-list operator should be skipped",
    );
  });

  test("empty $in / $not_in are retained as empty lists, blank parts dropped", () => {
    const filter = {
      inEmpty: "$in()",
      inBlank: "$in( )",
      inCommaOnly: "$in(,)",
      inTrailing: "$in(1,)",
      inLeading: "$in(,1)",
      inMiddle: "$in(1,,2)",
      inQuotedEmpty: '$in("")',
      inQuotedBlank: '$in(" ")',
      notInEmpty: "$not_in()",
      notInTrailing: "$not_in(a,b,)",
    };

    const expected = [
      {
        joinLogic: "and",
        conditions: [
          { field: "inEmpty", operator: "in", value: [] },
          { field: "inBlank", operator: "in", value: [] },
          { field: "inCommaOnly", operator: "in", value: [] },
          { field: "inTrailing", operator: "in", value: [1] },
          { field: "inLeading", operator: "in", value: [1] },
          { field: "inMiddle", operator: "in", value: [1, 2] },
          { field: "inQuotedEmpty", operator: "in", value: [""] },
          { field: "inQuotedBlank", operator: "in", value: [" "] },
          { field: "notInEmpty", operator: "not_in", value: [] },
          { field: "notInTrailing", operator: "not_in", value: ["a", "b"] },
        ],
      },
    ];

    assert.deepStrictEqual(
      buildAbstractFilterTree(filter),
      expected,
      "Empty list handling failed",
    );
  });

  test("numeric-looking values coerce with the unified number rule", () => {
    const filter = {
      idsIn: "$in(007,0,123)",
      idNe: "$ne(007)",
      idEq: "$eq(123)",
    };

    const expected = [
      {
        joinLogic: "and",
        conditions: [
          {
            field: "idsIn",
            operator: "in",
            value: [7, 0, 123],
          },
          {
            field: "idNe",
            operator: "ne",
            value: 7,
          },
          {
            field: "idEq",
            operator: "eq",
            value: 123,
          },
        ],
      },
    ];

    assert.deepStrictEqual(
      buildAbstractFilterTree(filter),
      expected,
      "Leading-zero numbers must coerce to numbers unless quoted",
    );
  });

  test("quoted values escape coercion, escaped quotes stay literal", () => {
    const filter = {
      quotedNum: '$eq("123")',
      quotedBool: '$eq("true")',
      inMix: '$in("007",7,"true")',
      escaped: '$eq(\\"123\\")',
      notInStr: '$not_in("1","2")',
      halfOpen: '$eq("123)',
      betweenStr: '$between("a","b")',
    };

    const expected = [
      {
        joinLogic: "and",
        conditions: [
          { field: "quotedNum", operator: "eq", value: "123" },
          { field: "quotedBool", operator: "eq", value: "true" },
          { field: "inMix", operator: "in", value: ["007", 7, "true"] },
          { field: "escaped", operator: "eq", value: '"123"' },
          { field: "notInStr", operator: "not_in", value: ["1", "2"] },
          { field: "halfOpen", operator: "eq", value: '"123' },
          { field: "betweenStr", operator: "between", value: ["a", "b"] },
        ],
      },
    ];

    assert.deepStrictEqual(
      buildAbstractFilterTree(filter),
      expected,
      "Quote escaping failed",
    );
  });

  test("comparison operators: strict numbers, strings untouched", () => {
    const filter = {
      int: "$gt(5)",
      neg: "$gte(-3)",
      float: "$lt(1.5)",
      exp: "$lte(1e3)",
      hex: "$gt(0x10)",
      padded: "$gt( 7 )",
      leadingZero: "$gt(007)",
      isoDate: "$gt(2024-01-01)",
      isoDateTime: "$gte(2024-01-01T10:20:30Z)",
      isoSpace: "$lt(2024-01-01 10:00)",
      toStringDate: `$lte(${new Date("2020-01-04T00:00:00Z")})`,
      epoch: "$gte(1970-01-01T00:00:00Z)",
      numPrefix: "$gt(1.5abc)",
      intPrefix: "$gt(12abc)",
      word: "$gt(Tom)",
      textDate: "$gt(May 5)",
      badDate: "$gt(2024-13-01)",
      quoted: '$gt("2024-01-01")',
    };

    const expected = [
      {
        joinLogic: "and",
        conditions: [
          { field: "int", operator: "gt", value: 5 },
          { field: "neg", operator: "gte", value: -3 },
          { field: "float", operator: "lt", value: 1.5 },
          { field: "exp", operator: "lte", value: 1000 },
          { field: "hex", operator: "gt", value: "0x10" },
          { field: "padded", operator: "gt", value: 7 },
          { field: "leadingZero", operator: "gt", value: 7 },
          { field: "isoDate", operator: "gt", value: "2024-01-01" },
          { field: "isoDateTime", operator: "gte", value: "2024-01-01T10:20:30Z" },
          { field: "isoSpace", operator: "lt", value: "2024-01-01 10:00" },
          { field: "toStringDate", operator: "lte", value: String(new Date("2020-01-04T00:00:00Z")) },
          { field: "epoch", operator: "gte", value: "1970-01-01T00:00:00Z" },
          { field: "numPrefix", operator: "gt", value: "1.5abc" },
          { field: "intPrefix", operator: "gt", value: "12abc" },
          { field: "word", operator: "gt", value: "Tom" },
          { field: "textDate", operator: "gt", value: "May 5" },
          { field: "badDate", operator: "gt", value: "2024-13-01" },
          { field: "quoted", operator: "gt", value: "2024-01-01" },
        ],
      },
    ];

    assert.deepStrictEqual(buildAbstractFilterTree(filter), expected);
  });

  test("$between: date-like strings, strings, validation errors", () => {
    assert.deepStrictEqual(buildAbstractFilterTree({ d: "$between(2024-01-01,2024-12-31)" }), [
      {
        joinLogic: "and",
        conditions: [
          {
            field: "d",
            operator: "between",
            value: ["2024-01-01", "2024-12-31"],
          },
        ],
      },
    ]);

    assert.deepStrictEqual(buildAbstractFilterTree({ s: "$between(abc,xyz)" }), [
      { joinLogic: "and", conditions: [{ field: "s", operator: "between", value: ["abc", "xyz"] }] },
    ]);

    assert.throws(() => buildAbstractFilterTree({ x: "$between(1,abc)" }), /same type/);
    assert.throws(() => buildAbstractFilterTree({ x: "$between(5,1)" }), /less than or equal/);
    assert.throws(() => buildAbstractFilterTree({ x: "$between(1,2,3)" }), /exactly 2 values/);
    assert.throws(() => buildAbstractFilterTree({ x: "$between(,)" }), /exactly 2 values/);
    assert.throws(() => buildAbstractFilterTree({ x: "$between( , )" }), /exactly 2 values/);
    assert.throws(() => buildAbstractFilterTree({ x: "$between(,5)" }), /exactly 2 values/);
    assert.throws(() => buildAbstractFilterTree({ x: "$between(5, )" }), /exactly 2 values/);
    assert.deepStrictEqual(buildAbstractFilterTree({ s: '$between("","")' }), [
      { joinLogic: "and", conditions: [{ field: "s", operator: "between", value: ["", ""] }] },
    ]);
    assert.throws(() => buildAbstractFilterTree({ x: "$between(1,9007199254740993)" }), /same type/);

    assert.throws(() => buildAbstractFilterTree({ x: "$between(true,false)" }), /unsupported/);
    assert.throws(() => buildAbstractFilterTree({ x: "$between(null,null)" }), /unsupported/);
    assert.throws(() => buildAbstractFilterTree({ x: "$between(1,null)" }), /unsupported/);
    assert.throws(() => buildAbstractFilterTree({ x: "$between(undefined,1)" }), /same type/);
    assert.deepStrictEqual(buildAbstractFilterTree({ s: "$between(undefined,zzz)" }), [
      { joinLogic: "and", conditions: [{ field: "s", operator: "between", value: ["undefined", "zzz"] }] },
    ]);
  });

  test("$between validation throws FilterError carrying field and raw value", () => {
    const cases = [
      ["$between(1,2,3)", /exactly 2 values/],
      ["$between(,5)", /exactly 2 values/],
      ["$between(true,1)", /unsupported/],
      ["$between(1.5,10n)", /non-integer/],
      ["$between(1,abc)", /same type/],
      ["$between(5,1)", /less than or equal/],
    ] as const;
    for (const [value, message] of cases) {
      assert.throws(
        () => buildAbstractFilterTree({ ok: 1, [$and]: { age: value } }),
        (error: unknown) =>
          error instanceof FilterError &&
          error instanceof Error &&
          error.name === "FilterError" &&
          error.field === "age" &&
          error.value === value &&
          message.test(error.message),
      );
    }
  });

  test("$between promotes to bigint when either side is bigint", () => {
    assert.deepStrictEqual(
      buildAbstractFilterTree({
        a: "$between(1,9007199254740993n)",
        b: "$between(-5,0n)",
        c: "$between(9007199254740993n,10000000000000000n)",
      }),
      [
        {
          joinLogic: "and",
          conditions: [
            { field: "a", operator: "between", value: [1n, 9007199254740993n] },
            { field: "b", operator: "between", value: [-5n, 0n] },
            { field: "c", operator: "between", value: [9007199254740993n, 10000000000000000n] },
          ],
        },
      ],
    );

    assert.throws(() => buildAbstractFilterTree({ x: "$between(9007199254740993n,9007199254740992n)" }), /less than or equal/);
    assert.throws(() => buildAbstractFilterTree({ x: "$between(10n,1)" }), /less than or equal/);
    assert.throws(() => buildAbstractFilterTree({ x: "$between(1.5,10n)" }), /non-integer/);
    assert.throws(() => buildAbstractFilterTree({ x: "$between(abc,10n)" }), /same type/);
    assert.throws(() => buildAbstractFilterTree({ x: '$between("1",10n)' }), /same type/);
    assert.throws(() => buildAbstractFilterTree({ x: "$between(true,1n)" }), /unsupported/);
  });

  test("string operators pass values through the primitive parser", () => {
    const filter = {
      like: "$like(%john%)",
      likeUnderscore: "$like(a_b)",
      contains: "$contains(x)",
      containsCommas: "$contains(1,2)", // not a list operator: comma is literal
      has: "$has(tag)",
      hasNum: "$has(5)",
      not: "$not(5)",
      ne: "$ne(5)",
    };

    assert.deepStrictEqual(buildAbstractFilterTree(filter), [
      {
        joinLogic: "and",
        conditions: [
          { field: "like", operator: "like", value: "%john%" },
          { field: "likeUnderscore", operator: "like", value: "a_b" },
          { field: "contains", operator: "contains", value: "x" },
          { field: "containsCommas", operator: "contains", value: "1,2" },
          { field: "has", operator: "has", value: "tag" },
          { field: "hasNum", operator: "has", value: 5 },
          { field: "not", operator: "not", value: 5 },
          { field: "ne", operator: "ne", value: 5 },
        ],
      },
    ]);
  });

  test("string operators coerce values with the unified rule", () => {
    assert.deepStrictEqual(
      buildAbstractFilterTree({
        like: "$like(007)",
        contains: "$contains(1e3)",
        has: "$has(0x10)",
        not: "$not(007)",
        likePattern: "$like(007%)",
        likeQuoted: '$like("007")',
      }),
      [
        {
          joinLogic: "and",
          conditions: [
            { field: "like", operator: "like", value: 7 },
            { field: "contains", operator: "contains", value: 1000 },
            { field: "has", operator: "has", value: "0x10" },
            { field: "not", operator: "not", value: 7 },
            { field: "likePattern", operator: "like", value: "007%" },
            { field: "likeQuoted", operator: "like", value: "007" },
          ],
        },
      ],
    );
  });

  test("list operators coerce literals and numbers per element", () => {
    assert.deepStrictEqual(
      buildAbstractFilterTree({
        in: '$in(true,null,007,false,undefined,"null")',
        notIn: "$not_in(false,0x10,9007199254740993)",
      }),
      [
        {
          joinLogic: "and",
          conditions: [
            { field: "in", operator: "in", value: [true, null, 7, false, "undefined", "null"] },
            { field: "notIn", operator: "not_in", value: [false, "0x10", "9007199254740993"] },
          ],
        },
      ],
    );
  });

  test("unified coercion is identical across operator groups", () => {
    assert.deepStrictEqual(
      buildAbstractFilterTree({
        gtHex: "$gt(0x10)",
        eqNegInf: "$eq(-Infinity)",
        gtNegInf: "$gt(-Infinity)",
        eqPlus: "$eq(+1)",
        gtNumPrefix: "$gt(1.5abc)",
        eqUnsafe: "$eq(9007199254740993)",
        inUnsafe: "$in(9007199254740993,1)",
        gteUnsafe: "$gte(9007199254740993)",
        eqMaxSafe: "$eq(9007199254740991)",
        eqHuge: "$eq(1e30)",
        gteBool: "$gte(true)",
        ltNull: "$lt(null)",
        gtQuotedNum: '$gt("5")',
        gtQuotedBool: '$gt("true")',
        eqQuotedZero: '$eq("007")',
        gtDate: "$gt(2024-01-01)",
        gteDateTime: "$gte(2024-01-01T10:20:30Z)",
      }),
      [
        {
          joinLogic: "and",
          conditions: [
            { field: "gtHex", operator: "gt", value: "0x10" },
            { field: "eqNegInf", operator: "eq", value: "-Infinity" },
            { field: "gtNegInf", operator: "gt", value: "-Infinity" },
            { field: "eqPlus", operator: "eq", value: "+1" },
            { field: "gtNumPrefix", operator: "gt", value: "1.5abc" },
            { field: "eqUnsafe", operator: "eq", value: "9007199254740993" },
            { field: "inUnsafe", operator: "in", value: ["9007199254740993", 1] },
            { field: "gteUnsafe", operator: "gte", value: "9007199254740993" },
            { field: "eqMaxSafe", operator: "eq", value: 9007199254740991 },
            { field: "eqHuge", operator: "eq", value: "1e30" },
            { field: "gteBool", operator: "gte", value: true },
            { field: "ltNull", operator: "lt", value: null },
            { field: "gtQuotedNum", operator: "gt", value: "5" },
            { field: "gtQuotedBool", operator: "gt", value: "true" },
            { field: "eqQuotedZero", operator: "eq", value: "007" },
            { field: "gtDate", operator: "gt", value: "2024-01-01" },
            { field: "gteDateTime", operator: "gte", value: "2024-01-01T10:20:30Z" },
          ],
        },
      ],
    );
  });

  test("radix-prefixed literals stay strings", () => {
    assert.deepStrictEqual(
      buildAbstractFilterTree({
        address: "$eq(0x742d35Cc6634C0532925a3b844Bc454e4438f44e)",
        hexSafe: "$eq(0xdeadbeef)",
        hexUpper: "$eq(0X10)",
        hexEmpty: "$eq(0x)",
        binary: "$eq(0b101)",
        binaryUpper: "$eq(0B101)",
        octal: "$eq(0o17)",
        octalUpper: "$eq(0O17)",
        negativeHex: "$eq(-0x10)",
        hexBigInt: "$eq(0x10n)",
        quotedHex: '$eq("0x10")',
        likeHex: "$like(0x10%)",
        inHex: "$in(0x1,0b1,0o1,1)",
        betweenHex: "$between(0x01,0xff)",
        zero: "$eq(0)",
        zeroFloat: "$eq(0.5)",
        zeroExp: "$eq(0e3)",
      }),
      [
        {
          joinLogic: "and",
          conditions: [
            { field: "address", operator: "eq", value: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e" },
            { field: "hexSafe", operator: "eq", value: "0xdeadbeef" },
            { field: "hexUpper", operator: "eq", value: "0X10" },
            { field: "hexEmpty", operator: "eq", value: "0x" },
            { field: "binary", operator: "eq", value: "0b101" },
            { field: "binaryUpper", operator: "eq", value: "0B101" },
            { field: "octal", operator: "eq", value: "0o17" },
            { field: "octalUpper", operator: "eq", value: "0O17" },
            { field: "negativeHex", operator: "eq", value: "-0x10" },
            { field: "hexBigInt", operator: "eq", value: "0x10n" },
            { field: "quotedHex", operator: "eq", value: "0x10" },
            { field: "likeHex", operator: "like", value: "0x10%" },
            { field: "inHex", operator: "in", value: ["0x1", "0b1", "0o1", 1] },
            { field: "betweenHex", operator: "between", value: ["0x01", "0xff"] },
            { field: "zero", operator: "eq", value: 0 },
            { field: "zeroFloat", operator: "eq", value: 0.5 },
            { field: "zeroExp", operator: "eq", value: 0 },
          ],
        },
      ],
    );
  });

  test("$between on hex strings compares text, not magnitude", () => {
    assert.throws(
      () => buildAbstractFilterTree({ range: "$between(0xf,0x10)" }),
      /less than or equal/,
    );
  });

  test("bigint literals with n suffix", () => {
    assert.deepStrictEqual(
      buildAbstractFilterTree({
        big: "$eq(123n)",
        small: "$eq(5n)",
        leadingZero: "$eq(007n)",
        negative: "$eq(-9007199254740993n)",
        gte: "$gte(9007199254740993n)",
        quoted: '$eq("123n")',
        fraction: "$eq(1.5n)",
        exponent: "$eq(1e3n)",
        letters: "$eq(12an)",
        signOnly: "$eq(-n)",
        list: '$in(1,2n,"3n")',
      }),
      [
        {
          joinLogic: "and",
          conditions: [
            { field: "big", operator: "eq", value: 123n },
            { field: "small", operator: "eq", value: 5n },
            { field: "leadingZero", operator: "eq", value: 7n },
            { field: "negative", operator: "eq", value: -9007199254740993n },
            { field: "gte", operator: "gte", value: 9007199254740993n },
            { field: "quoted", operator: "eq", value: "123n" },
            { field: "fraction", operator: "eq", value: "1.5n" },
            { field: "exponent", operator: "eq", value: "1e3n" },
            { field: "letters", operator: "eq", value: "12an" },
            { field: "signOnly", operator: "eq", value: "-n" },
            { field: "list", operator: "in", value: [1, 2n, "3n"] },
          ],
        },
      ],
    );
  });

  test("public API exposes named exports only", () => {
    assert.deepStrictEqual(Object.keys(api).sort(), [
      "$and",
      "$or",
      "FilterError",
      "QueryHelpers",
      "buildAbstractFilterTree",
      "isFilterGroup",
      "joinOr",
    ]);
    assert.equal("default" in api, false);
    assert.equal(api.$and, QueryHelpers.$and);
    assert.equal(api.$or, QueryHelpers.$or);
    assert.equal(api.joinOr, QueryHelpers.joinOr);
  });

  test("primitive coercion accepts finite, precise numbers", () => {
    const filter = {
      negZero: "$eq(-0)", // strict Number(), -0 is a safe integer
      infinity: "$eq(Infinity)",
      negInfinity: "$eq(-Infinity)", // numeric lead char, rejected by isFinite
      nan: "$eq(NaN)",
      exponent: "$eq(1e3)", // strict Number() accepts exponent notation
      trailingZero: "$eq(1.50)", // strict Number() drops the trailing zero
      float: "$eq(1.5)",
      zero: "$eq(0)",
      plusSigned: "$eq(+1)", // '+' is not a numeric lead char
      quotedSpace: '$eq(" ")',
      bool: "$eq(true)",
      nullish: "$eq(null)",
      undef: "$eq(undefined)", // not a literal, stays a string
      quotedUndef: '$eq("undefined")',
      neUndef: "$ne(undefined)",
    };

    assert.deepStrictEqual(buildAbstractFilterTree(filter), [
      {
        joinLogic: "and",
        conditions: [
          { field: "negZero", operator: "eq", value: -0 },
          { field: "infinity", operator: "eq", value: "Infinity" },
          { field: "negInfinity", operator: "eq", value: "-Infinity" },
          { field: "nan", operator: "eq", value: "NaN" },
          { field: "exponent", operator: "eq", value: 1000 },
          { field: "trailingZero", operator: "eq", value: 1.5 },
          { field: "float", operator: "eq", value: 1.5 },
          { field: "zero", operator: "eq", value: 0 },
          { field: "plusSigned", operator: "eq", value: "+1" },
          { field: "quotedSpace", operator: "eq", value: " " },
          { field: "bool", operator: "eq", value: true },
          { field: "nullish", operator: "eq", value: null },
          { field: "undef", operator: "eq", value: "undefined" },
          { field: "quotedUndef", operator: "eq", value: "undefined" },
          { field: "neUndef", operator: "ne", value: "undefined" },
        ],
      },
    ]);

    // Empty payload is dropped for every non-list operator; a group left empty is dropped too
    assert.deepStrictEqual(buildAbstractFilterTree({ a: "$eq()", b: "$like()", c: "$between()" }), []);
  });

  test("bare values are passed through untouched", () => {
    const date = new Date("2020-01-04T00:00:00Z");
    const arr = [1, 2];
    // const obj = { x: 1 };
    const filter = {
      num: 123,
      bool: true,
      nul: null,
      undef: undefined, // dropped entirely
      date,
      arr,
      // obj,
      emptyStr: "",
      str: "plain",
      dotted: "value.with.dots",
    };

    const actual = buildAbstractFilterTree(filter);
    assert.deepStrictEqual(actual, [
      {
        joinLogic: "and",
        conditions: [
          { field: "num", operator: "eq", value: 123 },
          { field: "bool", operator: "eq", value: true },
          { field: "nul", operator: "eq", value: null },
          { field: "date", operator: "eq", value: date },
          { field: "arr", operator: "eq", value: arr },
          // { field: "obj", operator: "eq", value: obj },
          { field: "emptyStr", operator: "eq", value: "" },
          { field: "str", operator: "eq", value: "plain" },
          { field: "dotted", operator: "eq", value: "value.with.dots" },
        ],
      },
    ]);

    // Reference identity is preserved, values are not cloned or coerced
    const conds = actual[0].conditions as any[];
    assert.equal(conds[3].value, date);
    assert.equal(conds[4].value, arr);
    // assert.equal(conds[5].value, obj);
  });

  test("list operators keep commas inside plain-quoted items", () => {
    const filter = {
      spaced: "$in( 1 , 2 )",
      quotedComma: '$in("a,b",c)',
      escapedInside: '$in("a\\"b,c",d)',
      spacedQuoted: '$in( "x, y" , 1)',
      tabbedQuoted: '$in(\t"x,y"\t,1)',
      escapedEdges: '$in(\\"a,b\\",c)',
      unterminated: '$in("a,b)',
      textAfterQuote: '$in("a"b,c)',
      mixedQuotes: '$in("007",7,"true")',
      notIn: '$not_in("a,b","c,d")',
      between: '$between("a,b","c,d")',
    };

    assert.deepStrictEqual(buildAbstractFilterTree(filter), [
      {
        joinLogic: "and",
        conditions: [
          { field: "spaced", operator: "in", value: [1, 2] },
          { field: "quotedComma", operator: "in", value: ["a,b", "c"] },
          { field: "escapedInside", operator: "in", value: ['a\\"b,c', "d"] },
          { field: "spacedQuoted", operator: "in", value: ["x, y", 1] },
          { field: "tabbedQuoted", operator: "in", value: ["x,y", 1] },
          { field: "escapedEdges", operator: "in", value: ['\\"a', 'b\\"', "c"] },
          { field: "unterminated", operator: "in", value: ['"a', "b"] },
          { field: "textAfterQuote", operator: "in", value: ['"a"b', "c"] },
          { field: "mixedQuotes", operator: "in", value: ["007", 7, "true"] },
          { field: "notIn", operator: "not_in", value: ["a,b", "c,d"] },
          { field: "between", operator: "between", value: ["a,b", "c,d"] },
        ],
      },
    ]);
    assert.throws(() => buildAbstractFilterTree({ a: '$between("1,2")' }), /exactly 2 values/);
    assert.throws(() => buildAbstractFilterTree({ a: '$between(1,"2,3",4)' }), /exactly 2 values/);
  });

  test("malformed operator syntax is matched literally, never dropped", () => {
    const filter = {
      nestedParens: "$like((x))", // balanced inner parens survive
      unbalanced: "$like(a))", // payload keeps the extra paren
      noOpenParen: "$eq",
      closeOnly: "$eq)",
      unknownOp: "$foo(1)",
      upperCaseOp: "$EQ(1)", // operators are case sensitive
      spacedOp: "$eq (1)",
      trailingJunk: "$eq(1)x", // does not end with ')'
      unterminated: "$in(1,2",
    };

    assert.deepStrictEqual(buildAbstractFilterTree(filter), [
      {
        joinLogic: "and",
        conditions: [
          { field: "nestedParens", operator: "like", value: "(x)" },
          { field: "unbalanced", operator: "like", value: "a)" },
          { field: "noOpenParen", operator: "eq", value: "$eq" },
          { field: "closeOnly", operator: "eq", value: "$eq)" },
          { field: "unknownOp", operator: "eq", value: "$foo(1)" },
          { field: "upperCaseOp", operator: "eq", value: "$EQ(1)" },
          { field: "spacedOp", operator: "eq", value: "$eq (1)" },
          { field: "trailingJunk", operator: "eq", value: "$eq(1)x" },
          { field: "unterminated", operator: "eq", value: "$in(1,2" },
        ],
      },
    ]);
  });

  test("group symbols: unknown descriptions join with AND", () => {
    // Only a symbol described as 'or' switches the join logic; anything else nests as AND.
    assert.deepStrictEqual(buildAbstractFilterTree({ a: 1, [Symbol("foo")]: { b: 2 } }), [
      {
        joinLogic: "and",
        conditions: [
          { field: "a", operator: "eq", value: 1 },
          { joinLogic: "and", conditions: [{ field: "b", operator: "eq", value: 2 }] },
        ],
      },
    ]);

    // A description-less symbol behaves the same way
    assert.deepStrictEqual(buildAbstractFilterTree({ [Symbol()]: { b: 2 } }), [
      {
        joinLogic: "and",
        conditions: [{ joinLogic: "and", conditions: [{ field: "b", operator: "eq", value: 2 }] }],
      },
    ]);

    // $and returns a fresh symbol per access, so repeated keys do not overwrite each other
    assert.deepStrictEqual(buildAbstractFilterTree({ [$and]: { a: 1 }, [$and]: { b: 2 } }), [
      {
        joinLogic: "and",
        conditions: [
          { joinLogic: "and", conditions: [{ field: "a", operator: "eq", value: 1 }] },
          { joinLogic: "and", conditions: [{ field: "b", operator: "eq", value: 2 }] },
        ],
      },
    ]);
  });

  test("group symbols: non-object and empty payloads", () => {
    // An 'or' symbol still switches the top level to OR even when it contributes nothing.
    const orWithNothing = [
      {
        joinLogic: "or",
        conditions: [{ joinLogic: "and", conditions: [{ field: "a", operator: "eq", value: 1 }] }],
      },
    ];

    assert.deepStrictEqual(buildAbstractFilterTree({ a: 1, [$or]: {} }), orWithNothing);
    assert.deepStrictEqual(buildAbstractFilterTree({ a: 1, [$or]: null } as any), orWithNothing);
    //@ts-expect-error
    assert.deepStrictEqual(buildAbstractFilterTree({ a: 1, [$or]: "x" }), orWithNothing);
    //@ts-expect-error
    assert.deepStrictEqual(buildAbstractFilterTree({ a: 1, [$or]: [{ b: 1 }] }), orWithNothing);

    // A group left without conditions is dropped, at any depth
    assert.deepStrictEqual(buildAbstractFilterTree({ [$or]: {} }), []);
    assert.deepStrictEqual(buildAbstractFilterTree({ [$and]: {}, [$or]: { a: undefined } } as any), []);

    // An empty AND group contributes nothing
    assert.deepStrictEqual(buildAbstractFilterTree({ a: 1, [$and]: {} }), [
      { joinLogic: "and", conditions: [{ field: "a", operator: "eq", value: 1 }] },
    ]);
  });

  test("joinOr at the top level and combined with groups", () => {
    // joinOr flips the join logic of the object it wraps, without creating a nested group
    assert.deepStrictEqual(buildAbstractFilterTree(joinOr({ a: 1, b: 2 })), [
      {
        joinLogic: "or",
        conditions: [
          { field: "a", operator: "eq", value: 1 },
          { field: "b", operator: "eq", value: 2 },
        ],
      },
    ]);

    assert.deepStrictEqual(buildAbstractFilterTree(joinOr({})), []);

    // A nested $and group is appended to the OR-joined conditions
    assert.deepStrictEqual(buildAbstractFilterTree(joinOr({ a: 1, [$and]: { b: 2 } })), [
      {
        joinLogic: "or",
        conditions: [
          { field: "a", operator: "eq", value: 1 },
          { joinLogic: "and", conditions: [{ field: "b", operator: "eq", value: 2 }] },
        ],
      },
    ]);

    // A top-level $or takes precedence: the joinOr marker is ignored once conditions are grouped
    assert.deepStrictEqual(buildAbstractFilterTree(joinOr({ a: 1, [$or]: { b: 2 } })), [
      {
        joinLogic: "or",
        conditions: [
          { joinLogic: "and", conditions: [{ field: "a", operator: "eq", value: 1 }] },
          { joinLogic: "and", conditions: [{ field: "b", operator: "eq", value: 2 }] },
        ],
      },
    ]);

    // joinOr inside an $or group keeps its own OR logic
    assert.deepStrictEqual(buildAbstractFilterTree({ a: 1, [$or]: joinOr({ b: 1, c: 2 }) }), [
      {
        joinLogic: "or",
        conditions: [
          { joinLogic: "and", conditions: [{ field: "a", operator: "eq", value: 1 }] },
          {
            joinLogic: "or",
            conditions: [
              { field: "b", operator: "eq", value: 1 },
              { field: "c", operator: "eq", value: 2 },
            ],
          },
        ],
      },
    ]);
  });

  test("arrays are not valid filter objects", () => {
    assert.throws(() => buildAbstractFilterTree([{ a: 1 }] as any), { name: "TypeError", message: "Filter must be a non-array object" });
    assert.throws(() => buildAbstractFilterTree([] as any), { name: "TypeError", message: "Filter must be a non-array object" });
  });

  test("inherited properties are ignored", () => {
    assert.deepStrictEqual(buildAbstractFilterTree(Object.create({ inherited: 1 })), []);
  });

  test("a value starting with $ is never dropped", () => {
    // A price, a currency code or any user text beginning with '$' must still be
    // matched: dropping a condition widens the filter instead of narrowing it.
    assert.deepStrictEqual(buildAbstractFilterTree({ price: "$100", sym: "$", dollars: "$$" }), [
      {
        joinLogic: "and",
        conditions: [
          { field: "price", operator: "eq", value: "$100" },
          { field: "sym", operator: "eq", value: "$" },
          { field: "dollars", operator: "eq", value: "$$" },
        ],
      },
    ]);
  });

  test("neither infinity coerces to a number", () => {
    // No SQL dialect has an infinite numeric literal. '-Infinity' starts with a numeric
    // lead char and Number() accepts it, so it needs the explicit isFinite guard.
    assert.deepStrictEqual(buildAbstractFilterTree({ a: "$eq(-Infinity)", b: "$eq(Infinity)" }), [
      {
        joinLogic: "and",
        conditions: [
          { field: "a", operator: "eq", value: "-Infinity" },
          { field: "b", operator: "eq", value: "Infinity" },
        ],
      },
    ]);
  });

  test("the join marker only accepts 'or'", () => {
    // joinLogic is typed as LogicalOperator, so an unknown marker falls back to 'and'.
    assert.deepStrictEqual(buildAbstractFilterTree({ a: 1, [Symbol.for("join")]: "xor" } as any), [
      { joinLogic: "and", conditions: [{ field: "a", operator: "eq", value: 1 }] },
    ]);

    assert.deepStrictEqual(buildAbstractFilterTree({ a: 1, [Symbol.for("join")]: "OR" } as any), [
      { joinLogic: "and", conditions: [{ field: "a", operator: "eq", value: 1 }] },
    ]);

    assert.deepStrictEqual(buildAbstractFilterTree(joinOr({ a: 1 })), [
      { joinLogic: "or", conditions: [{ field: "a", operator: "eq", value: 1 }] },
    ]);
  });

  test("deeply nested conditions", () => {
    const filter = {
      a: "1",
      [$and]: {
        b: "2",
        [$or]: {
          c: "3",
          [$and]: {
            d: "4",
          },
        },
      },
    };

    const expected = [
      {
        joinLogic: "and",
        conditions: [
          {
            field: "a",
            operator: "eq",
            value: "1",
          },
          {
            joinLogic: "or",
            conditions: [
              {
                joinLogic: "and",
                conditions: [
                  {
                    field: "b",
                    operator: "eq",
                    value: "2",
                  },
                ],
              },
              {
                joinLogic: "and",
                conditions: [
                  {
                    field: "c",
                    operator: "eq",
                    value: "3",
                  },
                  {
                    joinLogic: "and",
                    conditions: [
                      {
                        field: "d",
                        operator: "eq",
                        value: "4",
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ];

    const actual = buildAbstractFilterTree(filter);
    assert.deepStrictEqual(
      actual,
      expected,
    );
  });

  test("special characters in values", () => {
    const filter = {
      field: "$eq(value with, comma)",
      status: "$in(has,multiple,commas)",
      description: "$like(%special_chars$%)",
    };

    const expected = [
      {
        joinLogic: "and",
        conditions: [
          {
            field: "field",
            operator: "eq",
            value: "value with, comma",
          },
          {
            field: "status",
            operator: "in",
            value: ["has", "multiple", "commas"],
          },
          {
            field: "description",
            operator: "like",
            value: "%special_chars$%",
          },
        ],
      },
    ];

    assert.deepStrictEqual(
      buildAbstractFilterTree(filter),
      expected,
      "Special characters should be preserved correctly in values",
    );
  });

  test("integer fast path matches the general number rule", () => {
    const [root] = buildAbstractFilterTree({
      zero: "$eq(0)",
      negativeZero: "$eq(-0)",
      padded: "$eq(  42  )",
      tabbed: "$eq(\t42\t)",
      digits15: "$eq(999999999999999)",
      digits16: "$eq(9007199254740991)",
      unsafe16: "$eq(9007199254740993)",
      negative15: "$eq(-999999999999999)",
      minusOnly: "$eq(-)",
      list: "$in( 1 ,\t2\t, -3,007 , ,4.5)",
      between: "$between( -2 , 10 )",
    });

    assert.deepStrictEqual(root.conditions, [
      { field: "zero", operator: "eq", value: 0 },
      { field: "negativeZero", operator: "eq", value: -0 },
      { field: "padded", operator: "eq", value: 42 },
      { field: "tabbed", operator: "eq", value: 42 },
      { field: "digits15", operator: "eq", value: 999999999999999 },
      { field: "digits16", operator: "eq", value: 9007199254740991 },
      { field: "unsafe16", operator: "eq", value: "9007199254740993" },
      { field: "negative15", operator: "eq", value: -999999999999999 },
      { field: "minusOnly", operator: "eq", value: "-" },
      { field: "list", operator: "in", value: [1, 2, -3, 7, 4.5] },
      { field: "between", operator: "between", value: [-2, 10] },
    ]);
    assert.ok(Object.is((root.conditions[1] as { value: number }).value, -0));
  });

  test("a minus sign starts a number only when a digit follows", () => {
    const [root] = buildAbstractFilterTree({
      dot: "$eq(.5)",
      minusDot: "$eq(-.5)",
      minusDotExp: "$eq(-.5e1)",
      minusDotBigInt: "$eq(-.5n)",
      minusHalf: "$eq(-0.5)",
      minusInt: "$eq(-5)",
      minusBigInt: "$eq(-5n)",
      list: "$in(-.5,-0.5,.5)",
    });

    assert.deepStrictEqual(
      root.conditions.map((c) => (c as { value: unknown }).value),
      [".5", "-.5", "-.5e1", "-.5n", -0.5, -5, -5n, ["-.5", -0.5, ".5"]],
    );
    assert.throws(() => buildAbstractFilterTree({ a: "$between(-.5,1)" }), /same type/);
  });

  test("blank payload drops the condition, quoted blank is a value", () => {
    assert.deepStrictEqual(
      buildAbstractFilterTree({
        space: "$eq( )",
        spaces: "$like(   )",
        tab: "$ne(\t)",
        newline: "$gt(\n)",
        nbsp: "$eq(\u00a0)",
        between: "$between( )",
      }),
      [],
    );

    assert.deepStrictEqual(
      buildAbstractFilterTree({
        space: '$eq(" ")',
        padded: '$eq(  " "  )',
        spaces: '$like("   ")',
        empty: '$eq("")',
        list: '$in(" ","  ")',
      }),
      [
        {
          joinLogic: "and",
          conditions: [
            { field: "space", operator: "eq", value: " " },
            { field: "padded", operator: "eq", value: " " },
            { field: "spaces", operator: "like", value: "   " },
            { field: "empty", operator: "eq", value: "" },
            { field: "list", operator: "in", value: [" ", "  "] },
          ],
        },
      ],
    );
  });

  test("a group emptied by dropped conditions never widens the filter", () => {
    const onlyX = [{ joinLogic: "or", conditions: [{ joinLogic: "and", conditions: [{ field: "x", operator: "eq", value: 1 }] }] }];

    assert.deepStrictEqual(buildAbstractFilterTree({ x: 1, [$or]: { a: undefined } } as any), onlyX);
    assert.deepStrictEqual(buildAbstractFilterTree({ x: 1, [$or]: { a: "$eq()" } }), onlyX);
    assert.deepStrictEqual(buildAbstractFilterTree({ x: 1, [$or]: { [$and]: { a: undefined } } } as any), onlyX);
    assert.deepStrictEqual(buildAbstractFilterTree({ x: 1, [$and]: { a: undefined } } as any), [
      { joinLogic: "and", conditions: [{ field: "x", operator: "eq", value: 1 }] },
    ]);
    assert.deepStrictEqual(buildAbstractFilterTree({ a: undefined } as any), []);
  });

  test("operator names match exactly, including non-ASCII look-alike", () => {
    const [root] = buildAbstractFilterTree({
      wide: "$dű(1)",
      nul: "$\u0000eq(1)",
      prefix: "$eqx(1)",
      upper: "$EQ(1)",
      proto: "$constructor(1)",
    });

    assert.deepStrictEqual(
      root.conditions.map((c) => (c as { operator: string }).operator),
      ["eq", "eq", "eq", "eq", "eq"],
    );
    assert.deepStrictEqual(
      root.conditions.map((c) => (c as { value: unknown }).value),
      ["$dű(1)", "$\u0000eq(1)", "$eqx(1)", "$EQ(1)", "$constructor(1)"],
    );
  });

  test("every operator resolves", () => {
    const [root] = buildAbstractFilterTree({
      eq: "$eq(1)",
      ne: "$ne(1)",
      not: "$not(1)",
      gt: "$gt(1)",
      gte: "$gte(1)",
      lt: "$lt(1)",
      lte: "$lte(1)",
      in: "$in(1)",
      notIn: "$not_in(1)",
      contains: "$contains(1)",
      has: "$has(1)",
      like: "$like(1)",
      between: "$between(1,2)",
    });

    assert.deepStrictEqual(
      root.conditions.map((c) => (c as { operator: string }).operator),
      ["eq", "ne", "not", "gt", "gte", "lt", "lte", "in", "not_in", "contains", "has", "like", "between"],
    );
  });

  test("non-object root input throws", () => {
    const error = { name: "TypeError", message: "Filter must be a non-array object" };
    for (const input of ["abc", "", 1, 0, true, false, 1n, Symbol("x"), () => {}]) {
      assert.throws(() => buildAbstractFilterTree(input as any), error);
    }
  });

  test("null root input yields an empty tree", () => {
    assert.deepStrictEqual(buildAbstractFilterTree(null), []);
  });
});
