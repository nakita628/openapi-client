/** Route types, compatible with @hono/zod-openapi's route shape. */

import type { ConvertibleSchema, RouteSchema } from './validation.js'

/** HTTP methods of a route, including OpenAPI 3.2's `query`. */
export type Method = 'get' | 'post' | 'put' | 'delete' | 'patch' | 'head' | 'options' | 'trace' | 'query'

/** A content object whose schemas are `Slot`. */
export type RouteContentWith<Slot> = {
  readonly [mediaType: string]: { readonly schema?: Slot; readonly [key: string]: unknown }
}

export type RouteContent = RouteContentWith<RouteSchema>

/** An OpenAPI operation whose schemas are `Slot`. `path` is a template (`/users/{id}`). */
export type RouteConfigWith<Slot> = {
  readonly method: Method
  readonly path: string
  readonly request?: {
    readonly params?: Slot
    readonly query?: Slot
    readonly headers?: Slot
    readonly cookies?: Slot
    readonly body?: {
      readonly required?: boolean
      readonly content: RouteContentWith<Slot>
      readonly [key: string]: unknown
    }
  }
  readonly responses: {
    readonly [status: string | number]: {
      readonly description: string
      readonly content?: RouteContentWith<Slot>
      readonly [key: string]: unknown
    }
  }
  readonly [key: string]: unknown
}

/** An OpenAPI operation, as `createRoute()` takes it. */
export type RouteConfig = RouteConfigWith<RouteSchema>

/** A route for openapi-client/effect's `createRoute()`: slots also take Effect schemas. */
export type EffectRouteConfig = RouteConfigWith<RouteSchema | ConvertibleSchema>
