/** Types of the operationId aliases of a validating client. */

import type { BodyOf, ParamKeys } from './request.js'
import type { JsonMediaType, JsonSchemaOf, ResponseBodyType } from './response.js'
import type { InferInput, InferOutput } from './validation.js'
import type { InfoStatusCode, RedirectStatusCode, SuccessStatusCode } from './status.js'

type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'

/** Word separators of an operationId: ASCII punctuation and space (not `_`, `$`). */
// prettier-ignore
type Separator =
  | ' ' | '!' | '"' | '#' | '%' | '&' | "'" | '(' | ')' | '*' | '+' | ',' | '-' | '.' | '/'
  | ':' | ';' | '<' | '=' | '>' | '?' | '@' | '[' | '\\' | ']' | '^' | '`' | '{' | '|' | '}' | '~'

type Words<
  S extends string,
  Alias extends string = '',
  Capitalize extends boolean = false,
> = S extends `${infer C}${infer Rest}`
  ? C extends Separator
    ? Words<Rest, Alias, true>
    : Words<Rest, `${Alias}${Capitalize extends true ? (Alias extends '' ? C : Uppercase<C>) : C}`, false>
  : Alias extends `${Digit}${string}`
    ? `_${Alias}`
    : Alias

/** The alias of an operationId: its words camel-cased (`list-pets` -> `listPets`), `_` before a leading digit. */
export type AliasOf<S extends string> = S extends `${string}${Separator}${string}` | `${Digit}${string}` ? Words<S> : S

/** Methods whose alias takes the body as its first argument. */
type BodyMethod = 'post' | 'put' | 'patch' | 'delete' | 'query'

/** `{ [K]: T }`, or `{ [K]?: T }` when nothing in `T` is required. */
type AliasPart<K extends string, T> = {} extends T ? { readonly [P in K]?: T } : { readonly [P in K]: T }

type AliasParams<Q, Path extends string> = Q extends { readonly params: infer S }
  ? AliasPart<'params', InferInput<S>>
  : [ParamKeys<Path>] extends [never]
    ? {}
    : { readonly params: { readonly [K in ParamKeys<Path>]: string | number } }

type AliasParts<R> = R extends { readonly path: infer P extends string }
  ? (R extends { readonly request: infer Q } ? Q : {}) extends infer Q
    ? AliasParams<Q, P> &
        (Q extends { readonly query: infer S } ? AliasPart<'queries', InferInput<S>> : {}) &
        (Q extends { readonly headers: infer S } ? AliasPart<'headers', InferInput<S>> : {}) &
        (Q extends { readonly cookies: infer S } ? AliasPart<'cookies', InferInput<S>> : {})
    : never
  : never

/** Options every alias call takes besides its request parts. */
// An interface rather than `Omit<RequestInit, ...> & {...}`: its members are resolved once.
export interface AliasRequestOptions {
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
  /** Extra headers to send. */
  readonly headers?: Readonly<Record<string, string>>
  /** Milliseconds before the request is aborted. */
  readonly timeout?: number
  /** How to read the body: `auto` (the default) by its `Content-Type`. */
  readonly responseType?: ResponseBodyType
}

type AliasConfigArgs<R> =
  {} extends AliasParts<R>
    ? [config?: AliasParts<R> & AliasRequestOptions]
    : [config: AliasParts<R> & AliasRequestOptions]

/** The body an alias takes first; `undefined` when the route has none. */
type AliasBody<R> = R extends { readonly request: { readonly body: infer B } }
  ? (B extends { readonly content: infer C } ? BodyOf<C> : {}) extends infer Parts
    ? (
        Parts extends { readonly json: infer J } ? J : Parts extends { readonly form: infer F } ? F : undefined
      ) extends infer Body
      ? B extends { readonly required: false }
        ? Body | undefined
        : Body
      : never
    : never
  : undefined

/** `responses` keys of a 1XX-3XX status. */
type SuccessKey =
  | InfoStatusCode
  | SuccessStatusCode
  | RedirectStatusCode
  | `${InfoStatusCode | SuccessStatusCode | RedirectStatusCode}`
  | '1XX'
  | '2XX'
  | '3XX'

/** A declared response's body, as its schema outputs it. */
type OutputOf<Config> = Config extends { readonly content: infer C }
  ? C extends { readonly 'application/json': { readonly schema: infer S } }
    ? InferOutput<S>
    : [Extract<keyof C, JsonMediaType>] extends [never]
      ? [Extract<keyof C, `text/${string}`>] extends [never]
        ? unknown
        : string
      : InferOutput<JsonSchemaOf<C>>
  : undefined

/** What an alias resolves to: the output of the declared 1XX-3XX response bodies. */
type AliasResult<R> = R extends { readonly responses: infer Rs } ? OutputOf<Rs[Extract<keyof Rs, SuccessKey>]> : never

/** One alias function; body-carrying methods take the body first. */
export type AliasFunction<R> = R extends { readonly method: BodyMethod }
  ? (body: AliasBody<R>, ...config: AliasConfigArgs<R>) => Promise<AliasResult<R>>
  : (...config: AliasConfigArgs<R>) => Promise<AliasResult<R>>

/** One alias function per route with an `operationId`. */
export type Aliases<R> = {
  readonly [E in AliasEntries<R> as E['name']]: AliasFunction<E['route']>
}

// Names are computed once here: a key-remapped mapped type would recompute them on every property read.
type AliasEntries<R> = R extends { readonly operationId: infer Id extends string }
  ? { readonly name: AliasOf<Id>; readonly route: R }
  : never
