/** Sending a call's request, and validating it when the route is known. */

import type { ClientRequestOptions } from '../../types/client.js'
import type { Args, RuntimeRoute } from '../../types/validation.js'
import { bodyFormatOf } from '../../utils/media-type.js'
import { buildSearchParams, formOf, present, text } from '../../utils/value.js'
import { checkRequest, checkResponse, problem } from '../validation/index.js'

/** The query string of a call, `?` included; empty without a query. */
export function searchOf(args: Args | undefined, options: ClientRequestOptions): string {
  if (!args?.query) return ''
  const search = (options.buildSearchParams ?? buildSearchParams)(args.query).toString()
  return search ? `?${search}` : ''
}

const NO_FORMAT: ReturnType<typeof bodyFormatOf> = {}

const formats = new WeakMap<RuntimeRoute, ReturnType<typeof bodyFormatOf>>()

/** A route's body format, worked out once per route. */
function formatOf(route: RuntimeRoute): ReturnType<typeof bodyFormatOf> {
  let format = formats.get(route)
  if (format === undefined) formats.set(route, (format = bodyFormatOf(route)))
  return format
}

/** Sends the request of one call; `route`, when known, decides the body encoding. */
export async function send(
  url: string,
  method: string,
  args: Args | undefined,
  options: ClientRequestOptions,
  route: RuntimeRoute | undefined,
) {
  const { fetch: fetcher = fetch, headers: given, buildSearchParams: _, ...init } = options
  const headers = new Headers()
  if (args?.header) {
    for (const key of Object.keys(args.header)) {
      const value = args.header[key]
      if (present(value)) headers.set(key, text(value))
    }
  }
  if (args?.cookie) {
    const cookie = Object.entries(args.cookie)
      .filter(([, value]) => present(value))
      .map(([key, value]) => `${key}=${encodeURIComponent(text(value))}`)
      .join('; ')
    if (cookie) headers.set('Cookie', cookie)
  }

  const upper = method.toUpperCase()
  let body: BodyInit | undefined
  if (upper !== 'GET' && upper !== 'HEAD') {
    const format = route === undefined ? NO_FORMAT : formatOf(route)
    if (args?.json !== undefined) {
      body = JSON.stringify(args.json)
      // Use the route's declared JSON media type (`application/merge-patch+json`, ...).
      headers.set('Content-Type', format.json ?? 'application/json')
    } else if (args?.form) {
      body = formOf(args.form, format.form ?? 'multipart')
    }
  }
  // Option headers override the ones the call writes.
  if (given !== undefined) {
    for (const [key, value] of new Headers(typeof given === 'function' ? await given() : given)) headers.set(key, value)
  }
  return fetcher(url, {
    ...init,
    method: upper,
    headers,
    ...(body === undefined ? {} : { body }),
  })
}

export type Called = { readonly response: Response; readonly output?: unknown }

/** One call: request and response validated against `route` when given. */
export async function call(
  url: string,
  path: string,
  method: string,
  args: Args | undefined,
  options: ClientRequestOptions,
  route: RuntimeRoute | undefined,
): Promise<Called> {
  if (route !== undefined) {
    let issues = checkRequest(route, args)
    if (issues instanceof Promise) issues = await issues
    if (issues.length > 0) return { response: problem(422, path, issues) }
  }
  const response = await send(url, method, args, options, route)
  if (route === undefined) return { response }
  const checked = await checkResponse(route, response)
  if (checked.issues.length > 0) return { response: problem(502, path, checked.issues) }
  return 'output' in checked ? { response: checked.response, output: checked.output } : { response: checked.response }
}

type HeadersOption = ClientRequestOptions['headers']

async function resolve(headers: HeadersOption): Promise<HeadersInit | undefined> {
  return typeof headers === 'function' ? headers() : headers
}

/** Headers, `over`'s replacing `base`'s of the same name. */
function combine(base: HeadersInit | undefined, over: HeadersInit | undefined): Headers {
  const headers = new Headers(base)
  for (const [key, value] of new Headers(over)) headers.set(key, value)
  return headers
}

/** Merges two `headers` options; if either is a function the result is one, called per request. */
function mergeHeaders(base: HeadersOption, over: HeadersOption): HeadersOption {
  if (base === undefined) return over
  if (over === undefined) return base
  if (typeof base === 'function' || typeof over === 'function') {
    return async () => combine(await resolve(base), await resolve(over))
  }
  return combine(base, over)
}

/** A call's options over the client's: `headers` merged, the others replaced. */
export function merge(base: ClientRequestOptions, over: ClientRequestOptions | undefined): ClientRequestOptions {
  if (!over) return base
  return { ...base, ...over, headers: mergeHeaders(base.headers, over.headers) }
}
