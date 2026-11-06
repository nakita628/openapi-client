/** An object, or a function (ArkType's types and Effect's schemas are callable). */
export function isObject(value: unknown): value is Record<string, unknown> {
  return (typeof value === 'object' || typeof value === 'function') && value !== null
}
