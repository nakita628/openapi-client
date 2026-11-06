/** `oc()`: a Proxy-based client where each property is a path segment and `$get()` etc. send the request. */

import type { Client, ClientRequestOptions } from '../../types/client.js'
import type { Args, RuntimeRoute } from '../../types/validation.js'
import { pathOf } from '../../utils/path.js'
import { indexRoutes, listRoutes } from '../../utils/route.js'
import { aliasesOf } from './alias.js'
import type { Alias } from './alias.js'
import { call, merge, searchOf, send } from './request.js'

/** What a chain ending in a method resolves to, computed once per node. */
type Leaf = {
  /** `get`, `post`, ..., `url`, `path`; undefined if the chain does not end in one. */
  readonly method: string | undefined
  readonly segments: readonly string[]
  readonly route: RuntimeRoute | undefined
  /** The precomputed path when the chain has no parameters. */
  readonly path: string | undefined
}

/** Shared by all nodes of one client. */
type Calls = {
  readonly call: (chain: readonly string[], leaf: Leaf, args: readonly unknown[]) => unknown
  readonly leaf: (chain: readonly string[]) => Leaf
}

/** A client node; child nodes are cached so re-reading a chain creates no new proxies. */
function proxy(calls: Calls, aliases: ReadonlyMap<string, Alias>, path: readonly string[] = []): unknown {
  const children = new Map<string, unknown>()
  let leaf: Leaf | undefined
  return new Proxy(() => {}, {
    // `then` stays undefined so `await` does not treat the client as a thenable.
    get: (_target, key) => {
      if (typeof key !== 'string' || key === 'then') return undefined
      let child = children.get(key)
      if (child === undefined) children.set(key, (child = proxy(calls, aliases, [...path, key])))
      return child
    },
    // A name can be both an alias (`client.login()`) and a path segment (`client.login.$post()`).
    apply: (_target, _this, args) => {
      const alias = path.length === 1 ? aliases.get(path[0]!) : undefined
      return alias === undefined ? calls.call(path, (leaf ??= calls.leaf(path)), args) : alias(...args)
    },
  })
}

/**
 * Creates a client. `oc<typeof routes>(url)` is typed only; `oc(routes, url)` also validates
 * (422/502 Problem Details) and adds operationId aliases. `C` overrides the client type.
 */
export function oc<T, C = Client<T>>(baseUrl: string, options?: ClientRequestOptions): C
export function oc<T, C = Client<T, true>>(routes: T, baseUrl: string, options?: ClientRequestOptions): C
export function oc(...args: readonly unknown[]): unknown {
  const given = typeof args[0] !== 'string'
  const [routes, baseUrl, options = {}] = (given ? args : [undefined, ...args]) as [
    unknown,
    string,
    ClientRequestOptions | undefined,
  ]
  const index = given ? indexRoutes(routes) : undefined
  const base = baseUrl.replace(/\/+$/, '')
  const aliases = given ? aliasesOf(listRoutes(routes), base, options) : new Map<string, Alias>()

  const callChain: Calls['call'] = (chain, { method, segments, route, path: fixed }, [callArgs, callOptions]) => {
    if (method === undefined) {
      throw new TypeError(`client.${chain.join('.')} is not a function: end the chain with $get(), $url(), ...`)
    }
    const request = callArgs as Args | undefined
    const path = fixed ?? `/${pathOf(segments, request?.param)}`
    const search = searchOf(request, options)
    if (method === 'url') return new URL(`${base}${path}${search}`)
    if (method === 'path') return `${path}${search}`
    const merged = merge(options, callOptions as ClientRequestOptions)
    // Nothing to validate: return fetch's promise directly.
    if (route === undefined) {
      return send(`${base}${path}${search}`, method, request, merged, route)
    }
    return call(`${base}${path}${search}`, path, method, request, merged, route).then(({ response }) => response)
  }
  function leaf(chain: readonly string[]): Leaf {
    const method = chain.at(-1)?.match(/^\$(.+)$/)?.[1]
    const segments = chain.slice(0, -1)
    const fixed = segments.some((segment) => segment.startsWith(':')) ? undefined : `/${pathOf(segments, undefined)}`
    return { method, segments, route: index?.get(`${method} ${segments.join('/')}`), path: fixed }
  }
  return proxy({ call: callChain, leaf }, aliases)
}
