/**
 * JSON-compatible value types shared by plugin manifests, data storage, and view state.
 */

export type JsonPrimitive = string | number | boolean | null;

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export interface JsonArray extends ReadonlyArray<JsonValue> {}

export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

export type MutableJsonPrimitive = JsonPrimitive;

export interface MutableJsonObject {
  [key: string]: MutableJsonValue | undefined;
}

export interface MutableJsonArray extends Array<MutableJsonValue> {}

export type MutableJsonValue = MutableJsonPrimitive | MutableJsonObject | MutableJsonArray;
