# openapi-client-gen

Generates [openapi-client](../openapi-client) routes and a client from an OpenAPI or TypeSpec document. You can call the client the way you call Hono RPC, or by `operationId`.

```sh
npm i -D openapi-client-gen
npm i openapi-client zod
```

## Generate

```sh
npx openapi-client-gen openapi.yaml -o src/routes.ts --client src/client.ts --schema zod
```

| option | |
|---|---|
| `<input>` | an OpenAPI (`.yaml`, `.yml`, `.json`) or TypeSpec (`.tsp`) document |
| `-o`, `--output` | the routes file |
| `--client` | the client file |
| `--schema` | `zod`, `valibot` or `arktype`: requests and responses are validated against these schemas. Without it, the routes carry types only and nothing is validated |
| `--base-url` | the base URL (`/` by default) |
| `--no-aliases` | no calling by `operationId` |

`--schema` lets you choose the library so that the generated code uses the one your project (or your server) already depends on, instead of pulling in another. The schemas are written by [oas-truth](https://www.npmjs.com/package/oas-truth), and the client validates through [Standard Schema](https://standardschema.dev), so every supported library is validated the same way.

What is validated, and what the errors look like, is described in [openapi-client](../openapi-client#validation).

```ts
// src/client.ts (generated)
import { oc } from 'openapi-client'
import { routes } from './routes.js'
import type { Client } from './routes.js'

export const client: Client = oc(routes, '/')
```

`Client` is written out in full in `routes.ts`, so TypeScript does not infer anything from the routes. This is the lightest way to type the client: 25k instantiations and 0.15s to check 1000 operations, against 796k and 0.50s when the type is inferred (see [openapi-client](../openapi-client#type-checking-cost)).

## Calling the way you call Hono RPC

```ts
import { parseResponse } from 'openapi-client'
import { client } from './client.js'

const res = await client.todos[':id'].$get({ param: { id: '1' } })
if (res.ok) {
  const todo = await res.json() // Todo
}

await client.todos.$post({ json: { title: 'Write it' } })

// Returns the 2XX body; any other response throws a DetailedError
const todo = await parseResponse(client.todos[':id'].$get({ param: { id: '1' } }))
```

## Calling by operationId

```ts
import { client } from './client.js'

const todo = await client.getTodo({ params: { id: '1' } }) // operationId: getTodo
const created = await client.createTodo({ title: 'Write it' }) // operationId: create-todo
```

Returns the 2XX body; any other response throws a `DetailedError`.

## License

MIT. See [LICENSE](./LICENSE).
