/** Response types of a call. */

import type { InferInput } from './validation.js'
import type {
  InfoStatusCode,
  NotSuccessStatusCode,
  RedirectStatusCode,
  StatusCode,
  StatusOf,
  SuccessStatusCode,
} from './status.js'
import type { RequestValidationProblem, ResponseValidationProblem } from './validation.js'

/** How an alias reads a body; `auto` goes by the `Content-Type`. */
export type ResponseBodyType = 'auto' | 'json' | 'text' | 'blob' | 'arrayBuffer' | 'formData' | 'stream'

/** How a declared body reads: `json` (typed by its schema), `text`, `body` (any other), `none`. */
export type ResponseFormat = 'json' | 'text' | 'body' | 'none'

/** A `Response` whose `status`, `ok` and `json()` are those of one declared response. */
export interface ClientResponse<T, U extends number = StatusCode, F extends ResponseFormat = ResponseFormat> {
  readonly body: ReadableStream<Uint8Array> | null
  readonly bodyUsed: boolean
  readonly ok: U extends SuccessStatusCode ? true : U extends NotSuccessStatusCode ? false : boolean
  readonly redirected: boolean
  readonly status: U
  readonly statusText: string
  readonly type: ResponseType
  readonly headers: Headers
  readonly url: string
  clone(): Response
  json(): F extends 'json' ? Promise<T> : F extends 'text' ? Promise<never> : Promise<unknown>
  text(): Promise<string>
  blob(): Promise<Blob>
  bytes(): Promise<Uint8Array<ArrayBuffer>>
  formData(): Promise<FormData>
  arrayBuffer(): Promise<ArrayBuffer>
}

export type JsonMediaType = 'application/json' | `application/${string}+json`

export type FormMediaType = 'multipart/form-data' | 'application/x-www-form-urlencoded'

/** The schema of a content's JSON media type (`application/json` or `+json`). */
export type JsonSchemaOf<C> = C extends { readonly 'application/json': { readonly schema: infer S } }
  ? S
  : C[Extract<keyof C, JsonMediaType>] extends { readonly schema: infer S }
    ? S
    : undefined

type ResponseOf<U extends number, Config> = Config extends {
  readonly content: { readonly 'application/json': { readonly schema: infer S } }
}
  ? ClientResponse<InferInput<S>, U, 'json'>
  : Config extends { readonly content: infer C }
    ? [Extract<keyof C, JsonMediaType>] extends [never]
      ? [Extract<keyof C, `text/${string}`>] extends [never]
        ? ClientResponse<unknown, U, 'body'>
        : ClientResponse<string, U, 'text'>
      : ClientResponse<InferInput<JsonSchemaOf<C>>, U, 'json'>
    : ClientResponse<undefined, U, 'none'>

/** One `ClientResponse` per declared status. A JSON body is typed as its schema's input (what the server sends). */
export type ResponseOfRoute<R> = R extends { readonly responses: infer Rs }
  ? { [K in keyof Rs]: ResponseOf<StatusOf<K>, Rs[K]> }[keyof Rs]
  : never

/** The Problem Details responses a validating client produces itself: 422 and 502. */
export type ProblemResponse =
  | ClientResponse<RequestValidationProblem, 422, 'json'>
  | ClientResponse<ResponseValidationProblem, 502, 'json'>

type Success<R> =
  R extends ClientResponse<infer O, infer S, infer F>
    ? [Extract<S, InfoStatusCode | SuccessStatusCode | RedirectStatusCode>] extends [never]
      ? never
      : F extends 'json'
        ? O
        : F extends 'none'
          ? undefined
          : string
    : never

/** What `parseResponse()` resolves to: the body of the declared 1XX-3XX responses (not `default`). */
export type ParsedResponse<T> = [Success<T>] extends [never] ? undefined : Success<T>
