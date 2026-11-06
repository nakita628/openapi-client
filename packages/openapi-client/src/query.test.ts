import { describe, expect, expectTypeOf, it } from 'vite-plus/test'
import * as z from 'zod'

import { createRoute, oc } from './index.js'
import type { InferRequestType, InferResponseType } from './index.js'

const searchRoute = createRoute({
  method: 'query',
  path: '/search',
  operationId: 'search',
  request: {
    body: { required: true, content: { 'application/json': { schema: z.object({ q: z.string() }) } } },
  },
  responses: {
    200: { description: 'The hits', content: { 'application/json': { schema: z.array(z.string()) } } },
  },
})
const routes = { searchRoute }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/** A client whose `fetch` answers `body`, recording each request's method and body. */
function clientOf(body: unknown) {
  const sent: { method: string | undefined; body: unknown }[] = []
  const client = oc(routes, 'http://x', {
    fetch: (_url, init) => {
      sent.push({ method: init.method, body: init.body })
      return json(body)
    },
  })
  return { sent, client }
}

describe('the QUERY method', () => {
  it('is called by the chain, $query, with its body', async () => {
    const { sent, client } = clientOf(['a'])
    const res = await client.search.$query({ json: { q: 'a' } })
    expect(res.status).toBe(200)
    if (res.ok) expectTypeOf(await res.json()).toEqualTypeOf<string[]>()
    expect(sent).toStrictEqual([{ method: 'QUERY', body: '{"q":"a"}' }])
    expectTypeOf<InferRequestType<typeof client.search.$query>>().toEqualTypeOf<{ readonly json: { q: string } }>()
    expectTypeOf<InferResponseType<typeof client.search.$query, 200>>().toEqualTypeOf<string[]>()
  })

  it('is called by its alias, the body first', async () => {
    const { sent, client } = clientOf(['a'])
    expect(await client.search({ q: 'a' })).toStrictEqual(['a'])
    expect(sent).toStrictEqual([{ method: 'QUERY', body: '{"q":"a"}' }])
    expectTypeOf(client.search).parameter(0).toEqualTypeOf<{ q: string }>()
  })

  it('checks its body before sending it, and its response', async () => {
    const { sent, client } = clientOf([1])
    const invalid = await client.search.$query({ json: { q: 1 } as never })
    expect(invalid.status).toBe(422)
    expect(sent).toHaveLength(0)
    expect((await client.search.$query({ json: { q: 'a' } })).status).toBe(502)
  })
})
