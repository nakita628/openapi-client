/**
 * The routes the tests are written against, declared with `createRoute()` and Zod, and a server
 * that answers them as `fetch` would: `oc(routes, url, { fetch: server })`.
 */

import * as z from 'zod'

import { createRoute } from './index.js'

const User = z.object({ id: z.string(), name: z.string(), age: z.number().optional() })
const Problem = z.object({ message: z.string() })

export const getIndexRoute = createRoute({
  method: 'get',
  path: '/',
  responses: { 200: { description: 'Text', content: { 'text/plain': { schema: z.string() } } } },
})

export const listUsersRoute = createRoute({
  method: 'get',
  path: '/users',
  request: {
    query: z.object({ page: z.string().optional(), tag: z.union([z.string(), z.array(z.string())]).optional() }),
  },
  responses: {
    200: { description: 'Users', content: { 'application/json': { schema: z.array(User) } } },
  },
})

export const createUserRoute = createRoute({
  method: 'post',
  path: '/users',
  request: {
    headers: z.object({ 'x-request-id': z.string() }),
    body: { required: true, content: { 'application/json': { schema: User.omit({ id: true }) } } },
  },
  responses: {
    201: { description: 'Created', content: { 'application/json': { schema: User } } },
    400: { description: 'Bad', content: { 'application/json': { schema: Problem } } },
  },
})

export const getUserRoute = createRoute({
  method: 'get',
  path: '/users/{id}',
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: 'The user', content: { 'application/json': { schema: User } } },
    404: { description: 'No such user', content: { 'application/json': { schema: Problem } } },
  },
})

export const deleteUserRoute = createRoute({
  method: 'delete',
  path: '/users/{id}',
  request: { cookies: z.object({ session: z.string() }) },
  responses: { 204: { description: 'Deleted' } },
})

export const getPostRoute = createRoute({
  method: 'get',
  path: '/users/{userId}/posts/{postId}',
  responses: {
    200: {
      description: 'A post',
      content: { 'application/json': { schema: z.object({ userId: z.string(), postId: z.string() }) } },
    },
  },
})

/** Not served: the tests check the request it makes. */
export const uploadRoute = createRoute({
  method: 'post',
  path: '/upload',
  request: {
    body: {
      content: { 'multipart/form-data': { schema: z.object({ file: z.instanceof(Blob), tags: z.array(z.string()) }) } },
    },
  },
  responses: { 204: { description: 'Uploaded' } },
})

type Served = {
  readonly request: Request
  readonly url: URL
  /** The path parameters, by the names of the template. */
  readonly params: Readonly<Record<string, string>>
}

type Handler = (served: Served) => Response | Promise<Response>

/**
 * A server for the tests, called as `fetch` is: a handler per `METHOD /path/{param}`, a request
 * answered by the one whose method and path template it matches, a 404 otherwise.
 */
export function serve(
  handlers: Readonly<Record<string, Handler>>,
): (input: string, init: RequestInit) => Promise<Response> {
  const entries = Object.entries(handlers).map(([key, handler]) => {
    const [method = '', path = ''] = key.split(' ')
    const names: string[] = []
    const source = path.replaceAll(/\{([^/{}]+)\}/gu, (_whole, name: string) => {
      names.push(name)
      return '([^/]+)'
    })
    return { method, pattern: new RegExp(`^${source}$`, 'u'), names, handler }
  })
  return async (input, init) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    for (const { method, pattern, names, handler } of entries) {
      const match = request.method === method ? pattern.exec(url.pathname) : null
      if (match !== null) {
        const params = Object.fromEntries(
          names.map((name, index) => [name, decodeURIComponent(match[index + 1] ?? '')]),
        )
        return handler({ request, url, params })
      }
    }
    return new Response(null, { status: 404 })
  }
}

/** A JSON response. */
export function json(body: unknown, status = 200) {
  return Response.json(body, { status })
}

function cookieOf(request: Request, name: string) {
  return (request.headers.get('cookie') ?? '')
    .split('; ')
    .map((pair) => pair.split('='))
    .find(([key]) => key === name)?.[1]
}

/** The routes above, served. */
export const server = serve({
  'GET /': () => new Response('takibi🔥', { headers: { 'Content-Type': 'text/plain; charset=UTF-8' } }),
  'GET /users': ({ url }) => json([{ id: url.searchParams.getAll('tag').join(',') || 'none', name: url.search }]),
  'POST /users': async ({ request }) => {
    const body = (await request.json()) as { readonly name?: unknown }
    if (body.name === '') return json({ message: 'empty name' }, 400)
    return json({ id: request.headers.get('x-request-id'), ...body }, 201)
  },
  'GET /users/{id}': ({ request, params }) =>
    params['id'] === 'missing'
      ? json({ message: 'not found' }, 404)
      : json({ id: params['id'], name: request.headers.get('authorization') ?? 'anonymous' }),
  'DELETE /users/{id}': ({ request }) =>
    new Response(null, { status: cookieOf(request, 'session') === 'ok' ? 204 : 401 }),
  'GET /users/{userId}/posts/{postId}': ({ params }) => json(params),
})
