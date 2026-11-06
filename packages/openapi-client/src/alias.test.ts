import { describe, expect, it } from 'vite-plus/test'
import * as z from 'zod'

import { aliasOf } from './utils/alias.js'
import * as routes from './fixtures.js'
import { server } from './fixtures.js'
import { createRoute, DetailedError, oc } from './index.js'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('aliasOf: as zodcall names an alias', () => {
  it('joins the words of an operationId', () => {
    expect(aliasOf('getUser')).toBe('getUser')
    expect(aliasOf('list-pets')).toBe('listPets')
    expect(aliasOf('pets.list')).toBe('petsList')
    expect(aliasOf('get /users/{id}')).toBe('getUsersId')
    expect(aliasOf('2fa_setup')).toBe('_2fa_setup')
  })
})

const getUserRoute = createRoute({
  method: 'get',
  path: '/users/{id}',
  operationId: 'get-user',
  request: { params: z.object({ id: z.string() }), query: z.object({ fields: z.string().optional() }) },
  responses: {
    200: {
      description: 'ok',
      content: {
        'application/json': {
          schema: z.object({ id: z.string(), joined: z.string().transform((s) => new Date(s)) }),
        },
      },
    },
    404: { description: 'missing', content: { 'application/json': { schema: z.object({ message: z.string() }) } } },
  },
})

const createUserRoute = createRoute({
  method: 'post',
  path: '/users',
  operationId: 'createUser',
  request: {
    headers: z.object({ 'x-request-id': z.string() }),
    body: { content: { 'application/json': { schema: z.object({ name: z.string().min(1) }) } } },
  },
  responses: { 201: { description: 'ok', content: { 'application/json': { schema: z.object({ id: z.string() }) } } } },
})

const loginRoute = createRoute({
  method: 'post',
  path: '/login',
  operationId: 'login',
  request: {
    body: { content: { 'application/x-www-form-urlencoded': { schema: z.object({ user: z.string() }) } } },
  },
  responses: { 204: { description: 'ok' } },
})

const patchRoute = createRoute({
  method: 'patch',
  path: '/users/{id}',
  operationId: 'patchUser',
  request: { body: { content: { 'application/merge-patch+json': { schema: z.object({ name: z.string() }) } } } },
  responses: { 204: { description: 'ok' } },
})

const aliased = { getUserRoute, createUserRoute, loginRoute, patchRoute }

describe('an alias: called as zodcall calls one', () => {
  it('takes params / queries / headers, and answers the success body as the schema outputs it', async () => {
    let url = ''
    const client = oc(aliased, 'http://x', {
      fetch: (input) => {
        url = input
        return json({ id: '1', joined: '2026-01-02T00:00:00.000Z' })
      },
    })
    const user = await client.getUser({ params: { id: '1' }, queries: { fields: 'name' } })
    expect(url).toBe('http://x/users/1?fields=name')
    expect(user).toEqual({ id: '1', joined: new Date('2026-01-02T00:00:00.000Z') })
  })

  it('takes the body first for a body method', async () => {
    let request: { init: RequestInit; url: string } | undefined
    const client = oc(aliased, 'http://x', {
      fetch: (url, init) => {
        request = { url, init }
        return json({ id: '7' }, 201)
      },
    })
    expect(await client.createUser({ name: 'alice' }, { headers: { 'x-request-id': 'r' } })).toEqual({ id: '7' })
    expect(request?.init.method).toBe('POST')
    expect(request?.init.body).toBe('{"name":"alice"}')
    expect(new Headers(request?.init.headers).get('x-request-id')).toBe('r')
  })

  it('throws a DetailedError for a response that is not ok, and for one that does not match', async () => {
    const missing = oc(aliased, 'http://x', { fetch: () => json({ message: 'no' }, 404) })
    await expect(missing.getUser({ params: { id: '1' } })).rejects.toMatchObject({
      statusCode: 404,
      detail: { data: { message: 'no' } },
    })
    const wrong = oc(aliased, 'http://x', { fetch: () => json({ id: 1 }) })
    const error = await wrong.getUser({ params: { id: '1' } }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(DetailedError)
    expect(error).toMatchObject({ statusCode: 502, detail: { data: { title: 'Bad Gateway' } } })
  })

  it('throws the 422 of a request that does not match, without sending it', async () => {
    let sent = false
    const client = oc(aliased, 'http://x', {
      fetch: () => {
        sent = true
        return json({ id: '1' }, 201)
      },
    })
    const error = await client.createUser({ name: '' }, { headers: { 'x-request-id': 'r' } }).catch((e: unknown) => e)
    expect(sent).toBe(false)
    expect(error).toMatchObject({ statusCode: 422, detail: { data: { errors: [{ in: 'body', path: 'name' }] } } })
  })

  it('sends a form as the route declares it, and JSON with its declared media type', async () => {
    const sent: RequestInit[] = []
    const client = oc(aliased, 'http://x', {
      fetch: (_url, init) => {
        sent.push(init)
        return new Response(null, { status: 204 })
      },
    })
    await client.login({ user: 'u' })
    expect(sent[0]?.body).toBeInstanceOf(URLSearchParams)
    expect((sent[0]!.body as URLSearchParams).toString()).toBe('user=u')
    await client.patchUser({ name: 'n' }, { params: { id: '1' } })
    expect(new Headers(sent[1]?.headers).get('content-type')).toBe('application/merge-patch+json')
  })

  it('checks every call: no option leaves the checks out', async () => {
    const client = oc(aliased, 'http://x', { fetch: () => json({ id: 1, joined: 'x' }) })
    await expect(client.getUser({ params: { id: '1' } })).rejects.toMatchObject({ statusCode: 502 })
    // @ts-expect-error there is no `validate` option
    void oc(aliased, 'http://x', { validate: false })
  })

  it('aborts after timeout', async () => {
    const client = oc(aliased, 'http://x', {
      fetch: (_url, init) =>
        new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(init.signal?.reason))),
    })
    await expect(client.getUser({ params: { id: '1' }, timeout: 5 })).rejects.toThrow()
  })

  it('works with a server, next to the path chain', async () => {
    const client = oc(routes, 'http://localhost', {
      fetch: server,
    })
    expect((await client.users[':id'].$get({ param: { id: '1' } })).status).toBe(200)
  })

  it('is both, when it is a path segment too: called the alias, its properties the chain', async () => {
    const client = oc(aliased, 'http://x', { fetch: () => new Response(null, { status: 204 }) })
    expect(await client.login({ user: 'u' })).toBeUndefined()
    expect((await client.login.$post({ form: { user: 'u' } })).status).toBe(204)
  })

  it('throws for two routes of one alias', () => {
    const a = createRoute({
      method: 'get',
      path: '/a',
      operationId: 'list-a',
      responses: { 200: { description: 'ok' } },
    })
    const b = createRoute({
      method: 'get',
      path: '/b',
      operationId: 'list.a',
      responses: { 200: { description: 'ok' } },
    })
    expect(() => oc([a, b], 'http://x')).toThrow('The alias "listA" is both GET /a\'s and GET /b\'s')
  })
})

describe('what an alias throws', () => {
  const conflictRoute = createRoute({
    method: 'post',
    path: '/accounts',
    operationId: 'createAccount',
    request: { body: { content: { 'application/json': { schema: z.object({ name: z.string().min(1) }) } } } },
    responses: {
      201: { description: 'ok', content: { 'application/json': { schema: z.object({ id: z.string() }) } } },
      409: { description: 'taken', content: { 'application/json': { schema: z.object({ message: z.string() }) } } },
    },
  })
  const accounts = { conflictRoute }
  function caught(promise: Promise<unknown>) {
    return promise.then(
      () => undefined,
      (error: unknown) => error,
    )
  }

  it('fills a missing status text from the status', async () => {
    const client = oc(accounts, 'http://x', { fetch: () => json({ message: 'taken' }, 409) })
    expect(await caught(client.createAccount({ name: 'a' }))).toMatchObject({
      message: '409 Conflict',
      detail: { statusText: 'Conflict' },
    })
  })

  it('throws a DetailedError for a request that got no response: NETWORK, TIMEOUT', async () => {
    const down = oc(accounts, 'http://x', {
      fetch: () => {
        throw new TypeError('fetch failed')
      },
    })
    const network = await caught(down.createAccount({ name: 'a' }))
    expect(network).toBeInstanceOf(DetailedError)
    expect(network).toMatchObject({ code: 'NETWORK', statusCode: undefined, cause: new TypeError('fetch failed') })
    const slow = oc(accounts, 'http://x', {
      fetch: (_url, init) =>
        new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(init.signal?.reason))),
    })
    expect(await caught(slow.createAccount({ name: 'a' }, { timeout: 5 }))).toMatchObject({ code: 'TIMEOUT' })
  })

  it("throws a DetailedError with the status and the body: a declared one, or the checks' 422 / 502", async () => {
    const taken = await caught(
      oc(accounts, 'http://x', { fetch: () => json({ message: 'taken' }, 409) }).createAccount({ name: 'a' }),
    )
    expect(taken).toBeInstanceOf(DetailedError)
    expect(taken).toMatchObject({ statusCode: 409, detail: { data: { message: 'taken' } }, alias: 'createAccount' })
    const invalid = await caught(oc(accounts, 'http://x', { fetch: () => json({}, 201) }).createAccount({ name: '' }))
    expect(invalid).toMatchObject({ statusCode: 422, detail: { data: { status: 422 } } })
  })
})
