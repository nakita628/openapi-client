import { describe, expect, it } from 'vite-plus/test'

import * as routes from './fixtures.js'
import { server } from './fixtures.js'
import { DetailedError, oc, parseResponse } from './index.js'

const client = oc<typeof routes>('http://localhost', { fetch: server })

describe('oc', () => {
  it('reads `/` as `index`', async () => {
    const res = await client.index.$get()
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('takibi🔥')
  })

  it('sends path params, encoded', async () => {
    const res = await client.users[':id'].$get({ param: { id: 'a b' } })
    expect(res.ok).toBe(true)
    if (res.ok) expect(await res.json()).toEqual({ id: 'a b', name: 'anonymous' })
  })

  it('sends several path params', async () => {
    const res = await client.users[':userId'].posts[':postId'].$get({ param: { userId: '1', postId: 2 } })
    expect(await res.json()).toEqual({ userId: '1', postId: '2' })
  })

  it('narrows by status', async () => {
    const res = await client.users[':id'].$get({ param: { id: 'missing' } })
    expect(res.status).toBe(404)
    if (res.status === 404) expect((await res.json()).message).toBe('not found')
  })

  it('repeats a query key for an array and leaves undefined out', async () => {
    const res = await client.users.$get({ query: { page: undefined, tag: ['a', 'b'] } })
    expect(await res.json()).toEqual([{ id: 'a,b', name: '?tag=a&tag=b' }])
  })

  it('sends json with its content type, and headers', async () => {
    const res = await client.users.$post({ header: { 'x-request-id': 'r1' }, json: { name: 'Ultra-man' } })
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ id: 'r1', name: 'Ultra-man' })
  })

  it('sends cookies', async () => {
    expect((await client.users[':id'].$delete({ param: { id: '1' }, cookie: { session: 'ok' } })).status).toBe(204)
    expect((await client.users[':id'].$delete({ param: { id: '1' }, cookie: { session: 'no' } })).status).toBe(401)
  })

  it('merges the options of a call over those of oc', async () => {
    const authed = oc<typeof routes>('http://localhost', {
      fetch: server,
      headers: () => ({ authorization: 'from-oc' }),
    })
    expect(await (await authed.users[':id'].$get({ param: { id: '1' } })).json()).toMatchObject({ name: 'from-oc' })
    const res = await authed.users[':id'].$get({ param: { id: '1' } }, { headers: { authorization: 'from-call' } })
    expect(await res.json()).toMatchObject({ name: 'from-call' })
  })

  it("passes fetch's options as fetch takes them, a call's over the client's", async () => {
    let sent: RequestInit | undefined
    const client = oc<typeof routes>('http://localhost', {
      fetch: (_input, init) => {
        sent = init
        return new Response(null, { status: 204 })
      },
      credentials: 'include',
      cache: 'no-cache',
      headers: new Headers({ 'x-client': 'oc', 'x-both': 'oc' }),
    })
    const controller = new AbortController()
    await client.users[':id'].$get(
      { param: { id: '1' } },
      { signal: controller.signal, cache: 'no-store', headers: [['x-both', 'call']] },
    )
    expect(sent).toMatchObject({ method: 'GET', credentials: 'include', cache: 'no-store', signal: controller.signal })
    expect(Object.fromEntries(new Headers(sent?.headers))).toStrictEqual({ 'x-client': 'oc', 'x-both': 'call' })
    // The client's own options are not `fetch`'s.
    expect(sent).not.toHaveProperty('fetch')
    expect(sent).not.toHaveProperty('buildSearchParams')
  })

  it('sends the headers given over those the call writes', async () => {
    let sent: RequestInit | undefined
    const client = oc<typeof routes>('http://localhost', {
      fetch: (_input, init) => {
        sent = init
        return new Response(null, { status: 204 })
      },
    })
    await client.users.$post(
      { header: { 'x-request-id': 'from-args' }, json: { name: 'n' } },
      { headers: { 'content-type': 'application/vnd.api+json', 'x-request-id': 'from-options' } },
    )
    expect(new Headers(sent?.headers).get('content-type')).toBe('application/vnd.api+json')
    expect(new Headers(sent?.headers).get('x-request-id')).toBe('from-options')
  })

  it('joins the base URL and sends form data', async () => {
    let request: { input: string; init: RequestInit } | undefined
    const formClient = oc<typeof routes>('http://localhost/api/', {
      fetch: (input, init) => {
        request = { input, init }
        return new Response(null, { status: 204 })
      },
    })
    const file = new Blob(['hi'], { type: 'text/plain' })
    await formClient.upload.$post({ form: { file, tags: ['a', 'b'] } })
    expect(request?.input).toBe('http://localhost/api/upload')
    expect(request?.init.method).toBe('POST')
    const form = request?.init.body as FormData
    expect(form.getAll('tags')).toEqual(['a', 'b'])
    expect(form.get('file')).toBeInstanceOf(Blob)
  })

  it('answers $url() and $path()', () => {
    const base = oc<typeof routes>('http://localhost:8787/api/')
    expect(base.users[':id'].$url({ param: { id: '1' } }).href).toBe('http://localhost:8787/api/users/1')
    expect(base.users.$path({ query: { page: '2', tag: ['a', 'b'] } })).toBe('/users?page=2&tag=a&tag=b')
    expect(base.index.$url().href).toBe('http://localhost:8787/api/')
    expect(oc<typeof routes>('http://localhost').index.$path()).toBe('/')
  })

  it('is not a thenable', async () => {
    expect(await Promise.resolve(client)).toBe(client)
  })
})

describe('parseResponse', () => {
  it('answers the parsed body of an ok response', async () => {
    expect(await parseResponse(client.users[':id'].$get({ param: { id: '1' } }))).toEqual({
      id: '1',
      name: 'anonymous',
    })
    expect(await parseResponse(client.index.$get())).toBe('takibi🔥')
    expect(
      await parseResponse(client.users[':id'].$delete({ param: { id: '1' }, cookie: { session: 'ok' } })),
    ).toBeUndefined()
  })

  it('throws a DetailedError with the body otherwise', async () => {
    const error = await parseResponse(client.users[':id'].$get({ param: { id: 'missing' } })).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(DetailedError)
    expect(error).toMatchObject({ statusCode: 404, detail: { data: { message: 'not found' } } })
  })
})
