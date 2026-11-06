/** Schema and validation types. */

/**
 * A Standard Schema (https://standardschema.dev). Only the key is checked: constraining `~standard`
 * would instantiate Zod's `this`-typed one for every schema of every route.
 */
export type StandardSchema = { readonly '~standard': unknown }

/** A TypeScript type in place of a schema, made by `schema<T>()`: typed, never validated. */
export type TypeSchema<T = unknown> = {
  readonly '~schema': true
  /** Phantom; never set at run time. */
  readonly type?: T
}

/** What a schema slot takes: a Standard Schema or a `schema<T>()` type. */
export type RouteSchema = StandardSchema | TypeSchema

/** An Effect schema, converted to a Standard Schema at run time by openapi-client/effect. */
export type ConvertibleSchema = { readonly ast: object; readonly Type: unknown; readonly Encoded: unknown }

/**
 * What a schema accepts, read from the cheapest place per library (Zod `_zod.input`, ArkType
 * `inferIn`, Standard Schema `~standard.types.input`, `schema<T>()`, Effect `Encoded`).
 * Library-specific places are read by index rather than `infer`, which is matched twice.
 */
export type InferInput<S> = S extends { readonly _zod: { readonly input: unknown } }
  ? S['_zod']['input']
  : S extends { readonly inferIn: unknown; readonly '~standard': unknown }
    ? S['inferIn']
    : S extends { readonly '~standard': { readonly types?: { readonly input: infer I } | undefined } }
      ? I
      : S extends { readonly '~schema': true; readonly type?: infer T }
        ? T
        : S extends { readonly Encoded: unknown; readonly ast: object }
          ? S['Encoded']
          : unknown

/** What a schema outputs (transforms applied); read like `InferInput`. */
export type InferOutput<S> = S extends { readonly _zod: { readonly output: unknown } }
  ? S['_zod']['output']
  : S extends { readonly inferOut: unknown; readonly '~standard': unknown }
    ? S['inferOut']
    : S extends { readonly '~standard': { readonly types?: { readonly output: infer O } | undefined } }
      ? O
      : S extends { readonly '~schema': true; readonly type?: infer T }
        ? T
        : S extends { readonly Type: unknown; readonly ast: object }
          ? S['Type']
          : unknown

/** Where a validation issue was found: a parameter location or the body. */
export type ValidationLocation = 'path' | 'query' | 'header' | 'cookie' | 'body'

export type ValidationIssue = {
  readonly in: ValidationLocation
  /** Dot-separated path inside the part (`items.0.name`); empty for the part itself. */
  readonly path: string
  readonly message: string
}

type Problem<Status, Title> = {
  readonly type: 'about:blank'
  readonly title: Title
  readonly status: Status
  readonly detail: string
  /** The call's path (`/users/1`), without the base URL. */
  readonly instance: string
  readonly errors: readonly ValidationIssue[]
}

/** The 422 body for a request that failed validation (it was not sent). */
export type RequestValidationProblem = Problem<422, 'Unprocessable Content'>

/** The 502 body for a response that failed validation. */
export type ResponseValidationProblem = Problem<502, 'Bad Gateway'>

export type RuntimeContent = { readonly [mediaType: string]: { readonly schema?: unknown } }

/** A route as read at run time. */
export type RuntimeRoute = {
  readonly method: string
  readonly path: string
  readonly request?: {
    readonly params?: unknown
    readonly query?: unknown
    readonly headers?: unknown
    readonly cookies?: unknown
    readonly body?: { readonly required?: boolean; readonly content: RuntimeContent }
  }
  readonly responses: {
    readonly [status: string]: { readonly content?: RuntimeContent; readonly headers?: unknown } | undefined
  }
}

/** The request parts a call was given. */
export type Args = {
  readonly param?: Readonly<Record<string, unknown>>
  readonly query?: Readonly<Record<string, unknown>>
  readonly header?: Readonly<Record<string, unknown>>
  readonly cookie?: Readonly<Record<string, unknown>>
  readonly json?: unknown
  readonly form?: Readonly<Record<string, unknown>>
}

/** Result of checking a response: issues, the (replayable) response, and the body's schema output if any. */
export type ResponseCheck = {
  readonly issues: readonly ValidationIssue[]
  readonly response: Response
  readonly output?: unknown
}
