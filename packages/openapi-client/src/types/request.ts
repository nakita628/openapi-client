/** Request argument types of a call. */

import type { FormMediaType, JsonMediaType, JsonSchemaOf } from './response.js'
import type { InferInput } from './validation.js'

type ParamKeyOf<Segment extends string> = Segment extends `{${infer Name}}` ? Name : never

/** The names of the parameters a path template declares. */
export type ParamKeys<Path extends string> = Path extends `${infer Head}/${infer Rest}`
  ? ParamKeyOf<Head> | ParamKeys<Rest>
  : ParamKeyOf<Path>

type PathParams<Path extends string> = [ParamKeys<Path>] extends [never]
  ? {}
  : { readonly param: { readonly [K in ParamKeys<Path>]: string | number } }

type FormInput<C> = C[Extract<keyof C, FormMediaType>] extends { readonly schema: infer S }
  ? InferInput<S>
  : Readonly<Record<string, string | Blob | readonly (string | Blob)[]>>

export type BodyOf<C> = [Extract<keyof C, JsonMediaType>] extends [never]
  ? [Extract<keyof C, FormMediaType>] extends [never]
    ? {}
    : { readonly form: FormInput<C> }
  : { readonly json: InferInput<JsonSchemaOf<C>> }

// A declared part is always required (as in Hono), so optionality depends on the key alone and
// the schema's input is only computed when an argument is checked against it.
type Parts<Q, Path extends string> = (Q extends { readonly params: infer S }
  ? { readonly param: InferInput<S> }
  : PathParams<Path>) &
  (Q extends { readonly query: infer S } ? { readonly query: InferInput<S> } : {}) &
  (Q extends { readonly headers: infer S } ? { readonly header: InferInput<S> } : {}) &
  (Q extends { readonly cookies: infer S } ? { readonly cookie: InferInput<S> } : {}) &
  (Q extends { readonly body: infer B extends { readonly content: unknown } }
    ? B extends { readonly required: false }
      ? Partial<BodyOf<B['content']>>
      : BodyOf<B['content']>
    : {})

/** What a call takes: `param`, `query`, `header`, `cookie`, and `json` or `form`. */
export type RequestOfRoute<R> = R extends { readonly path: infer P extends string }
  ? R extends { readonly request: infer Q }
    ? Parts<Q, P>
    : PathParams<P>
  : never
