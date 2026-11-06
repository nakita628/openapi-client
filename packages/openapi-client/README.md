# openapi-client

A client typed by OpenAPI routes (`createRoute()`), called the way you call Hono's RPC client or by `operationId`. It validates requests and responses against the routes' schemas (Zod, Valibot, ArkType, or any [Standard Schema](https://standardschema.dev)).

```sh
npm install openapi-client zod
```

## Routes

```ts
// routes.ts
import * as z from 'zod'
import { createRoute } from 'openapi-client'

const User = z.object({ id: z.string(), name: z.string() })

export const routes = {
  getUserRoute: createRoute({
    method: 'get',
    path: '/users/{id}',
    operationId: 'getUser',
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: { description: 'The user', content: { 'application/json': { schema: User } } },
      404: { description: 'Not found', content: { 'application/json': { schema: z.object({ message: z.string() }) } } },
    },
  }),
  postUsersRoute: createRoute({
    method: 'post',
    path: '/users',
    operationId: 'createUser',
    request: { body: { required: true, content: { 'application/json': { schema: User.omit({ id: true }) } } } },
    responses: { 201: { description: 'Created', content: { 'application/json': { schema: User } } } },
  }),
} as const
```

```ts
// client.ts
import { oc } from 'openapi-client'
import type { AliasFunction, Endpoint, PathEndpoint, UrlEndpoint } from 'openapi-client'
import { routes } from './routes'

type Routes = typeof routes

// The client's type, written out: TypeScript does not have to infer it from the routes
export type Client = {
  readonly users: {
    readonly $post: Endpoint<Routes['postUsersRoute'], true>
    readonly $url: UrlEndpoint<Routes['postUsersRoute']>
    readonly $path: PathEndpoint<Routes['postUsersRoute']>
    readonly ':id': {
      readonly $get: Endpoint<Routes['getUserRoute'], true>
      readonly $url: UrlEndpoint<Routes['getUserRoute']>
      readonly $path: PathEndpoint<Routes['getUserRoute']>
    }
  }
  readonly getUser: AliasFunction<Routes['getUserRoute']>
  readonly createUser: AliasFunction<Routes['postUsersRoute']>
}

export const client: Client = oc(routes, 'http://localhost:8787')
```

`const client = oc(routes, 'http://localhost:8787')` works too, with the type inferred from the routes, but it is heavier to type-check (see [Type-checking cost](#type-checking-cost)).

## Calling the way you call Hono RPC

```ts
import { parseResponse } from 'openapi-client'

const res = await client.users[':id'].$get({ param: { id: '1' } })
if (res.ok) {
  const user = await res.json() // { id: string; name: string }
} else if (res.status === 404) {
  const problem = await res.json() // { message: string }
}

await client.users.$post({ json: { name: 'alice' } })

// Returns the 2XX body; any other response throws a DetailedError
const user = await parseResponse(client.users[':id'].$get({ param: { id: '1' } }))
```

- The path `/users/{id}` is `client.users[':id']`, and `/` is `client.index`.
- The arguments are `param`, `query`, `header`, `cookie`, and `json` or `form`.
- The `QUERY` method (`method: 'query'`) is called with `$query`; an OpenAPI document that includes it must be 3.2.

## Calling by operationId

```ts
import { DetailedError } from 'openapi-client'

const user = await client.getUser({ params: { id: '1' } }) // { id: string; name: string }
const created = await client.createUser({ name: 'alice' }) // body first, then the config

try {
  await client.getUser({ params: { id: '2' } })
} catch (error) {
  if (error instanceof DetailedError && error.statusCode === 404) {
    error.detail?.data // the body of the response
  }
}
```

- `post`, `put`, `patch`, `delete` and `query` take the body first and the config second. The other methods take only the config.
- The config holds `params`, `queries`, `headers` and `cookies`, plus `fetch` options, `timeout` and `responseType`.
- Returns the 2XX body; any other response throws a `DetailedError`.

## Schema libraries

The client validates through [Standard Schema](https://standardschema.dev) (`~standard.validate`) rather than a single library's API, so it is not tied to Zod. You can declare routes with the schema library your server already uses. Routes have the same shape as @hono/zod-openapi's and takibi's, so one route can serve both the server and the client. The package itself does not depend on any schema library.

| library | how to use it |
|---|---|
| Zod, Valibot, ArkType, or any Standard Schema | as is |
| Effect Schema | `createRoute()` from `openapi-client/effect`, or `Schema.toStandardSchemaV1(schema)` |
| TypeScript types only | `schema<User>()`: typed, not validated |

## Validation

`oc(routes, url)` always validates; there is no option to turn it off. `oc<typeof routes>(url)` is typed only and validates nothing.

| when | what is validated | if it does not match |
|---|---|---|
| request, before it is sent | `param`, `query`, `header`, `cookie`, and `json` or `form`, as you pass them | 422, and the request is not sent |
| response | the JSON body, against the schema for its status (`200`, then `2XX`, then `default`), and its headers when the route declares them | 502 (also when the body is not JSON) |

Statuses the route does not declare, and bodies that are not JSON (`text/plain`, ...), are passed through unvalidated.

## Errors

A 422 or 502 comes back as an RFC 9457 Problem Details (`application/problem+json`):

```json
{
  "type": "about:blank",
  "title": "Unprocessable Content",
  "status": 422,
  "detail": "Invalid body.",
  "instance": "/users",
  "errors": [{ "in": "body", "path": "name", "message": "Invalid input: expected string, received number" }]
}
```

For a 502, `title` is `"Bad Gateway"` and `detail` reads `"The response does not match the route: invalid body."`. Each issue's `in` is `path`, `query`, `header`, `cookie` or `body`.

| call | 2XX | any other response (422 and 502 included) | no response (network error, timeout, abort) |
|---|---|---|---|
| `client.users[':id'].$get()` | the `Response` | the `Response` | the `fetch` error, thrown |
| `parseResponse(...)` | the body | throws a `DetailedError` | the `fetch` error, thrown |
| `client.getUser()` | the body | throws a `DetailedError` | throws a `DetailedError` |

A `DetailedError` carries `statusCode`, `detail.data` (the response body, or the Problem Details), `detail.statusText`, `code` (`NETWORK`, `TIMEOUT` or `ABORTED` when no response came back) and `alias` (the `operationId` alias that threw it).

## Options

The `oc()` options and a call's second argument take the same options as `fetch` (`headers`, `signal`, `credentials`, `cache`, ...). A call's options are merged over the client's.

```ts
const client = oc(routes, 'http://localhost:8787', {
  credentials: 'include',
  headers: async () => ({ authorization: `Bearer ${await getToken()}` }),
})

await client.users[':id'].$get({ param: { id: '1' } }, { signal: AbortSignal.timeout(5000) })
await client.getUser({ params: { id: '1' }, timeout: 5000 })
```

## Type-checking cost

Annotating the client with its type (`const client: Client = oc(routes, url)`) means TypeScript does not infer the type from the routes. The more completely the type is written out, the less work the type check does. Measured with 1000 operations on Zod routes, every endpoint called both by chain and by `operationId`:

| how the client is typed | instantiations | check time |
|---|---|---|
| `const client = oc(routes, url)` (inferred) | 796k | 0.50s |
| `Client` written with `Endpoint` / `AliasFunction` | 514k | 0.35s |
| `Client` fully written out ([openapi-client-gen](../openapi-client-gen)) | 25k | 0.15s |

The lightest is to generate the routes and the client from an OpenAPI document with openapi-client-gen, which writes each endpoint's arguments and responses out in full.

## License

MIT. See [LICENSE](./LICENSE).
