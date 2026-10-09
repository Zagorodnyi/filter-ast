export class FilterError extends Error {
  readonly field: string;
  readonly value: string;

  constructor(message: string, field: string, value: string) {
    super(message);
    this.name = "FilterError";
    this.field = field;
    this.value = value;
  }
}
