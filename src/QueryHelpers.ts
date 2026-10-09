const $$and = new (class AndJoin {
  toString() {
    return Symbol("and");
  }
})();
const $$or = new (class OrJoin {
  toString() {
    return Symbol("or");
  }
})();

export class QueryHelpers {
  /**
   * Use to join filter with AND condition
   * Example:
   * ```ts
   * const filter = {
   *   name: '$ne(Jonh)',
   *    [$and]: {
   *      name: '$ne(David)'
   *    }
   * }
   */
  static get $and() {
    return $$and as unknown as symbol;
  }

  /**
   * Use to join filter with OR condition
   * Example:
   * ```ts
   * const filter = {
   *    name: 'John',
   *    [$and]: {
   *      [$or]: {
   *        jobTitle: '$like(CTO)',
   *        age: '$gt(30)'
   *      },
   *      [$or]: {
   *       jobTitle: '$like(Junior)',
   *        age: '$between(19, 25)'
   *      }
   *    }
   *  }
   * ```
   * Logically means "get with `name` 'John' **AND** ((`jobTitle` contains CTO **AND** `age` gt 30) **OR** (`jobTitle` contains 'Junior' **AND** `age` between 19 and 25))"
   */
  static get $or() {
    return $$or as unknown as symbol;
  }

  /**
   * Joins all object entries by logical condition OR
   * Example:
   * ```ts
   * const filter = {
   *    name: 'John',
   *    [$and]: joinOr({
   *      createdAt: '$lte(2020-01-04)',
   *      twoFactorEnabled: true,
   *    })
   * }
   * ```
   * Logically means "get with name 'John' and (`createdAt` before 4th Jan 2020 **OR** `twoFactorEnabled` is true)"
   */
  static joinOr<T extends Record<string | symbol, any>>(filter: T): T {
    return { ...filter, [Symbol.for("join")]: "or" };
  }
}
