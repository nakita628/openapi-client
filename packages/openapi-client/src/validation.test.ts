import { describe, expect, it } from 'vite-plus/test'

import * as routes from './fixtures.js'
import { server } from './fixtures.js'
import * as z from 'zod'

import { createRoute, DetailedError, oc, parseResponse, schema } from './index.js'
import type { RouteSchema } from './index.js'

/** A fetch that records what it was asked, and answers `respond()`. */
function stub(respond: () => Response) {
  const calls: { input: string; init: RequestInit }[] = []
  function fetch(input: string, init: RequestInit) {
    calls.push({ input, init })
    return respond()
  }
  return { calls, fetch }
}

function json(body: unknown, status = 200, type = 'application/json') {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': type } })
}

describe('oc(routes, url): the request', () => {
  const client = oc(routes, 'http://localhost', { fetch: server })

  it('sends a request that matches, and passes the answer through', async () => {
    const res = await client.users.$post({ header: { 'x-request-id': 'r1' }, json: { name: 'Ultra-man' } })
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ id: 'r1', name: 'Ultra-man' })
  })

  it('answers a request that does not match with a 422 Problem Details, without sending it', async () => {
    const { calls, fetch } = stub(() => json({}))
    const checked = oc(routes, 'http://localhost/api', { fetch })
    const res = await checked.users.$post({ header: { 'x-request-id': 'r' }, json: { name: 1 } as never })
    expect(calls).toHaveLength(0)
    expect(res.status).toBe(422)
    expect(res.ok).toBe(false)
    expect(res.headers.get('content-type')).toBe('application/problem+json')
    expect(await res.json()).toEqual({
      type: 'about:blank',
      title: 'Unprocessable Content',
      status: 422,
      detail: 'Invalid body.',
      instance: '/users',
      errors: [{ in: 'body', path: 'name', message: 'Invalid input: expected string, received number' }],
    })
  })

  it('reports every part that does not match, and a missing body', async () => {
    const res = await client.users.$post({ header: {} as never } as never)
    expect(res.status).toBe(422)
    if (res.status !== 422) return
    const body = await res.json()
    expect(body.detail).toBe('Invalid headers, body.')
    expect(body.errors.map((e) => `${e.in}:${e.path}`)).toEqual(['header:x-request-id', 'body:'])
  })

  it('checks path parameters and cookies', async () => {
    const res = await client.users[':id'].$delete({ param: { id: '1' }, cookie: {} as never })
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ errors: [{ in: 'cookie', path: 'session' }], instance: '/users/1' })
  })
})

describe('oc(routes, url): the response', () => {
  it('answers a body that does not match the declared schema with a 502 Problem Details', async () => {
    const checked = oc(routes, 'http://localhost', { fetch: () => json({ id: 1, name: 'x' }) })
    const res = await checked.users[':id'].$get({ param: { id: '1' } })
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({
      type: 'about:blank',
      title: 'Bad Gateway',
      status: 502,
      detail: 'The response does not match the route: invalid body.',
      instance: '/users/1',
      errors: [{ in: 'body', path: 'id', message: 'Invalid input: expected string, received number' }],
    })
  })

  it('checks the schema of the status the response has', async () => {
    const checked = oc(routes, 'http://localhost', { fetch: () => json({ nope: true }, 404) })
    const res = await checked.users[':id'].$get({ param: { id: '1' } })
    expect(res.status).toBe(502)
    expect(await res.json()).toMatchObject({ detail: 'The response does not match the route: invalid body.' })
  })

  it('answers a declared JSON response that is not JSON with a 502', async () => {
    const checked = oc(routes, 'http://localhost', { fetch: () => new Response('hi', { status: 200 }) })
    const res = await checked.users[':id'].$get({ param: { id: '1' } })
    expect(res.status).toBe(502)
    expect(await res.json()).toMatchObject({
      errors: [{ in: 'body', path: '', message: expect.stringContaining('JSON') }],
    })
  })

  it('passes a matching response through untouched, its body still readable', async () => {
    const checked = oc(routes, 'http://localhost', { fetch: () => json({ id: '1', name: 'x' }) })
    const res = await checked.users[':id'].$get({ param: { id: '1' } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: '1', name: 'x' })
  })

  it('passes a status the operation does not declare through', async () => {
    const checked = oc(routes, 'http://localhost', { fetch: () => json({ anything: true }, 500) })
    const res = await checked.users[':id'].$get({ param: { id: '1' } })
    expect(res.status).toBe(500)
  })

  it('reads a range and default when the status has no entry of its own', async () => {
    const ranged = createRoute({
      method: 'get',
      path: '/ranged',
      responses: {
        '2XX': { description: 'ok', content: { 'application/json': { schema: z.object({ ok: z.literal(true) }) } } },
        default: {
          description: 'error',
          content: { 'application/json': { schema: z.object({ message: z.string() }) } },
        },
      },
    })
    const fail = await oc(ranged, 'http://x', { fetch: () => json({ ok: false }, 202) }).ranged.$get()
    expect(fail.status).toBe(502)
    const pass = await oc(ranged, 'http://x', { fetch: () => json({ message: 'm' }, 503) }).ranged.$get()
    expect(pass.status).toBe(503)
    const bad = await oc(ranged, 'http://x', { fetch: () => json({}, 503) }).ranged.$get()
    expect(bad.status).toBe(502)
  })

  it('makes parseResponse throw the problem', async () => {
    const checked = oc(routes, 'http://localhost', { fetch: () => json({ id: 1 }) })
    const error = await parseResponse(checked.users[':id'].$get({ param: { id: '1' } })).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(DetailedError)
    expect(error).toMatchObject({ statusCode: 502, detail: { data: { title: 'Bad Gateway' } } })
  })
})

describe('schema<T>(): a TypeScript type', () => {
  type User = { id: string; name: string }
  const getUserRoute = createRoute({
    method: 'get',
    path: '/users/{id}',
    request: { params: schema<{ id: string }>() },
    responses: { 200: { description: 'ok', content: { 'application/json': { schema: schema<User>() } } } },
  })

  it('types the part and checks nothing, whatever the request and response', async () => {
    const { calls, fetch } = stub(() => json({ not: 'a user' }))
    const checked = oc(getUserRoute, 'http://localhost', { fetch })
    const res = await checked.users[':id'].$get({ param: { id: 1 } as never })
    expect(calls).toHaveLength(1)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ not: 'a user' })
  })
})

describe('oc<typeof routes>(url)', () => {
  it('checks nothing', async () => {
    const { calls, fetch } = stub(() => json({ id: 1 }))
    const typed = oc<typeof routes>('http://localhost', { fetch })
    const res = await typed.users.$post({ header: { 'x-request-id': 'r' }, json: { name: 1 } as never })
    expect(calls).toHaveLength(1)
    expect(res.status).toBe(200)
  })
})

describe('oc(routes, url): the response headers', () => {
  function routeWith(headers: RouteSchema | Record<string, unknown>) {
    return createRoute({
      method: 'get',
      path: '/h',
      responses: { 200: { description: 'ok', headers } },
    })
  }
  function answer(headers: Record<string, string>) {
    return () => new Response(null, { status: 200, headers })
  }

  it('checks an object schema, reading the names case-insensitively', async () => {
    const route = routeWith(z.object({ 'X-Rate-Limit': z.string().regex(/^\d+$/) }))
    expect((await oc(route, 'http://x', { fetch: answer({ 'x-rate-limit': '10' }) }).h.$get()).status).toBe(200)
    const bad = await oc(route, 'http://x', { fetch: answer({ 'x-rate-limit': 'many' }) }).h.$get()
    expect(bad.status).toBe(502)
    expect(await bad.json()).toMatchObject({
      detail: 'The response does not match the route: invalid headers.',
      errors: [{ in: 'header', path: 'X-Rate-Limit' }],
    })
    const missing = await oc(route, 'http://x', { fetch: answer({}) }).h.$get()
    expect(missing.status).toBe(502)
  })

  it('checks a Headers Object: each header against its schema, a required one present', async () => {
    const route = routeWith({ 'x-id': { required: true, schema: z.uuid() }, 'x-note': { schema: z.string().min(2) } })
    const ok = await oc(route, 'http://x', { fetch: answer({ 'x-id': crypto.randomUUID() }) }).h.$get()
    expect(ok.status).toBe(200)
    const bad = await oc(route, 'http://x', { fetch: answer({ 'x-note': 'a' }) }).h.$get()
    expect(await bad.json()).toMatchObject({
      errors: [
        { in: 'header', path: 'x-id', message: 'Required' },
        { in: 'header', path: 'x-note' },
      ],
    })
  })
})

describe('oc(routes, url): the checked response, its body read again', () => {
  const user = { id: '1', name: 'Ultra-man' }
  function answered() {
    const res = json(user)
    Object.defineProperty(res, 'url', { value: 'http://localhost/users/1' })
    return res
  }
  function get() {
    return oc(routes, 'http://localhost', { fetch: answered }).users[':id'].$get({ param: { id: '1' } })
  }

  it('is the response fetch answered: a Response, its url kept', async () => {
    const res = await get()
    expect(res).toBeInstanceOf(Response)
    expect(res.url).toBe('http://localhost/users/1')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/json')
  })

  it('answers json() once, as a body is read once', async () => {
    const res = await get()
    expect(res.bodyUsed).toBe(false)
    expect(await res.json()).toEqual(user)
    expect(res.bodyUsed).toBe(true)
    await expect(res.json()).rejects.toThrow(TypeError)
    await expect(res.text()).rejects.toThrow(TypeError)
  })

  it('reads its body with the other readers as well', async () => {
    expect(await (await get()).text()).toBe(JSON.stringify(user))
    expect(JSON.parse(new TextDecoder().decode(await (await get()).arrayBuffer()))).toEqual(user)
    expect(await (await get()).blob()).toBeInstanceOf(Blob)
    const res = await get()
    expect(await new Response(res.body).json()).toEqual(user)
    expect(res.bodyUsed).toBe(true)
  })

  it('clones, the clone readable as the response is', async () => {
    const res = await get()
    expect(await res.clone().json()).toEqual(user)
    expect(await res.json()).toEqual(user)
    expect(() => res.clone()).toThrow(TypeError)
  })

  it('answers json() of a body that is not JSON with its error', async () => {
    const checked = oc(routes, 'http://localhost', {
      fetch: () => new Response('{', { headers: { 'Content-Type': 'application/json' } }),
    })
    const res = await checked.users[':id'].$get({ param: { id: '1' } })
    expect(res.status).toBe(502)
  })

  it('answers a response that is not a Response with a Response of its body', async () => {
    const fake = {
      status: 200,
      statusText: 'OK',
      ok: true,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      body: {},
      text: async () => JSON.stringify(user),
    }
    const checked = oc(routes, 'http://localhost', { fetch: () => fake as unknown as Response })
    const res = await checked.users[':id'].$get({ param: { id: '1' } })
    expect(res).toBeInstanceOf(Response)
    expect(await res.json()).toEqual(user)
  })
})
