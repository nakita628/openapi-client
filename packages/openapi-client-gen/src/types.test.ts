/**
 * Type-level expectations on the generated fixture, checked by compiling this file (`vp check`):
 * the routes openapi-client-gen writes type the client's calls as their document says. Nothing here runs.
 */

import { oc } from 'openapi-client'
import type { Client, InferRequestType, InferResponseType } from 'openapi-client'

import type { Client as EdgeAliasesClient, routes as edgeAliasesRoutes } from './fixtures/edge.aliases.routes.js'
import type { Client as EdgeClient, routes as edgeRoutes } from './fixtures/edge.routes.js'
import { client as writtenClient } from './fixtures/todo.client.js'
import { routes } from './fixtures/todo.routes.js'
import type { Client as WrittenClient } from './fixtures/todo.routes.js'

// The Todo document's schemas, as the routes file declares them (it exports `routes` and `Client` alone).
type Status = 'todo' | 'doing' | 'done'
type Todo = {
  id: string
  title: string
  status: Status
  due?: string | null
  tags?: string[]
  meta?: { [key: string]: number }
  assignee?: User | Team
}
type NewTodo = { title: string } & { status?: Status }
type User = { kind: 'user'; name: string }
type Team = { kind: 'team'; members: User[] }
type Tree = { value: number; children: Tree[] }
type Problem = { title: string; status: number; detail?: string }

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
function expectType<T extends true>(): T | undefined {
  return undefined
}

const client = oc<typeof routes>('http://localhost')

export async function chain() {
  const res = await client.todos.$get({ query: { limit: 10, status: 'done' }, header: { 'x-request-id': 'r1' } })
  // `default` stands for any status, 2XX ones too: the status narrows it.
  if (res.status === 200) expectType<Equal<Awaited<ReturnType<typeof res.json>>, Todo[] | Problem>>()
  if (!res.ok) expectType<Equal<Awaited<ReturnType<typeof res.json>>, Problem>>()
  const todo = await client.todos[':id'].$get({ param: { id: '1' } })
  if (todo.ok) expectType<Equal<Awaited<ReturnType<typeof todo.json>>, Todo>>()
  else expectType<Equal<Awaited<ReturnType<typeof todo.json>>, Problem>>()

  // @ts-expect-error the header is required
  void client.todos.$get({ query: {} })
  // @ts-expect-error not a status
  void client.todos.$get({ query: { status: 'later' }, header: { 'x-request-id': 'r1' } })

  void client.todos.$post({ json: { title: 'Write it' } })
  // @ts-expect-error the title is required
  void client.todos.$post({ json: { status: 'todo' } })

  void client.todos[':id'].$get({ param: { id: '1' } })
  void client.todos[':id'].$delete({ param: { id: '1' } })
  void client.files.$post({ form: { file: new Blob(['x']) } })
  void client.tree.$get({ cookie: {} })

  expectType<Equal<InferRequestType<typeof client.todos.$post>['json'], NewTodo>>()
  expectType<Equal<InferResponseType<typeof client.tree.$get, 200>, Tree>>()
}

const aliases = oc(routes, 'http://localhost')

export async function alias() {
  expectType<Equal<Awaited<ReturnType<typeof aliases.getTodo>>, Todo>>()
  const created = await aliases.createTodo({ title: 'Write it' })
  expectType<Equal<typeof created, Todo>>()
  const tree = await aliases.getTree({ cookies: {} })
  expectType<Equal<typeof tree, Tree>>()
}

// The client's type openapi-client-gen writes out is the one openapi-client types from the routes.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
expectType<Same<WrittenClient, Client<typeof routes, true>>>()
expectType<Same<EdgeClient, Client<typeof edgeRoutes>>>()
expectType<Same<EdgeAliasesClient, Client<typeof edgeAliasesRoutes, true>>>()
// @ts-expect-error a client that does not check answers no 422 or 502, and has no aliases
expectType<Same<WrittenClient, Client<typeof routes>>>()

export async function written() {
  const todo = await writtenClient.todos[':id'].$get({ param: { id: '1' } })
  if (todo.ok) expectType<Equal<Awaited<ReturnType<typeof todo.json>>, Todo>>()
  // @ts-expect-error the header is required
  void writtenClient.todos.$get({ query: {} })
  expectType<Equal<Awaited<ReturnType<typeof writtenClient.getTodo>>, Todo>>()
  expectType<Equal<ReturnType<typeof writtenClient.todos.$url>, URL>>()
}
