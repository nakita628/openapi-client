/** Effect's schemas as they are, made Standard Schemas at run time by `createRoute()` from openapi-client/effect. */

import { Schema } from 'effect'
import { describe, expect, expectTypeOf, it } from 'vite-plus/test'

import { createRoute } from './effect.js'
import { DetailedError, oc, parseResponse } from './index.js'

const ItemSchema = Schema.Struct({ id: Schema.String, count: Schema.Number })

const getItemRoute = createRoute({
  method: 'get',
  path: '/items/{id}',
  operationId: 'getItem',
  // `FiniteFromString`: a string on the wire, a number once decoded.
  request: {
    params: Schema.Struct({ id: Schema.String }),
    query: Schema.Struct({ times: Schema.optional(Schema.FiniteFromString) }),
  },
  responses: {
    200: { description: 'The item', content: { 'application/json': { schema: ItemSchema } } },
  },
})

const routes = { getItemRoute }

/** A server answering what a test says, recording what it was sent. */
const server = (body: unknown) => {
  const sent: string[] = []
  const fetch = async (input: string) => {
    sent.push(input)
    return Response.json(body)
  }
  return { sent, fetch }
}

describe("createRoute() from 'openapi-client/effect'", () => {
  it("types the calls by Effect's schemas as they are: the encoded side sent, the body answered", async () => {
    const { fetch } = server({ id: 'a', count: 2 })
    const client = oc<typeof routes>('http://localhost', { fetch })
    type Args = NonNullable<Parameters<(typeof client)['items'][':id']['$get']>[0]>
    expectTypeOf<Args['param']>().toEqualTypeOf<{ readonly id: string }>()
    expectTypeOf<Args['query']>().toEqualTypeOf<{ readonly times?: string | undefined }>()
    const item = await parseResponse(client.items[':id'].$get({ param: { id: 'a' }, query: { times: '2' } }))
    expectTypeOf(item).toEqualTypeOf<{ readonly id: string; readonly count: number }>()
    expect(item).toEqual({ id: 'a', count: 2 })
  })

  it('checks the request and the response with them in oc(routes, url)', async () => {
    const { sent, fetch } = server({ id: 'a', count: 'two' })
    const client = oc(routes, 'http://localhost', { fetch })
    const bad = await client.items[':id'].$get({ param: { id: 'a' }, query: { times: 'x' } })
    expect(bad.status).toBe(422)
    expect(sent).toEqual([])
    const unmatched = await client.items[':id'].$get({ param: { id: 'a' }, query: {} })
    expect(unmatched.status).toBe(502)
    const error = await client.getItem({ params: { id: 'a' } }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(DetailedError)
  })
})
