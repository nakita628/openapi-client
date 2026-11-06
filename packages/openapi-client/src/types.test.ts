/**
 * Type-level expectations, checked by compiling this file: every `@ts-expect-error` must be a
 * real error, and everything else must type. Nothing here runs.
 */

import { type } from 'arktype'
import { Schema } from 'effect'
import * as v from 'valibot'
import * as z from 'zod'

import * as routes from './fixtures.js'
import { createRoute, oc, parseResponse, schema } from './index.js'
import type {
  ClientResponse,
  InferRequestType,
  InferResponseType,
  RequestValidationProblem,
  ResponseValidationProblem,
} from './index.js'

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
function expectType<T extends true>(): T | undefined {
  return undefined
}

type User = { id: string; name: string; age?: number | undefined }

const client = oc<typeof routes>('http://localhost')

export async function chain() {
  // `/` is `index`, `{id}` is `:id`, and only the declared methods are there.
  void client.index.$get()
  void client.users[':id'].$get({ param: { id: '1' } })
  void client.users[':id'].$delete({ param: { id: '1' }, cookie: { session: 's' } })
  void client.users[':userId'].posts[':postId'].$get({ param: { userId: '1', postId: 2 } })
  // @ts-expect-error no such path
  void client.posts.$get()
  // @ts-expect-error `/users` declares no PUT
  void client.users.$put()
  // @ts-expect-error the OpenAPI spelling is not a property
  void client.users['{id}']
}

export async function requests() {
  // A declared part is required, as in Hono, even when nothing in it is.
  void client.users.$get({ query: {} })
  void client.users.$get({ query: { tag: ['a'] } })
  // @ts-expect-error `query` is declared
  void client.users.$get()
  // Without a declared part, the arguments may be left out.
  void client.index.$get()
  // @ts-expect-error `page` is a string
  void client.users.$get({ query: { page: 1 } })
  // @ts-expect-error the param is required
  void client.users[':id'].$get()
  // @ts-expect-error `id` is missing
  void client.users[':id'].$get({ param: {} })
  // @ts-expect-error the header is required
  void client.users.$post({ json: { name: 'n' } })
  // @ts-expect-error the body is a User without id
  void client.users.$post({ header: { 'x-request-id': 'r' }, json: { name: 1 } })
  void client.upload.$post({ form: { file: new Blob([]), tags: [] } })

  expectType<
    Equal<
      InferRequestType<typeof client.users.$post>,
      { readonly header: { 'x-request-id': string } } & { readonly json: { name: string; age?: number | undefined } }
    >
  >()
}

export async function responses() {
  const res = await client.users[':id'].$get({ param: { id: '1' } })
  if (res.ok) {
    expectType<Equal<typeof res.status, 200>>()
    expectType<Equal<Awaited<ReturnType<typeof res.json>>, User>>()
  } else {
    expectType<Equal<typeof res.status, 404>>()
    expectType<Equal<Awaited<ReturnType<typeof res.json>>, { message: string }>>()
  }
  if (res.status === 404) expectType<Equal<typeof res.ok, false>>()

  expectType<Equal<InferResponseType<typeof client.users.$get>, User[]>>()
  expectType<Equal<InferResponseType<typeof client.users.$post, 400>, { message: string }>>()
  expectType<Equal<InferResponseType<typeof client.users.$post, 201>, User>>()

  // A text response reads as a string, a response without content as nothing.
  const text = await client.index.$get()
  expectType<Equal<typeof text, ClientResponse<string, 200, 'text'>>>()
  const deleted = await client.users[':id'].$delete({ param: { id: '1' }, cookie: { session: 's' } })
  expectType<Equal<typeof deleted, ClientResponse<undefined, 204, 'none'>>>()
}

export async function parsed() {
  // The body of the declared 1XX-3XX responses; the others throw.
  expectType<Equal<Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<typeof client.users.$post>>>>>, User>>()
  const user = await parseResponse(client.users[':id'].$get({ param: { id: '1' } }))
  expectType<Equal<typeof user, User>>()
  const text = await parseResponse(client.index.$get())
  expectType<Equal<typeof text, string>>()
  const nothing = await parseResponse(client.users[':id'].$delete({ param: { id: '1' }, cookie: { session: 's' } }))
  expectType<Equal<typeof nothing, undefined>>()
}

// A `schema<T>()` in place of a Zod schema, string and range status keys, and a single route, an
// array or an object of routes as `T`.
const getThingRoute = createRoute({
  method: 'get',
  path: '/things/{thingId}',
  responses: {
    '200': { description: 'A thing', content: { 'application/json': { schema: schema<{ thing: true }>() } } },
    '4XX': { description: 'Bad', content: { 'application/problem+json': { schema: z.object({ title: z.string() }) } } },
    default: { description: 'Anything else' },
  },
})

export async function otherShapes() {
  const one = oc<typeof getThingRoute>('http://localhost')
  const res = await one.things[':thingId'].$get({ param: { thingId: 't' } })
  type Get = (typeof one.things)[':thingId']['$get']
  expectType<Equal<InferResponseType<Get, 200>, { thing: true }>>()
  // `4XX` stands for every client error. `default` is any status, picked only with all of them
  // (it declares no content here).
  expectType<Equal<InferResponseType<Get, 404>, { title: string }>>()
  expectType<Equal<InferResponseType<Get>, { thing: true } | { title: string } | undefined>>()
  // `default` may be any status, so it is left with the not-ok ones.
  if (!res.ok) expectType<Equal<typeof res.status, number>>()
  expectType<Equal<Awaited<ReturnType<typeof parseResponse<typeof res>>>, { thing: true }>>()

  const many = oc<[typeof getThingRoute, typeof routes.getIndexRoute]>('http://localhost')
  void many.index.$get()
  many.things[':thingId'].$url({ param: { thingId: 't' } })
  // @ts-expect-error `thingId` is missing
  many.things[':thingId'].$url({ param: {} })
}

// A validating client, `oc(routes, url)`: the same calls, and the 422 / 502 problems it answers.
export async function validating() {
  const checked = oc(routes, 'http://localhost')
  const res = await checked.users[':id'].$get({ param: { id: '1' } })
  if (res.status === 422) expectType<Equal<Awaited<ReturnType<typeof res.json>>, RequestValidationProblem>>()
  if (res.status === 502) expectType<Equal<Awaited<ReturnType<typeof res.json>>, ResponseValidationProblem>>()
  if (res.ok) expectType<Equal<Awaited<ReturnType<typeof res.json>>, User>>()
  type Get = (typeof checked.users)[':id']['$get']
  expectType<Equal<InferResponseType<Get, 422 | 502>, RequestValidationProblem | ResponseValidationProblem>>()
  // parseResponse still answers the declared success body: the problems throw.
  expectType<Equal<Awaited<ReturnType<typeof parseResponse<Awaited<ReturnType<Get>>>>>, User>>()
  // @ts-expect-error the same arguments are checked
  void checked.users[':id'].$get({ param: {} })

  // The typed-only client declares no such responses.
  expectType<Equal<InferResponseType<(typeof client.users)[':id']['$get'], 422 | 502>, never>>()
}

// An operation typed with TypeScript alone: `schema<T>()` in place of every schema.
type Post = { id: string; title: string }
const createPostRoute = createRoute({
  method: 'post',
  path: '/posts/{postId}',
  request: {
    params: schema<{ postId: string }>(),
    query: schema<{ draft?: 'true' | 'false' }>(),
    body: { content: { 'application/json': { schema: schema<Omit<Post, 'id'>>() } } },
  },
  responses: {
    201: { description: 'Created', content: { 'application/json': { schema: schema<Post>() } } },
    404: { description: 'No such post' },
  },
})

export async function typeOnly() {
  const posts = oc(createPostRoute, 'http://localhost')
  type Post$ = (typeof posts.posts)[':postId']['$post']
  expectType<
    Equal<
      InferRequestType<Post$>,
      { readonly param: { postId: string } } & { readonly query: { draft?: 'true' | 'false' } } & {
        readonly json: Omit<Post, 'id'>
      }
    >
  >()
  expectType<Equal<InferResponseType<Post$, 201>, Post>>()
  const created = await parseResponse(
    posts.posts[':postId'].$post({ param: { postId: 'p' }, query: {}, json: { title: 't' } }),
  )
  expectType<Equal<typeof created, Post>>()
  // @ts-expect-error the body is a Post without id
  void posts.posts[':postId'].$post({ param: { postId: 'p' }, query: {}, json: { title: 1 } })
}

// Valibot: typed through Standard Schema's `~standard.types`.
const getValibotUserRoute = createRoute({
  method: 'get',
  path: '/v/{id}',
  request: { params: v.object({ id: v.string() }), query: v.object({ page: v.optional(v.string()) }) },
  responses: {
    200: {
      description: 'ok',
      content: { 'application/json': { schema: v.object({ id: v.string(), age: v.optional(v.number()) }) } },
    },
  },
})

export async function valibot() {
  const vc = oc<typeof getValibotUserRoute>('http://localhost')
  type Get = (typeof vc.v)[':id']['$get']
  expectType<
    Equal<InferRequestType<Get>, { readonly param: { id: string } } & { readonly query: { page?: string | undefined } }>
  >()
  expectType<Equal<InferResponseType<Get, 200>, { id: string; age?: number | undefined }>>()
  // @ts-expect-error `id` is a string
  void vc.v[':id'].$get({ param: { id: 1 }, query: {} })
}

// ArkType: typed through `~standard.types` (its input).
const getArkUserRoute = createRoute({
  method: 'get',
  path: '/a/{id}',
  request: { params: type({ id: 'string' }), query: type({ 'page?': 'string' }) },
  responses: {
    200: { description: 'ok', content: { 'application/json': { schema: type({ id: 'string', age: 'number' }) } } },
  },
})

export async function arktype() {
  const ac = oc<typeof getArkUserRoute>('http://localhost')
  type Get = (typeof ac.a)[':id']['$get']
  expectType<Equal<InferRequestType<Get>, { readonly param: { id: string } } & { readonly query: { page?: string } }>>()
  expectType<Equal<InferResponseType<Get, 200>, { id: string; age: number }>>()
  // @ts-expect-error `id` is a string
  void ac.a[':id'].$get({ param: { id: 1 }, query: {} })
}

// Effect Schema, through `Schema.toStandardSchemaV1`: typed by the encoded side, what goes on the
// wire (`NumberFromString` takes a string, and a 200 body carries one).
const getEffectUserRoute = createRoute({
  method: 'get',
  path: '/e/{id}',
  request: { params: Schema.toStandardSchemaV1(Schema.Struct({ id: Schema.NumberFromString })) },
  responses: {
    200: {
      description: 'ok',
      content: {
        'application/json': {
          schema: Schema.toStandardSchemaV1(Schema.Struct({ id: Schema.NumberFromString, name: Schema.String })),
        },
      },
    },
  },
})

export async function effect() {
  const ec = oc<typeof getEffectUserRoute>('http://localhost')
  type Get = (typeof ec.e)[':id']['$get']
  expectType<Equal<InferRequestType<Get>, { readonly param: { readonly id: string } }>>()
  expectType<Equal<InferResponseType<Get, 200>, { readonly id: string; readonly name: string }>>()
  // @ts-expect-error the encoded `id` is a string
  void ec.e[':id'].$get({ param: { id: 1 } })
}

// Aliases: a function per operationId, typed as zodcall types one.
const aliasedRoutes = {
  get: createRoute({
    method: 'get',
    path: '/things/{thingId}',
    operationId: 'get-thing',
    request: { query: z.object({ verbose: z.string().optional() }) },
    responses: {
      200: {
        description: 'ok',
        content: { 'application/json': { schema: z.object({ at: z.string().transform((s) => new Date(s)) }) } },
      },
      404: { description: 'missing' },
    },
  }),
  create: createRoute({
    method: 'post',
    path: '/things',
    operationId: 'things.create',
    request: {
      headers: z.object({ 'x-request-id': z.string() }),
      body: { content: { 'application/json': { schema: z.object({ name: z.string() }) } } },
    },
    responses: {
      201: { description: 'ok', content: { 'application/json': { schema: z.object({ id: z.string() }) } } },
    },
  }),
  ping: createRoute({
    method: 'post',
    path: '/ping',
    operationId: 'ping',
    responses: { 204: { description: 'ok' } },
  }),
}

export async function aliases() {
  const ac = oc(aliasedRoutes, 'http://localhost')
  expectType<Equal<keyof typeof ac & ('getThing' | 'thingsCreate' | 'ping'), 'getThing' | 'thingsCreate' | 'ping'>>()
  // The output of the 200 body (its transform applied); a 404 throws.
  const thing = await ac.getThing({ params: { thingId: 't' } })
  expectType<Equal<typeof thing, { at: Date }>>()
  // The body first; the config required, as a header is.
  const created = await ac.thingsCreate({ name: 'n' }, { headers: { 'x-request-id': 'r' } })
  expectType<Equal<typeof created, { id: string }>>()
  // No body declared: `undefined` first; nothing required: no config.
  expectType<Equal<Awaited<ReturnType<typeof ac.ping>>, undefined>>()
  void ac.ping(undefined)
  // @ts-expect-error the path parameter is required
  void ac.getThing()
  // @ts-expect-error the header is required
  void ac.thingsCreate({ name: 'n' })
  // @ts-expect-error the body is { name: string }
  void ac.thingsCreate({ name: 1 }, { headers: { 'x-request-id': 'r' } })
  // The typed-only client has no aliases: it has no routes to call them with.
  // @ts-expect-error
  void oc<typeof aliasedRoutes>('http://localhost').getThing
}
