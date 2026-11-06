/**
 * The routes written with a schema library (`schema: 'zod'`, ...): a client given them checks each
 * request before it is sent and each response before it is answered.
 */

import { oc } from 'openapi-client'
import { describe, expect, it } from 'vite-plus/test'

import * as arktype from './fixtures/todo.arktype.routes.js'
import * as valibot from './fixtures/todo.valibot.routes.js'
import * as zod from './fixtures/todo.zod.routes.js'

const todo = { id: '0b4e7f0e-6f3a-4c1e-9d6a-1f1e2d3c4b5a', title: 'Write it', status: 'todo' }

function json(status: number, value: unknown) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
}

const libraries = [
  ['zod', zod],
  ['valibot', valibot],
  ['arktype', arktype],
] as const

describe.each(libraries)('routes with %s schemas', (_, routes) => {
  function clientOf(answer: () => Response) {
    const sent: string[] = []
    async function fetch(url: string) {
      sent.push(url)
      return answer()
    }
    const client: zod.Client = oc(routes.routes, 'http://api.test', { fetch })
    return { sent, client }
  }

  it('sends a request that matches, and answers a response that matches', async () => {
    const { sent, client } = clientOf(() => json(200, todo))
    const res = await client.todos[':id'].$get({ param: { id: '1' } })
    expect(res.status).toBe(200)
    expect(await res.json()).toStrictEqual(todo)
    expect(sent).toStrictEqual(['http://api.test/todos/1'])
  })

  it('answers a request that does not match with a 422, without sending it', async () => {
    const { sent, client } = clientOf(() => json(201, todo))
    const res = await client.todos.$post({ json: { title: 1 } as never })
    expect(res.status).toBe(422)
    expect(sent).toStrictEqual([])
  })

  it('checks the query and headers as given, not as text', async () => {
    const { sent, client } = clientOf(() => json(200, [todo]))
    const ok = await client.todos.$get({ query: { limit: 10, status: 'done' }, header: { 'x-request-id': 'r1' } })
    expect(ok.status).toBe(200)
    const bad = await client.todos.$get({ query: { status: 'later' as never }, header: { 'x-request-id': 'r1' } })
    expect(bad.status).toBe(422)
    expect(sent).toHaveLength(1)
  })

  it('answers a response that does not match with a 502', async () => {
    const { client } = clientOf(() => json(200, { ...todo, id: 'not a uuid' }))
    const res = await client.todos[':id'].$get({ param: { id: '1' } })
    expect(res.status).toBe(502)
  })

  it('throws from an alias for a response that does not match', async () => {
    const { client } = clientOf(() => json(200, { ...todo, status: 'later' }))
    await expect(client.getTodo({ params: { id: '1' } })).rejects.toThrow()
  })

  it('sends a form with a file, typed as the schema checks it: a File, not any Blob', async () => {
    const { sent, client } = clientOf(() => new Response('stored', { headers: { 'Content-Type': 'text/plain' } }))
    const res = await client.files.$post({ form: { file: new File(['hi'], 'a.txt'), name: 'a.txt' } })
    expect(res.status).toBe(200)
    // @ts-expect-error a Blob is not a File
    const blob = await client.files.$post({ form: { file: new Blob(['hi']) } })
    expect(blob.status).toBe(422)
    expect(sent).toHaveLength(1)
  })
})
