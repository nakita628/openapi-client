/** Alias functions of a validating client: resolve to the success body, throw `DetailedError` otherwise. */

import type { ClientRequestOptions } from '../../types/client.js'
import type { ResponseBodyType } from '../../types/response.js'
import type { Args, RuntimeRoute } from '../../types/validation.js'
import { routeAliasOf } from '../../utils/alias.js'
import { bodyFormatOf } from '../../utils/media-type.js'
import { chainOf, pathOf } from '../../utils/path.js'
import { DetailedError, failure, readBody, unanswered } from '../response/index.js'
import { call, merge, searchOf } from './request.js'
import type { Called } from './request.js'

/** An alias function. */
export type Alias = (...args: readonly unknown[]) => Promise<unknown>

/** Methods whose alias takes the body as its first argument. */
const BODY_METHODS = new Set(['post', 'put', 'patch', 'delete', 'query'])

type AliasConfig = {
  readonly params?: Readonly<Record<string, unknown>>
  readonly queries?: Readonly<Record<string, unknown>>
  readonly headers?: Readonly<Record<string, unknown>>
  readonly cookies?: Readonly<Record<string, unknown>>
  readonly timeout?: number
  readonly responseType?: ResponseBodyType
  readonly signal?: AbortSignal | null
  readonly [init: string]: unknown
}

/** Builds the alias function of one route. */
function aliasFunction(
  alias: string,
  route: RuntimeRoute,
  base: string,
  options: ClientRequestOptions,
): (...args: readonly unknown[]) => Promise<unknown> {
  const method = route.method.toLowerCase()
  const segments = chainOf(route.path)
  const format = bodyFormatOf(route)
  return async (...args) => {
    const [body, config = {}] = (BODY_METHODS.has(method) ? args : [undefined, args[0]]) as [
      unknown,
      AliasConfig | undefined,
    ]
    const { params, queries, headers, cookies, timeout, responseType, signal, ...init } = config
    const request: Args = {
      ...(params === undefined ? {} : { param: params }),
      ...(queries === undefined ? {} : { query: queries }),
      ...(headers === undefined ? {} : { header: headers }),
      ...(cookies === undefined ? {} : { cookie: cookies }),
      ...(body === undefined
        ? {}
        : format.form !== undefined && format.json === undefined
          ? { form: body as Readonly<Record<string, unknown>> }
          : { json: body }),
    }
    const signals = [signal, timeout === undefined ? undefined : AbortSignal.timeout(timeout)].filter(
      (item): item is AbortSignal => item instanceof AbortSignal,
    )
    const callOptions = merge(options, {
      ...(init as ClientRequestOptions),
      ...(signals.length > 0 ? { signal: signals.length === 1 ? signals[0]! : AbortSignal.any(signals) } : {}),
    })
    const path = `/${pathOf(segments, request.param)}`
    const url = `${base}${path}${searchOf(request, callOptions)}`
    let result: Called
    try {
      result = await call(url, path, method, request, callOptions, route)
    } catch (error) {
      throw error instanceof DetailedError ? error : unanswered(error, alias)
    }
    if (!result.response.ok) throw failure(result.response, await readBody(result.response, method), alias)
    // Prefer the schema's output (transforms applied) when the body was validated as JSON.
    const asJson = responseType === undefined || responseType === 'auto' || responseType === 'json'
    return 'output' in result && asJson ? result.output : readBody(result.response, method, responseType)
  }
}

/** The routes' aliases by name; throws when two routes share an alias. */
export function aliasesOf(
  routes: readonly RuntimeRoute[],
  base: string,
  options: ClientRequestOptions,
): Map<string, Alias> {
  const aliases = new Map<string, Alias>()
  const owners = new Map<string, string>()
  for (const route of routes) {
    const alias = routeAliasOf(route)
    if (alias === undefined) continue
    const where = `${route.method.toUpperCase()} ${route.path}`
    const owner = owners.get(alias)
    if (owner !== undefined) throw new TypeError(`The alias "${alias}" is both ${owner}'s and ${where}'s`)
    owners.set(alias, where)
    aliases.set(alias, aliasFunction(alias, route, base, options))
  }
  return aliases
}
