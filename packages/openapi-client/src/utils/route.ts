import type { RuntimeRoute } from '../types/validation.js'
import { isObject } from './object.js'
import { chainOf } from './path.js'

function isRoute(value: unknown): value is RuntimeRoute {
  return isObject(value) && typeof value['method'] === 'string' && typeof value['path'] === 'string'
}

/** The routes in `routes`: one route, an array, or a module. */
export function listRoutes(routes: unknown): readonly RuntimeRoute[] {
  return isRoute(routes) ? [routes] : Object.values(isObject(routes) ? routes : {}).filter(isRoute)
}

/** The routes by method and chain path (`get users/:id`). */
export function indexRoutes(routes: unknown): ReadonlyMap<string, RuntimeRoute> {
  const index = new Map<string, RuntimeRoute>()
  for (const route of listRoutes(routes)) {
    index.set(`${route.method.toLowerCase()} ${chainOf(route.path).join('/')}`, route)
  }
  return index
}
