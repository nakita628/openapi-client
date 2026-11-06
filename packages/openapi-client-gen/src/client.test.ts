/**
 * The generated client at run time: the Todo fixture's routes and client type, called against a
 * `fetch` that answers as the Todo API would, recording what it is sent.
 */

import { DetailedError, oc, parseResponse } from 'openapi-client'
import { describe, expect, it } from 'vite-plus/test'

import { routes } from './fixtures/todo.routes.js'
import type { Client } from './fixtures/todo.routes.js'

const todo = { id: '1', title: 'Write it', status: 'todo' }

const json = (status: number, value: unknown) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })

/** The Todo API, as far as the tests ask it; each request recorded. */
const api = () => {
  const sent: { url: string; init: RequestInit }[] = []
  const fetch = async (url: string, init: RequestInit) => {
    sent.push({ url, init })
    const { pathname } = new URL(url)
    if (init.method === 'GET' && pathname === '/todos') return json(200, [todo])
    if (init.method === 'POST' && pathname === '/todos') {
      const body = JSON.parse(typeof init.body === 'string' ? init.body : '{}')
      return body.title === '' ? json(400, { title: 'Bad', status: 400 }) : json(201, { ...todo, ...body })
    }
    if (init.method === 'GET' && pathname === '/todos/1') return json(200, todo)
    if (init.method === 'GET' && pathname.startsWith('/todos/')) return json(404, { title: 'Not found', status: 404 })
    if (init.method === 'DELETE') return new Response(null, { status: 204 })
    if (init.method === 'POST' && pathname === '/files') {
      return new Response(init.body instanceof FormData ? 'multipart' : 'other', {
        headers: { 'Content-Type': 'text/plain' },
      })
    }
    return json(500, {})
  }
  return { sent, client: oc<typeof routes, Client>(routes, 'http://api.test', { fetch }) }
}

describe('the generated client', () => {
  it('calls through the chain: the query, the headers, the path', async () => {
    const { sent, client } = api()
    const res = await client.todos.$get({ query: { limit: 10, status: 'done' }, header: { 'x-request-id': 'r1' } })
    expect(res.status).toBe(200)
    expect(await res.json()).toStrictEqual([todo])
    expect(sent[0]?.url).toBe('http://api.test/todos?limit=10&status=done')
    expect(new Headers(sent[0]?.init.headers).get('x-request-id')).toBe('r1')

    const one = await client.todos[':id'].$get({ param: { id: '1' } })
    expect(one.ok && (await one.json()).title).toBe('Write it')
    const missing = await client.todos[':id'].$get({ param: { id: '9' } })
    expect([missing.status, missing.ok]).toStrictEqual([404, false])
    expect((await client.todos[':id'].$delete({ param: { id: '1' } })).status).toBe(204)
  })

  it('calls by alias: the body answered, a declared error thrown', async () => {
    const { sent, client } = api()
    expect(await client.getTodo({ params: { id: '1' } })).toStrictEqual(todo)
    expect(await client.createTodo({ title: 'Ship it' })).toMatchObject({ title: 'Ship it' })
    expect(sent.at(-1)?.init.body).toBe('{"title":"Ship it"}')
    expect(new Headers(sent.at(-1)?.init.headers).get('content-type')).toBe('application/json')

    const error = await client.createTodo({ title: '' }).catch((thrown: unknown) => thrown)
    expect(error).toBeInstanceOf(DetailedError)
    expect(error).toMatchObject({ statusCode: 400, detail: { data: { title: 'Bad' } } })
    const notFound = await client.getTodo({ params: { id: '9' } }).catch((thrown: unknown) => thrown)
    expect(notFound instanceof DetailedError && notFound.statusCode).toBe(404)
  })

  it('sends a form as multipart, and reads a text body', async () => {
    const { client } = api()
    expect(await client.uploadFile({ file: new Blob(['hi']), name: 'a.txt' })).toBe('multipart')
  })

  it('answers $url and parseResponse', async () => {
    const { client } = api()
    expect(client.todos[':id'].$url({ param: { id: 'a b' } }).href).toBe('http://api.test/todos/a%20b')
    expect(await parseResponse(client.todos[':id'].$get({ param: { id: '1' } }))).toStrictEqual(todo)
  })
})
