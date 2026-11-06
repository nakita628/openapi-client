/**
 * The client's types. Shaped for type-checking cost: one key-remapped mapped type per chain node
 * (no per-key union filtering), and nothing computed until it is read.
 */

import type { Aliases } from './alias.js'
import type { RequestOfRoute } from './request.js'
import type { ClientResponse, ProblemResponse, ResponseOfRoute } from './response.js'

/** Options of `oc()` and of a single call (merged over the client's): `RequestInit` fields plus `fetch` and friends. */
// An interface rather than `Omit<RequestInit, ...> & {...}`: every endpoint names it, and its members are resolved once.
export interface ClientRequestOptions {
  readonly cache?: RequestCache
  readonly credentials?: RequestCredentials
  readonly integrity?: string
  readonly keepalive?: boolean
  readonly mode?: RequestMode
  readonly priority?: RequestPriority
  readonly redirect?: RequestRedirect
  readonly referrer?: string
  readonly referrerPolicy?: ReferrerPolicy
  readonly signal?: AbortSignal | null
  readonly window?: null
  /** Headers sent over those the call writes; a function is called per request. */
  readonly headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>) | undefined
  /** The `fetch` to send with. */
  readonly fetch?: ((input: string, init: RequestInit) => Response | Promise<Response>) | undefined
  /** Builds the query string; the default repeats the key for arrays (`a=1&a=2`). */
  readonly buildSearchParams?: ((query: Readonly<Record<string, unknown>>) => URLSearchParams) | undefined
}

/** An endpoint of route `R` with required arguments. `Checked` adds the client's own 422 and 502 responses. */
// A plain function type: its parameters are only computed when it is called.
export type Endpoint<R, Checked extends boolean = false> = (
  args: RequestOfRoute<R>,
  options?: ClientRequestOptions,
) => Promise<ResponseOfCall<R, Checked>>

/** An endpoint of route `R` whose arguments may be omitted. */
export type OptionalEndpoint<R, Checked extends boolean = false> = (
  args?: RequestOfRoute<R>,
  options?: ClientRequestOptions,
) => Promise<ResponseOfCall<R, Checked>>

/** `$url()` of the routes `R` of one path. */
export type UrlEndpoint<R> = (args?: UrlArgs<R>) => URL

/** `$path()` of the routes `R` of one path. */
export type PathEndpoint<R> = (args?: UrlArgs<R>) => string

/** `Endpoint` or `OptionalEndpoint`, chosen by whether the route requires arguments. */
type Fetcher<R, Checked extends boolean> =
  {} extends RequestOfRoute<R>
    ? (args?: RequestOfRoute<R>, options?: ClientRequestOptions) => Promise<ResponseOfCall<R, Checked>>
    : (args: RequestOfRoute<R>, options?: ClientRequestOptions) => Promise<ResponseOfCall<R, Checked>>

type ResponseOfCall<R, Checked extends boolean> = Checked extends true
  ? ResponseOfRoute<R> | ProblemResponse
  : ResponseOfRoute<R>

/** What `$url()` and `$path()` take: `param` and `query`. */
export type UrlArgs<R> = RequestOfRoute<R> extends infer I ? Pick<I, Extract<keyof I, 'param' | 'query'>> : never

/** The path template segment a chain key stands for. */
type SegmentOf<Key extends string> = Key extends 'index' ? '' : Key extends `:${infer Name}` ? `{${Name}}` : Key

/** A route's key at `Prefix`: its next segment (`users`, `:id`, `index` for `/`), or its method. */
type KeyAt<X, Prefix extends string> = X extends { readonly path: `${Prefix}/${infer Rest}` }
  ? Rest extends `${infer Head}/${string}`
    ? Head extends `{${infer Name}}`
      ? `:${Name}`
      : Head extends ''
        ? 'index'
        : Head
    : Rest extends `{${infer Name}}`
      ? `:${Name}`
      : Rest extends ''
        ? 'index'
        : Rest
  : X extends { readonly path: Prefix; readonly method: infer M extends string }
    ? `$${M}` | '$url' | '$path'
    : never

/** The routes `R` grouped by their key at `Prefix`, in one pass (same key: a union). */
type Grouped<R, Prefix extends string> = { readonly [X in R as KeyAt<X, Prefix>]: X }

/** The intersection of a union's members (`never` for several string literals). */
type Intersect<U> = (U extends unknown ? (x: U) => void : never) extends (x: infer I) => void ? I : never

/** The members of a node whose routes `G` are grouped by key. */
type Members<G, Prefix extends string, Checked extends boolean> = {
  readonly [K in keyof G]: K extends '$url'
    ? UrlEndpoint<G[K]>
    : K extends '$path'
      ? PathEndpoint<G[K]>
      : K extends `$${string}`
        ? Fetcher<G[K], Checked>
        : Node<G[K], `${Prefix}/${SegmentOf<K & string>}`, Checked>
}

/**
 * One node of the chain for the routes under `Prefix`.
 * When all routes share the next key they pass through ungrouped: grouping would be quadratic.
 */
type Node<R, Prefix extends string, Checked extends boolean> =
  KeyAt<R, Prefix> extends infer K extends string
    ? [K] extends [Intersect<K>]
      ? { readonly [P in K]: Node<R, `${Prefix}/${SegmentOf<P>}`, Checked> }
      : Members<Grouped<R, Prefix>, Prefix, Checked>
    : never

/** The minimal route shape; a full `RouteConfig` would be compared against every route. */
type Route = { readonly method: string; readonly path: string; readonly responses: object }

/** The routes of `T`: one route, an array, a module, or an object keeping them in `~routes`. */
export type RoutesOf<T> = T extends Route
  ? T
  : T extends readonly (infer R)[]
    ? Extract<R, Route>
    : T extends { readonly '~routes': infer R }
      ? Extract<R, Route>
      : Extract<T[keyof T], Route>

/** The client of the routes `T`. `Checked` adds aliases and the client's own 422 and 502 responses. */
export type Client<T, Checked extends boolean = false> = Node<RoutesOf<T>, '', Checked> &
  (Checked extends true ? Aliases<RoutesOf<T>> : {})

/** The first argument of an endpoint. */
export type InferRequestType<T> = T extends (args: infer A, ...rest: never[]) => unknown ? NonNullable<A> : never

type BodyFor<R, U> =
  R extends ClientResponse<infer O, infer S, infer _F> ? ([Extract<S, U>] extends [never] ? never : O) : never

/** The response body of an endpoint for status `U`. */
export type InferResponseType<T, U extends number = number> = T extends (...args: never[]) => Promise<infer R>
  ? BodyFor<R, U>
  : never
