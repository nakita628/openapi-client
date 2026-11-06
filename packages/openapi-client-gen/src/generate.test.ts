import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vite-plus/test'

import { generate, generateClient, generateRoutes, SCHEMA_LIBRARIES } from './index.js'
import { run } from './cli.js'

const todo = JSON.parse(await readFile(new URL('fixtures/todo.json', import.meta.url), 'utf8'))

describe('generate', () => {
  it('writes the routes with TypeScript types, importing openapi-client alone', async () => {
    // The repository's own format, so that the fixture passes `vp check` as it is written.
    const files = await generate(todo, {
      output: 'src/fixtures/todo.routes.ts',
      client: { output: 'src/fixtures/todo.client.ts' },
      format: { printWidth: 120 },
    })
    const routes = files.get('src/fixtures/todo.routes.ts') ?? ''
    // openapi-client alone, the routes one object `as const` checked against RouteConfig, and the
    // client's type: nothing else exported.
    expect(routes.match(/^import .*$/gmu)?.[0]).toBe("import { schema } from 'openapi-client'")
    expect(routes.match(/ from '[^']*'/gu)?.every((from) => from === " from 'openapi-client'")).toBe(true)
    expect(routes.match(/^export .*$/gmu)).toStrictEqual(['export const routes = {', 'export type Client = {'])
    expect(routes).toMatch(/^ {2}getTodosIdRoute: \{$/mu)
    expect(routes).toMatch(/^\} as const satisfies Record<string, RouteConfig>$/mu)
    // No comment: the document's descriptions (it has some) are not written as TSDoc.
    for (const code of [routes, files.get('src/fixtures/todo.client.ts') ?? '']) {
      expect(code).not.toMatch(/\/\*|^\s*\/\//mu)
    }
    await expect(routes).toMatchFileSnapshot('./fixtures/todo.routes.ts')
    await expect(files.get('src/fixtures/todo.client.ts')).toMatchFileSnapshot('./fixtures/todo.client.ts')
  })

  it('writes the client typed only, its edge cases typed as openapi-client types them', async () => {
    // `src/types.test.ts` checks the written-out type against the one openapi-client works out.
    const edge = JSON.parse(await readFile(new URL('fixtures/edge.json', import.meta.url), 'utf8'))
    const files = await generate(edge, {
      output: 'src/fixtures/edge.routes.ts',
      client: { output: 'src/fixtures/edge.client.ts', aliases: false },
      format: { printWidth: 120 },
    })
    await expect(files.get('src/fixtures/edge.routes.ts')).toMatchFileSnapshot('./fixtures/edge.routes.ts')
    await expect(files.get('src/fixtures/edge.client.ts')).toMatchFileSnapshot('./fixtures/edge.client.ts')
    // And the validating client, with its aliases.
    const checked = await generate(edge, {
      output: 'src/fixtures/edge.aliases.routes.ts',
      client: { output: 'src/fixtures/edge.aliases.ts' },
      format: { printWidth: 120 },
    })
    await expect(checked.get('src/fixtures/edge.aliases.routes.ts')).toMatchFileSnapshot(
      './fixtures/edge.aliases.routes.ts',
    )
    await expect(checked.get('src/fixtures/edge.aliases.ts')).toMatchFileSnapshot('./fixtures/edge.aliases.ts')
  })

  it.each(SCHEMA_LIBRARIES)('writes the routes with %s schemas, the client still typed by Client', async (library) => {
    // `src/schemas.test.ts` calls them: the requests and responses checked against the schemas.
    const output = `src/fixtures/todo.${library}.routes.ts`
    const files = await generate(todo, {
      output,
      client: { output: 'src/fixtures/todo.client.ts' },
      schema: library,
      format: { printWidth: 120 },
    })
    const routes = files.get(output) ?? ''
    expect(routes).not.toContain('schema<')
    expect(routes.match(/^export .*$/gmu)).toStrictEqual(['export const routes = {', 'export type Client = {'])
    await expect(routes).toMatchFileSnapshot(`./fixtures/todo.${library}.routes.ts`)
  })

  it('throws for a document that is not an object', async () => {
    await expect(generate([], { output: 'routes.ts' })).rejects.toThrow('The document is not an object')
  })
})

function json(ref: string) {
  return { description: 'ok', content: { 'application/json': { schema: { $ref: ref } } } }
}

describe('generateRoutes', () => {
  const ok = { responses: { 200: { description: 'ok' } } }
  function namesOf(paths: Record<string, unknown>) {
    return [...generateRoutes({ paths }).matchAll(/^(\w+): \{\nmethod: /gmu)].map((match) => match[1])
  }

  it('names a route by its method and path, as hono-takibi does, its operationId aside', () => {
    expect(
      namesOf({
        '/': { get: ok },
        '/users/{id}': { get: { ...ok, operationId: 'getUser' }, delete: ok },
        '/users/': { post: ok },
        '/groups/{id}/-/epics': { get: ok },
        '/search': { query: ok },
      }),
    ).toStrictEqual([
      'getRoute',
      'getUsersIdRoute',
      'deleteUsersIdRoute',
      'postUsersIndexRoute',
      'getGroupsIdDashEpicsRoute',
      'querySearchRoute',
    ])
  })

  it('numbers the paths that share a name, by the path, in document order', () => {
    expect(
      namesOf({
        '/billable-usage': { get: ok },
        '/billable/usage': { get: ok, post: ok },
        '/billableUsage': { get: ok },
      }),
    ).toStrictEqual([
      'getBillableUsageRoute',
      'getBillableUsage2Route',
      'postBillableUsage2Route',
      'getBillableUsage3Route',
    ])
  })

  it('declares the types the routes name, and those they name, none exported', () => {
    const code = generateRoutes({
      paths: { '/': { get: { responses: { 200: json('#/components/schemas/A') } } } },
      components: {
        schemas: {
          A: { type: 'array', items: { $ref: '#/components/schemas/B' } },
          B: { type: 'string' },
          Unused: { type: 'number' },
        },
      },
    })
    expect(code).toContain('\ntype A = B[]')
    expect(code).toContain('\ntype B = string')
    expect(code).not.toContain('Unused')
    expect(code.match(/^export .*$/gmu)).toStrictEqual(['export const routes = {'])
    expect(code).toContain("import type { RouteConfig } from 'openapi-client'")
  })

  it('names a component apart from the globals the code uses', () => {
    const code = generateRoutes({
      paths: {
        '/a': { get: { responses: { 200: json('#/components/schemas/Blob') } } },
        '/b': { get: { responses: { 200: json('#/components/schemas/blob') } } },
      },
      components: { schemas: { Blob: { type: 'string' }, blob: { type: 'number' } } },
    })
    expect(code).toContain('type BlobType = string')
    expect(code).toContain('type Blob2 = number')
  })

  it('throws for a $ref that points to nothing', () => {
    expect(() =>
      generateRoutes({ paths: { '/': { get: { responses: { 200: { $ref: '#/components/responses/None' } } } } } }),
    ).toThrow('The $ref #/components/responses/None points to nothing')
  })
})

describe('generateClient', () => {
  it('types the client only, without aliases, when asked', () => {
    expect(
      generateClient({
        output: 'src/routes.ts',
        client: { output: 'src/api/client.ts', baseUrl: 'http://localhost', aliases: false },
      }),
    ).toBe(
      "import { oc } from 'openapi-client'\nimport type { routes } from '../routes.js'\n\nexport const client = oc<typeof routes>(\"http://localhost\")\n",
    )
  })

  it('writes the client typed by the Client the routes file declares', () => {
    const options = { output: 'src/routes.ts', client: { output: 'src/client.ts', baseUrl: 'http://localhost' } }
    expect(generateClient(options, { paths: {} })).toBe(
      "import { oc } from 'openapi-client'\nimport { routes } from './routes.js'\nimport type { Client } from './routes.js'\n\nexport const client: Client = oc(routes, \"http://localhost\")\n",
    )
    expect(generateClient({ ...options, client: { ...options.client, aliases: false } }, { paths: {} })).toBe(
      "import { oc } from 'openapi-client'\nimport type { Client } from './routes.js'\n\nexport const client: Client = oc(\"http://localhost\")\n",
    )
  })

  it('gives the client the routes with a schema library, without aliases as well: every call checked', () => {
    const options = {
      output: 'src/routes.ts',
      client: { output: 'src/client.ts', aliases: false },
      schema: 'zod',
    } as const
    const document = {
      paths: { '/items/{id}': { get: { operationId: 'getItem', responses: { 200: { description: 'ok' } } } } },
    }
    expect(generateClient(options, document)).toContain('export const client: Client = oc(routes, "/")')
    const routes = generateRoutes(document, options)
    expect(routes).toContain("ClientResponse<RequestValidationProblem, 422, 'json'>")
    expect(routes).not.toContain('readonly getItem:')
  })

  it('writes an endpoint whose arguments may be left out with them optional', () => {
    const ok = { 200: { description: 'ok' } }
    const code = generateRoutes(
      {
        paths: {
          '/health': { get: { responses: ok } },
          '/items/{id}': { get: { responses: ok } },
          '/items': {
            post: {
              requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
              responses: ok,
            },
            put: {
              requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
              responses: ok,
            },
          },
        },
      },
      { client: { output: 'src/client.ts', aliases: false } },
    )
    expect(code).toMatch(/readonly health: \{\nreadonly \$get: \(args\?: \{\}, /u)
    expect(code).toContain('$get: (args: { readonly param: { readonly id: string | number } }, ')
    expect(code).toContain('$post: (args: { readonly json: { [key: string]: unknown } }, ')
    expect(code).toContain('$put: (args?: { readonly json?: { [key: string]: unknown } }, ')
  })

  it('writes nothing without a client', () => {
    expect(generateClient({ output: 'src/routes.ts' })).toBeUndefined()
  })
})

describe('run', () => {
  it.each([
    [['-o', 'routes.ts'], 'The input must be'],
    [['openapi.txt', '-o', 'routes.ts'], 'The input must be'],
    [['openapi.yaml'], 'The output (-o) must be'],
    [['openapi.yaml', '-o', 'routes.ts', '--client', 'client.js'], 'The client must be'],
    [['openapi.yaml', '--unknown'], "Unknown option '--unknown'"],
    [['openapi.yaml', '-o', 'routes.ts', '--schema', 'yup'], 'The schema must be one of zod, valibot, arktype'],
  ])('refuses %j', async (args, message) => {
    expect(await run(args)).toStrictEqual({ ok: false, message: expect.stringContaining(message) })
  })

  it('answers the usage for --help', async () => {
    expect(await run(['--help'])).toStrictEqual({ ok: true, message: expect.stringContaining('Usage:') })
  })

  it('writes the routes with the schema library asked for', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'openapi-client-gen-'))
    try {
      const input = fileURLToPath(new URL('fixtures/todo.json', import.meta.url))
      const output = join(dir, 'routes.ts')
      expect(await run([input, '-o', output, '--schema', 'valibot'])).toStrictEqual({
        ok: true,
        message: `Generated ${output}`,
      })
      expect(await readFile(output, 'utf8')).toMatch(/^import \* as v from 'valibot'$/mu)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('folds a document it cannot read into the result', async () => {
    expect(await run(['missing.yaml', '-o', 'routes.ts'])).toStrictEqual({ ok: false, message: expect.any(String) })
  })
})
