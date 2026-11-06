import type { RouteConfig } from '../../types/route.js'
import type { TypeSchema } from '../../types/validation.js'

/** Declares an OpenAPI route. An identity function that keeps the literal type. */
export function createRoute<const R extends RouteConfig>(route: R): R {
  return route
}

const TYPE_SCHEMA: TypeSchema = Object.freeze({ '~schema': true })

/** A TypeScript type in place of a schema: typed, never validated. */
export function schema<T>(): TypeSchema<T> {
  return TYPE_SCHEMA as TypeSchema<T>
}
