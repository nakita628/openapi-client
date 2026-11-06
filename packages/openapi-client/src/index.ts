/** openapi-client: `oc()`, an OpenAPI client called like Hono's RPC client, typed by OpenAPI routes. */

export { oc } from './helper/client/index.js'
export { DetailedError, parseResponse } from './helper/response/index.js'
export { createRoute, schema } from './helper/route/index.js'

export type { AliasFunction, AliasOf, Aliases, AliasRequestOptions } from './types/alias.js'
export type {
  Client,
  ClientRequestOptions,
  Endpoint,
  InferRequestType,
  InferResponseType,
  OptionalEndpoint,
  PathEndpoint,
  UrlArgs,
  UrlEndpoint,
} from './types/client.js'
export type { ClientResponse, ParsedResponse, ResponseFormat } from './types/response.js'
export type { Method, RouteConfig, RouteContent } from './types/route.js'
export type {
  ClientErrorStatusCode,
  InfoStatusCode,
  RedirectStatusCode,
  ServerErrorStatusCode,
  StatusCode,
  SuccessStatusCode,
} from './types/status.js'
export type {
  InferInput,
  InferOutput,
  RequestValidationProblem,
  ResponseValidationProblem,
  RouteSchema,
  StandardSchema,
  TypeSchema,
  ValidationIssue,
  ValidationLocation,
} from './types/validation.js'
