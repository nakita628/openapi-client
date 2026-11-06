# openapi-client

A pnpm monorepo.

| package | |
|---|---|
| [`openapi-client`](./packages/openapi-client) | A client typed by OpenAPI routes, called the way you call Hono RPC or by `operationId`, validating requests and responses |
| [`openapi-client-gen`](./packages/openapi-client-gen) | Generates the routes and the client from an OpenAPI or TypeSpec document |

```sh
pnpm install
pnpm check   # format, lint and type-check (vp check)
pnpm test    # vp test run
pnpm build
```
