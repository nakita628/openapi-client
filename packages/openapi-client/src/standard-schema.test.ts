/** The client with each library's Standard Schemas: typed by them, and checked with them. */

import { type } from 'arktype'
import { Schema } from 'effect'
import * as v from 'valibot'
import { describe, expect, it } from 'vite-plus/test'

import { serve } from './fixtures.js'
import { createRoute, oc, parseResponse } from './index.js'

describe('Valibot routes', () => {
  const User = v.object({ id: v.string(), name: v.pipe(v.string(), v.minLength(1)) })

  const getUserRoute = createRoute({
    method: 'get',
    path: '/users/{id}',
    request: { params: v.object({ id: v.string() }), query: v.object({ verbose: v.optional(v.picklist(['true'])) }) },
    responses: {
      200: { description: 'The user', content: { 'application/json': { schema: User } } },
      404: {
        description: 'No such user',
        content: { 'application/json': { schema: v.object({ message: v.string() }) } },
      },
    },
  })

  const createUserRoute = createRoute({
    method: 'post',
    path: '/users',
    request: { body: { content: { 'application/json': { schema: v.omit(User, ['id']) } } } },
    responses: { 201: { description: 'Created', content: { 'application/json': { schema: User } } } },
  })

  const routes = { getUserRoute, createUserRoute }

  const server = serve({
    'GET /users/{id}': ({ params }) =>
      params['id'] === 'missing'
        ? Response.json({ message: 'not found' }, { status: 404 })
        : Response.json({ id: params['id'], name: 'Ultra-man' }),
    'POST /users': async ({ request }) =>
      Response.json({ id: '1', ...((await request.json()) as object) }, { status: 201 }),
  })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

  const client = oc(routes, 'http://localhost', { fetch: server })

  it('serve the routes and type its client', async () => {
    const user = await parseResponse(client.users[':id'].$get({ param: { id: '1' }, query: {} }))
    expect(user).toEqual({ id: '1', name: 'Ultra-man' })
    const created = await client.users.$post({ json: { name: 'Zoffy' } })
    expect(created.status).toBe(201)
    if (created.status === 201) expect(await created.json()).toEqual({ id: '1', name: 'Zoffy' })
    const missing = await client.users[':id'].$get({ param: { id: 'missing' }, query: {} })
    if (missing.status === 404) expect((await missing.json()).message).toBe('not found')
  })

  it('check the request with Valibot: a 422 Problem Details, not sent', async () => {
    let sent = false
    const checked = oc(routes, 'http://localhost', {
      fetch: () => {
        sent = true
        return json({})
      },
    })
    const res = await checked.users.$post({ json: { name: '' } })
    expect(sent).toBe(false)
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({
      title: 'Unprocessable Content',
      errors: [{ in: 'body', path: 'name', message: 'Invalid length: Expected >=1 but received 0' }],
    })
    const query = await checked.users[':id'].$get({ param: { id: '1' }, query: { verbose: 'false' as never } })
    expect(await query.json()).toMatchObject({ errors: [{ in: 'query', path: 'verbose' }] })
  })

  it('check the response with Valibot: a 502 Problem Details', async () => {
    const checked = oc(routes, 'http://localhost', { fetch: () => json({ id: 1, name: 'x' }) })
    const res = await checked.users[':id'].$get({ param: { id: '1' }, query: {} })
    expect(res.status).toBe(502)
    expect(await res.json()).toMatchObject({ title: 'Bad Gateway', errors: [{ in: 'body', path: 'id' }] })
  })
})

describe('ArkType routes', () => {
  const User = type({ id: 'string', name: 'string > 0' })

  const getUserRoute = createRoute({
    method: 'get',
    path: '/users/{id}',
    request: { params: type({ id: 'string' }) },
    responses: {
      200: { description: 'The user', content: { 'application/json': { schema: User } } },
      404: { description: 'No such user', content: { 'application/json': { schema: type({ message: 'string' }) } } },
    },
  })

  const createUserRoute = createRoute({
    method: 'post',
    path: '/users',
    request: { body: { content: { 'application/json': { schema: User.omit('id') } } } },
    responses: { 201: { description: 'Created', content: { 'application/json': { schema: User } } } },
  })

  const routes = { getUserRoute, createUserRoute }

  const server = serve({
    'GET /users/{id}': ({ params }) =>
      params['id'] === 'missing'
        ? Response.json({ message: 'not found' }, { status: 404 })
        : Response.json({ id: params['id'], name: 'Ultra-man' }),
    'POST /users': async ({ request }) =>
      Response.json({ id: '1', ...((await request.json()) as object) }, { status: 201 }),
  })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

  const client = oc(routes, 'http://localhost', { fetch: server })

  it('serve the routes and type its client', async () => {
    expect(await parseResponse(client.users[':id'].$get({ param: { id: '1' } }))).toEqual({
      id: '1',
      name: 'Ultra-man',
    })
    const created = await client.users.$post({ json: { name: 'Zoffy' } })
    if (created.status === 201) expect(await created.json()).toEqual({ id: '1', name: 'Zoffy' })
    else expect.unreachable()
  })

  it('check the request with ArkType: a 422 Problem Details, not sent', async () => {
    let sent = false
    const checked = oc(routes, 'http://localhost', {
      fetch: () => {
        sent = true
        return json({})
      },
    })
    const res = await checked.users.$post({ json: { name: '' } })
    expect(sent).toBe(false)
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ title: 'Unprocessable Content', errors: [{ in: 'body', path: 'name' }] })
  })

  it('check the response with ArkType: a 502 Problem Details', async () => {
    const checked = oc(routes, 'http://localhost', { fetch: () => json({ id: 1, name: 'x' }) })
    const res = await checked.users[':id'].$get({ param: { id: '1' } })
    expect(res.status).toBe(502)
    expect(await res.json()).toMatchObject({ title: 'Bad Gateway', errors: [{ in: 'body', path: 'id' }] })
  })
})

describe('Effect Schema routes', () => {
  // Effect's schemas become Standard Schemas through `Schema.toStandardSchemaV1`.
  const standard = Schema.toStandardSchemaV1

  const UserFields = { id: Schema.String, name: Schema.NonEmptyString }

  const getUserRoute = createRoute({
    method: 'get',
    path: '/users/{id}',
    request: { params: standard(Schema.Struct({ id: Schema.String })) },
    responses: {
      200: {
        description: 'The user',
        content: { 'application/json': { schema: standard(Schema.Struct(UserFields)) } },
      },
      404: {
        description: 'No such user',
        content: { 'application/json': { schema: standard(Schema.Struct({ message: Schema.String })) } },
      },
    },
  })

  const createUserRoute = createRoute({
    method: 'post',
    path: '/users',
    request: {
      body: { content: { 'application/json': { schema: standard(Schema.Struct({ name: UserFields.name })) } } },
    },
    responses: {
      201: { description: 'Created', content: { 'application/json': { schema: standard(Schema.Struct(UserFields)) } } },
    },
  })

  const routes = { getUserRoute, createUserRoute }

  const server = serve({
    'GET /users/{id}': ({ params }) =>
      params['id'] === 'missing'
        ? Response.json({ message: 'not found' }, { status: 404 })
        : Response.json({ id: params['id'], name: 'Ultra-man' }),
    'POST /users': async ({ request }) =>
      Response.json({ id: '1', ...((await request.json()) as object) }, { status: 201 }),
  })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

  const client = oc(routes, 'http://localhost', { fetch: server })

  it('serve the routes and type its client', async () => {
    expect(await parseResponse(client.users[':id'].$get({ param: { id: '1' } }))).toEqual({
      id: '1',
      name: 'Ultra-man',
    })
    const created = await client.users.$post({ json: { name: 'Zoffy' } })
    if (created.status === 201) expect(await created.json()).toEqual({ id: '1', name: 'Zoffy' })
    else expect.unreachable()
  })

  it('check the request with Effect: a 422 Problem Details, not sent', async () => {
    let sent = false
    const checked = oc(routes, 'http://localhost', {
      fetch: () => {
        sent = true
        return json({})
      },
    })
    const res = await checked.users.$post({ json: { name: '' } })
    expect(sent).toBe(false)
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ title: 'Unprocessable Content', errors: [{ in: 'body', path: 'name' }] })
  })

  it('check the response with Effect: a 502 Problem Details', async () => {
    const checked = oc(routes, 'http://localhost', { fetch: () => json({ id: 1, name: 'x' }) })
    const res = await checked.users[':id'].$get({ param: { id: '1' } })
    expect(res.status).toBe(502)
    expect(await res.json()).toMatchObject({ title: 'Bad Gateway', errors: [{ in: 'body', path: 'id' }] })
  })
})
