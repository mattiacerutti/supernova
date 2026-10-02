import {z} from "zod";

/** An object schema whose values are read-only, as every contract value is. */
export function struct<const Shape extends z.ZodRawShape>(shape: Shape) {
  return z.object(shape).readonly();
}

/** An array schema whose values are read-only. */
export function array<const Item extends z.ZodType>(item: Item) {
  return z.array(item).readonly();
}

/** A string-keyed record schema whose values are read-only. */
export function record<const Value extends z.ZodType>(value: Value) {
  return z.record(z.string(), value).readonly();
}

/**
 * A value Pi owns, carried as-is. Pi defines its shape and every Pi value is strict JSON, so the schema checks only
 * that it is JSON; the type is Pi's.
 */
export function piJson<T>(): z.ZodType<T> {
  return z.json() as unknown as z.ZodType<T>;
}
