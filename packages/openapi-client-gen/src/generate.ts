import { posix } from 'node:path'

import { makeAdapter, makeSchemaDeclarations, makeSchemaIdentifiers, schemaImportLine } from 'oas-truth'
import type { Schema } from 'oas-truth'

import { isJson, keyOf, toType, union } from './typescript.js'
import type { Json, TypeContext } from './typescript.js'

/** What `generate` writes, and where. */
export type GenerateOptions = {
  /** The routes file, as it is imported by the client (`./src/routes.ts`). */
  readonly output: string
  /** Also write the client: `oc(routes, baseUrl)`. */
  readonly client?: {
    readonly output: string
    /** `'/'` by default. */
    readonly baseUrl?: string
    /** An alias per `operationId` (`true` by default). `false` without a schema library: `oc(baseUrl)`, typed only. */
    readonly aliases?: boolean
  }
  /** The schema library the client checks requests and responses with. Without one, `schema<T>()`: typed only. */
  readonly schema?: SchemaLibrary
}

/** Whether the client is given the routes: for its aliases, and always with a schema library (to check calls). */
function givesRoutes(options: Pick<GenerateOptions, 'client' | 'schema'>) {
  return options.client?.aliases !== false || options.schema !== undefined
}

/** The schema libraries a route may be declared with: Standard Schemas, written by oas-truth. */
export const SCHEMA_LIBRARIES = ['zod', 'valibot', 'arktype'] as const

/** One of `SCHEMA_LIBRARIES`. */
export type SchemaLibrary = (typeof SCHEMA_LIBRARIES)[number]

/** A Path Item's operations, in its order: `query` is OpenAPI 3.2's. */
const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace', 'query'] as const

type Method = (typeof METHODS)[number]

type Location = 'path' | 'query' | 'header' | 'cookie'

const LOCATIONS: readonly Location[] = ['path', 'query', 'header', 'cookie']

function isLocation(value: unknown): value is Location {
  return LOCATIONS.some((location) => location === value)
}

/** The part of `request` each location is declared in. */
const PART: Readonly<Record<Location, string>> = {
  path: 'params',
  query: 'query',
  header: 'headers',
  cookie: 'cookies',
}

/** The media types whose body is sent field by field (as `FormData`, or URL-encoded). */
const FORM = /^(?:multipart\/form-data|application\/x-www-form-urlencoded)$/iu

/** The media types openapi-client's types read a body's `json` and `form` from, as they read them. */
const JSON_TYPE = /^application\/(?:json|.*\+json)$/u
const FORM_TYPE = /^(?:multipart\/form-data|application\/x-www-form-urlencoded)$/u

/** A path parameter: a segment that is `{name}`. */
const PATH_PARAMETER = /(?:^|\/)\{[^/{}]+\}(?:\/|$)/u

/** Operation fields written into the route as they are: what a document generator reads back. */
const OPERATION_FIELDS = ['tags', 'summary', 'description', 'externalDocs', 'deprecated', 'security'] as const

/** Names the generated code uses from the global scope: a component type is not named so. */
const RESERVED = new Set([
  'Blob',
  'File',
  'FormData',
  'Promise',
  'Array',
  'Record',
  'Date',
  'URL',
  // What the routes and client files import or declare.
  'Client',
  'RouteConfig',
  'TypeSchema',
  'AliasFunction',
  'AliasRequestOptions',
  'ClientErrorStatusCode',
  'ClientRequestOptions',
  'ClientResponse',
  'InfoStatusCode',
  'PathEndpoint',
  'RedirectStatusCode',
  'RequestValidationProblem',
  'ResponseValidationProblem',
  'ServerErrorStatusCode',
  'SuccessStatusCode',
  'UrlEndpoint',
])

function listOf(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : []
}

/** What a local `$ref` (`#/components/parameters/Limit`) points to. */
function pointerOf(document: Json, ref: string): unknown {
  return ref
    .slice(2)
    .split('/')
    .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'))
    .reduce<unknown>((node, segment) => (isJson(node) ? node[segment] : undefined), document)
}

/** A value, its local `$ref`s followed to what they point to. */
function deref(document: Json, value: unknown, seen: ReadonlySet<string> = new Set()): unknown {
  if (!isJson(value) || typeof value['$ref'] !== 'string' || !value['$ref'].startsWith('#/')) return value
  const ref = value['$ref']
  if (seen.has(ref)) throw new Error(`The $ref ${ref} refers to itself`)
  const target = pointerOf(document, ref)
  if (target === undefined) throw new Error(`The $ref ${ref} points to nothing`)
  return deref(document, target, new Set([...seen, ref]))
}

/** The word a path segment of punctuation alone is named by, one per character (hono-takibi's). */
const SYMBOL_WORDS: Readonly<Record<string, string>> = {
  '-': 'Dash',
  _: 'Underscore',
  '.': 'Dot',
  '~': 'Tilde',
  '@': 'At',
  $: 'Dollar',
  '!': 'Bang',
  '*': 'Star',
  '+': 'Plus',
  ',': 'Comma',
  ';': 'Semicolon',
  '=': 'Equals',
  ':': 'Colon',
  '%': 'Percent',
}

function symbolWord(char: string) {
  return SYMBOL_WORDS[char] ?? `U${(char.codePointAt(0) ?? 0).toString(16).toUpperCase()}`
}

/**
 * A route's name by method and path, as hono-takibi names it (`GET /users/{id}` is `getUsersId`).
 * A punctuation-only segment (GitLab's `/-/`) is named by its characters so paths stay distinct.
 */
function methodPath(method: string, path: string): string {
  const name = path
    .split('/')
    .filter((segment) => segment !== '')
    .map((segment) =>
      /[A-Za-z0-9]/u.test(segment)
        ? segment.replaceAll(/[^A-Za-z0-9]/gu, ' ')
        : Array.from(segment, symbolWord).join(' '),
    )
    .join(' ')
    .trim()
    .split(/\s+/u)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join('')
  const suffix = path !== '/' && path.endsWith('/') ? 'Index' : ''
  return name === '' ? method : `${method}${name}${suffix}`
}

/**
 * Each path's place among paths sharing its name (`/billable-usage`, `/billable/usage`): later ones
 * are numbered (`getBillableUsage2`), by path alone so every method of a path gets the same number.
 */
function pathOrdinals(paths: Json): ReadonlyMap<string, number> {
  const seen = new Map<string, number>()
  const ordinals = new Map<string, number>()
  for (const path of Object.keys(paths)) {
    const name = methodPath('', path)
    const count = seen.get(name) ?? 0
    seen.set(name, count + 1)
    ordinals.set(path, count)
  }
  return ordinals
}

/** `name`, or `name2`, `name3`, ... when it is taken. */
function claim(name: string, taken: Set<string>): string {
  let candidate = name
  for (let n = 2; taken.has(candidate); n += 1) candidate = `${name}${String(n)}`
  taken.add(candidate)
  return candidate
}

/** Each entry on its own line, so that the formatter keeps the object open field by field. */
function block(entries: readonly string[]) {
  return entries.length === 0 ? '{}' : `{\n${entries.join(',\n')},\n}`
}

function literal(value: unknown): string {
  return isJson(value)
    ? block(Object.entries(value).map(([key, item]) => `${keyOf(key)}: ${literal(item)}`))
    : Array.isArray(value)
      ? `[${value.map(literal).join(', ')}]`
      : JSON.stringify(value)
}

/** A JSON Schema, as oas-truth takes one. */
function isSchema(value: unknown): value is Schema {
  return isJson(value)
}

function isSchemas(value: unknown): value is { readonly [key: string]: Schema } {
  return isJson(value) && Object.values(value).every(isSchema)
}

/** How a schema slot is written: `schema<T>()`, or the schema library's. */
type Slots = {
  /** The code of a media type's schema (`form`: a request's form body). */
  readonly of: (schema: unknown, form: boolean) => string
  /** The code of a request part's parameters, as one object. */
  readonly part: (parameters: readonly Parameter[]) => string
}

type Parameter = {
  readonly name: string
  readonly in: Location
  readonly required: boolean
  readonly schema: unknown
}

function parameterOf(document: Json, value: unknown): Parameter | undefined {
  const parameter = deref(document, value)
  if (!isJson(parameter) || typeof parameter['name'] !== 'string' || !isLocation(parameter['in'])) return undefined
  // A parameter declared by `content` instead of `schema` is typed by its one media type's schema.
  const content = isJson(parameter['content']) ? Object.values(parameter['content'])[0] : undefined
  const schema = parameter['schema'] ?? (isJson(content) ? content['schema'] : undefined) ?? { type: 'string' }
  return {
    // Hono reads the headers by their lowercase name.
    name: parameter['in'] === 'header' ? parameter['name'].toLowerCase() : parameter['name'],
    in: parameter['in'],
    required: parameter['in'] === 'path' || parameter['required'] === true,
    schema,
  }
}

/** The parameters of an operation: the Path Item's, the operation's own over them. */
function parametersOf(document: Json, shared: unknown, own: unknown): Parameter[] {
  const byKey = new Map<string, Parameter>()
  for (const value of [...listOf(shared), ...listOf(own)]) {
    const parameter = parameterOf(document, value)
    if (parameter !== undefined) byKey.set(`${parameter.in} ${parameter.name}`, parameter)
  }
  return [...byKey.values()]
}

const TYPE_SCHEMA_IMPORT = "import { schema } from 'openapi-client'"

/** An operation of the routes file: its route's name, and what the client is typed by. */
type Operation = {
  readonly name: string
  readonly method: Method
  readonly path: string
  readonly operationId: string | undefined
  /** Whether a call may leave its arguments out. */
  readonly optional: boolean
  /** A call's arguments, as openapi-client types them: `{ readonly param: { id: string } }`. */
  readonly args: string
  /** A call's responses, one `ClientResponse` per declared status. */
  readonly responses: readonly string[]
  /** The alias's signature, for an `operationId`. */
  readonly alias: string
}

function mentions(code: string, name: string) {
  return new RegExp(`\\b${name}\\b`, 'u').test(code)
}

/** The types the code names, and those they name in turn. */
function reachable(declarations: ReadonlyMap<string, string>, code: string): Set<string> {
  const found = new Set<string>()
  const pending = [code]
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    for (const [name, declaration] of declarations) {
      if (!found.has(name) && mentions(next, name)) {
        found.add(name)
        pending.push(declaration)
      }
    }
  }
  return found
}

/**
 * The routes file, not formatted yet: `routes`, and `Client` when the client is asked for. Only the
 * schema types and schemas they reach are declared, not exported.
 */
export function generateRoutes(document: Json, options: Pick<GenerateOptions, 'client' | 'schema'> = {}): string {
  const { client } = options
  const components = isJson(document['components']) ? document['components'] : {}
  const schemas = isJson(components['schemas']) ? components['schemas'] : {}

  const taken = new Set<string>()
  const names = new Map<string, string>()
  for (const [key, name] of makeSchemaIdentifiers(schemas)) {
    names.set(key, claim(RESERVED.has(name) ? `${name}Type` : name, taken))
  }
  const context: TypeContext = {
    names,
    resolve: (ref) => pointerOf(document, ref),
    // A schema library checks a form's file as a `File`, so the type says `File` too.
    ...(options.schema === undefined ? {} : { binary: 'File' }),
  }
  function typeOf(schema: unknown, form = false) {
    return toType(schema, form ? { ...context, form } : context)
  }

  const declarations = new Map([...names].map(([key, name]) => [name, `type ${name} = ${typeOf(schemas[key])}`]))

  const adapter = options.schema === undefined ? undefined : makeAdapter(options.schema)
  const slots: Slots =
    adapter === undefined
      ? {
          of: (schema, form) => `schema<${typeOf(schema, form)}>()`,
          part: (parameters) =>
            `schema<{ ${parameters
              .map(
                (parameter) => `${keyOf(parameter.name)}${parameter.required ? '' : '?'}: ${typeOf(parameter.schema)}`,
              )
              .join('; ')} }>()`,
        }
      : {
          // No `paramIn` (no coercion): the client checks arguments before they are written into the URL.
          of: (schema) => adapter.toExpression(isSchema(schema) ? schema : {}),
          part: (parameters) =>
            adapter.toExpression({
              type: 'object',
              properties: Object.fromEntries(
                parameters.map((parameter) => [parameter.name, isSchema(parameter.schema) ? parameter.schema : {}]),
              ),
              required: parameters.filter((parameter) => parameter.required).map((parameter) => parameter.name),
            }),
        }
  // The schemas' constants, in the order oas-truth declares them (each after those it names).
  const schemaDeclarations =
    adapter === undefined || !isSchemas(schemas) ? [] : makeSchemaDeclarations(schemas, adapter)
  for (const { varName, code } of schemaDeclarations) {
    declarations.set(varName, code.replaceAll(/^export const /gmu, 'const '))
  }

  function content(media: unknown, isRequest: boolean) {
    return Object.entries(isJson(media) ? media : {}).map(([mediaType, value]) => {
      const entry = deref(document, value)
      const schema = isJson(entry) ? entry['schema'] : undefined
      return `${JSON.stringify(mediaType)}: ${
        schema === undefined ? '{}' : `{ schema: ${slots.of(schema, isRequest && FORM.test(mediaType))} }`
      }`
    })
  }

  const routes: string[] = []
  const operations: Operation[] = []
  const paths = isJson(document['paths']) ? document['paths'] : {}
  const ordinals = pathOrdinals(paths)
  for (const [path, value] of Object.entries(paths)) {
    const item = deref(document, value)
    if (!isJson(item)) continue
    for (const method of METHODS) {
      const operation = deref(document, item[method])
      if (!isJson(operation)) continue
      const ordinal = ordinals.get(path) ?? 0
      const name = `${methodPath(method, path)}${ordinal === 0 ? '' : String(ordinal + 1)}Route`
      const route = routeOf({ document, name, path, method, item, operation, typeOf, slots, content })
      routes.push(route.code)
      const operationId = typeof operation['operationId'] === 'string' ? operation['operationId'] : undefined
      operations.push({ name: route.name, method, path, operationId, ...route.call })
    }
  }

  // One `as const` object, not a constant per route: TypeScript narrows an imported reference
  // (`schema`) through every constant declared before it, which costs quadratically.
  const exported = [
    `export const routes = ${block(routes)} as const satisfies Record<string, RouteConfig>`,
    ...(client === undefined
      ? []
      : [`export type Client = ${clientType(operations, client.aliases !== false, givesRoutes(options))}`]),
  ].join('\n\n')
  const used = [...CLIENT_TYPES.filter((name) => mentions(exported, name)), 'RouteConfig'].sort()
  const reached = reachable(declarations, exported)
  const declared = [...declarations].filter(([name]) => reached.has(name)).map(([, declaration]) => declaration)
  // An ArkType cycle is a `scope`: the import names it as well.
  const cyclic = schemaDeclarations.some(
    ({ varName, importLine }) =>
      reached.has(varName) && adapter !== undefined && importLine !== schemaImportLine(adapter),
  )
  const head = [
    adapter === undefined ? TYPE_SCHEMA_IMPORT : schemaImportLine(adapter, {}, cyclic),
    `import type { ${used.join(', ')} } from 'openapi-client'`,
  ]
  return `${[head.join('\n'), ...declared, exported].join('\n\n')}\n`
}

type RouteParts = {
  readonly document: Json
  /** The route's key in `routes`: `getUsersIdRoute`. */
  readonly name: string
  readonly path: string
  readonly method: Method
  readonly item: Json
  readonly operation: Json
  readonly typeOf: (schema: unknown, form?: boolean) => string
  readonly slots: Slots
  readonly content: (media: unknown, isRequest: boolean) => string[]
}

function routeOf({ document, name, path, method, item, operation, typeOf, slots, content }: RouteParts): {
  readonly name: string
  readonly code: string
  readonly call: Pick<Operation, 'optional' | 'args' | 'responses' | 'alias'>
} {
  const operationId = typeof operation['operationId'] === 'string' ? operation['operationId'] : undefined

  const parameters = parametersOf(document, item['parameters'], operation['parameters'])
  const request = LOCATIONS.flatMap((location) => {
    const declared = parameters.filter((parameter) => parameter.in === location)
    return declared.length === 0 ? [] : [`${PART[location]}: ${slots.part(declared)}`]
  })

  const body = deref(document, operation['requestBody'])
  // Whether a call may leave its arguments out, as openapi-client's types decide it: no parameter
  // part, no path parameter and no required JSON or form body (media types matched case-sensitively, as they are).
  const optional =
    request.length === 0 &&
    !PATH_PARAMETER.test(path) &&
    !(
      isJson(body) &&
      body['required'] === true &&
      isJson(body['content']) &&
      Object.keys(body['content']).some((type) => JSON_TYPE.test(type) || FORM_TYPE.test(type))
    )
  if (isJson(body) && isJson(body['content']) && Object.keys(body['content']).length > 0) {
    request.push(
      `body: ${block([
        ...(typeof body['description'] === 'string' ? [`description: ${JSON.stringify(body['description'])}`] : []),
        `required: ${String(body['required'] === true)}`,
        `content: ${block(content(body['content'], true))}`,
      ])}`,
    )
  }

  const responses = Object.entries(isJson(operation['responses']) ? operation['responses'] : {}).map(
    ([status, value]) => {
      const response = deref(document, value)
      const fields = isJson(response) ? response : {}
      const media = content(fields['content'], false)
      const description = typeof fields['description'] === 'string' ? fields['description'] : ''
      return `${/^\d+$/u.test(status) ? status : JSON.stringify(status)}: ${block([
        `description: ${JSON.stringify(description)}`,
        ...(media.length > 0 ? [`content: ${block(media)}`] : []),
      ])}`
    },
  )

  const fields = [
    `method: ${JSON.stringify(method)}`,
    `path: ${JSON.stringify(path)}`,
    ...(operationId === undefined ? [] : [`operationId: ${JSON.stringify(operationId)}`]),
    ...OPERATION_FIELDS.flatMap((field) =>
      operation[field] === undefined ? [] : [`${field}: ${literal(operation[field])}`],
    ),
    ...(request.length > 0 ? [`request: ${block(request)}`] : []),
    `responses: ${block(responses)}`,
  ]
  const responseTypes = responseTypesOf(document, operation, typeOf)
  return {
    name,
    code: `${name}: ${block(fields)}`,
    call: {
      optional,
      args: argsOf(path, parameters, body, typeOf),
      responses: clientResponsesOf(responseTypes),
      alias: aliasSignatureOf(method, path, parameters, body, responseTypes, typeOf),
    },
  }
}

function relativeSpecifier(from: string, to: string): string {
  const relative = posix.relative(posix.dirname(from), to).replace(/\.ts$/u, '.js')
  return relative.startsWith('.') ? relative : `./${relative}`
}

/** The argument of each parameter location, as openapi-client's client names it. */
const ARG: Readonly<Record<Location, string>> = { path: 'param', query: 'query', header: 'header', cookie: 'cookie' }

/** The form a form field takes when its media type declares no schema. */
const ANY_FORM = 'Readonly<Record<string, string | Blob | readonly (string | Blob)[]>>'

/** A content's media types, each with its schema when it has one. */
function mediaOf(document: Json, content: unknown): { readonly type: string; readonly schema: unknown }[] {
  return Object.entries(isJson(content) ? content : {}).map(([type, value]) => {
    const entry = deref(document, value)
    return { type, schema: isJson(entry) ? entry['schema'] : undefined }
  })
}

/**
 * A content's JSON body type, as openapi-client reads it: `application/json`'s schema, else the
 * union of every JSON media type's when each has one, else `unknown`; undefined without JSON.
 */
function jsonTypeOf(
  media: readonly { readonly type: string; readonly schema: unknown }[],
  typeOf: RouteParts['typeOf'],
): string | undefined {
  const json = media.filter((entry) => JSON_TYPE.test(entry.type))
  if (json.length === 0) return undefined
  const plain = json.find((entry) => entry.type === 'application/json')
  if (plain !== undefined && plain.schema !== undefined) return typeOf(plain.schema)
  return json.every((entry) => entry.schema !== undefined)
    ? union(json.map((entry) => typeOf(entry.schema)))
    : 'unknown'
}

/** A call's arguments, as openapi-client's types read them off the route. */
function argsOf(path: string, parameters: readonly Parameter[], body: unknown, typeOf: RouteParts['typeOf']): string {
  const members = LOCATIONS.flatMap((location) => {
    const fields = parameters
      .filter((parameter) => parameter.in === location)
      .map((parameter) => `${keyOf(parameter.name)}${parameter.required ? '' : '?'}: ${typeOf(parameter.schema)}`)
    return fields.length === 0 ? [] : [`readonly ${ARG[location]}: { ${fields.join('; ')} }`]
  })
  // A path parameter that is not declared is typed by the path alone.
  if (!parameters.some((parameter) => parameter.in === 'path')) {
    const names = [...path.matchAll(/(?:^|\/)\{([^/{}]+)\}(?=\/|$)/gu)].map((match) => match[1] ?? '')
    if (names.length > 0) {
      members.unshift(
        `readonly param: { ${[...new Set(names)].map((name) => `readonly ${keyOf(name)}: string | number`).join('; ')} }`,
      )
    }
  }
  if (isJson(body) && isJson(body['content']) && Object.keys(body['content']).length > 0) {
    const optional = body['required'] === true ? '' : '?'
    const media = mediaOf({}, body['content'])
    const json = jsonTypeOf(media, typeOf)
    const form = media.filter((entry) => FORM_TYPE.test(entry.type))
    if (json !== undefined) members.push(`readonly json${optional}: ${json}`)
    else if (form.length > 0) {
      const type = form.every((entry) => entry.schema !== undefined)
        ? union(form.map((entry) => typeOf(entry.schema, true)))
        : ANY_FORM
      members.push(`readonly form${optional}: ${type}`)
    }
  }
  return members.length === 0 ? '{}' : `{ ${members.join('; ')} }`
}

/** The status type of a `responses` key, as openapi-client reads it. */
const STATUS: Readonly<Record<string, string>> = {
  '1XX': 'InfoStatusCode',
  '2XX': 'SuccessStatusCode',
  '3XX': 'RedirectStatusCode',
  '4XX': 'ClientErrorStatusCode',
  '5XX': 'ServerErrorStatusCode',
}

/** A declared response: its `responses` key, and its body's type and format as openapi-client reads them. */
type ResponseType = { readonly key: string; readonly body: string; readonly format: 'json' | 'text' | 'body' | 'none' }

/** The responses of an operation, as openapi-client reads each. */
function responseTypesOf(document: Json, operation: Json, typeOf: RouteParts['typeOf']): ResponseType[] {
  return Object.entries(isJson(operation['responses']) ? operation['responses'] : {}).map(([key, value]) => {
    const response = deref(document, value)
    const media = mediaOf(document, isJson(response) ? response['content'] : undefined)
    if (media.length === 0) return { key, body: 'undefined', format: 'none' }
    const json = jsonTypeOf(media, typeOf)
    if (json !== undefined) return { key, body: json, format: 'json' }
    if (media.some((entry) => entry.type.startsWith('text/'))) return { key, body: 'string', format: 'text' }
    return { key, body: 'unknown', format: 'body' }
  })
}

/** A call's responses, one `ClientResponse` per declared status, as openapi-client types them. */
function clientResponsesOf(responses: readonly ResponseType[]): string[] {
  return responses.map(({ key, body, format }) => {
    const status = /^\d+$/u.test(key) ? String(Number(key)) : (STATUS[key] ?? 'number')
    return `ClientResponse<${body}, ${status}, '${format}'>`
  })
}

/** The `responses` keys an alias answers the body of: the 1XX-3XX statuses openapi-client knows, and their ranges. */
const SUCCESS_KEYS = new Set([
  '100',
  '101',
  '102',
  '103',
  '200',
  '201',
  '202',
  '203',
  '204',
  '205',
  '206',
  '207',
  '208',
  '226',
  '300',
  '301',
  '302',
  '303',
  '304',
  '305',
  '306',
  '307',
  '308',
  '1XX',
  '2XX',
  '3XX',
])

/** The methods whose alias takes the body first, as openapi-client's. */
const BODY_METHODS = new Set(['post', 'put', 'patch', 'delete', 'query'])

/** The alias's name for each parameter location's part. */
const ALIAS_PART: Readonly<Record<Location, string>> = {
  path: 'params',
  query: 'queries',
  header: 'headers',
  cookie: 'cookies',
}

/**
 * An alias's signature, as openapi-client's `AliasFunction` types it: the body first for
 * `BODY_METHODS`, then the config; it resolves to the body of the 1XX-3XX responses.
 */
function aliasSignatureOf(
  method: Method,
  path: string,
  parameters: readonly Parameter[],
  body: unknown,
  responses: readonly ResponseType[],
  typeOf: RouteParts['typeOf'],
): string {
  const parts = LOCATIONS.flatMap((location) => {
    const declared = parameters.filter((parameter) => parameter.in === location)
    if (declared.length === 0) return []
    const fields = declared.map(
      (parameter) => `${keyOf(parameter.name)}${parameter.required ? '' : '?'}: ${typeOf(parameter.schema)}`,
    )
    const optional = declared.every((parameter) => !parameter.required)
    return [{ member: `readonly ${ALIAS_PART[location]}${optional ? '?' : ''}: { ${fields.join('; ')} }`, optional }]
  })
  if (!parameters.some((parameter) => parameter.in === 'path')) {
    const names = [...path.matchAll(/(?:^|\/)\{([^/{}]+)\}(?=\/|$)/gu)].map((match) => match[1] ?? '')
    if (names.length > 0) {
      const fields = [...new Set(names)].map((name) => `readonly ${keyOf(name)}: string | number`)
      parts.unshift({ member: `readonly params: { ${fields.join('; ')} }`, optional: false })
    }
  }
  const config =
    parts.length === 0
      ? 'AliasRequestOptions'
      : `{ ${parts.map((part) => part.member).join('; ')} } & AliasRequestOptions`
  const configParameter = `config${parts.every((part) => part.optional) ? '?' : ''}: ${config}`

  const answered = responses.filter((response) => SUCCESS_KEYS.has(response.key))
  const result = answered.length === 0 ? 'never' : union(answered.map((response) => response.body))
  if (!BODY_METHODS.has(method)) return `(${configParameter}) => Promise<${result}>`

  let bodyType = 'undefined'
  if (isJson(body) && isJson(body['content']) && Object.keys(body['content']).length > 0) {
    const media = mediaOf({}, body['content'])
    const form = media.filter((entry) => FORM_TYPE.test(entry.type))
    const type =
      jsonTypeOf(media, typeOf) ??
      (form.length === 0
        ? undefined
        : form.every((entry) => entry.schema !== undefined)
          ? union(form.map((entry) => typeOf(entry.schema, true)))
          : ANY_FORM)
    if (type !== undefined) bodyType = body['required'] === true ? type : union([type, 'undefined'])
  }
  return `(body: ${bodyType}, ${configParameter}) => Promise<${result}>`
}

/** An operationId's alias name, as openapi-client's `aliasOf` makes it (`list-pets` is `listPets`). */
function aliasOf(operationId: string): string {
  const words = operationId.split(/[ !"#%&'()*+,\-./:;<=>?@[\\\]^`{|}~]+/u).filter((word) => word !== '')
  const joined = words
    .map((word, index) => (index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join('')
  return /^[0-9]/u.test(joined) ? `_${joined}` : joined
}

/** The chain keys of a path: `/users/{id}` is `users`, `:id`; `/` is `index`. */
function chainOf(path: string): string[] {
  return path
    .replace(/^\//u, '')
    .split('/')
    .map((segment) => (segment === '' ? 'index' : segment.replace(/^\{(.+)\}$/u, ':$1')))
}

type TreeNode = { readonly children: Map<string, TreeNode>; readonly operations: Operation[] }

function treeNode(): TreeNode {
  return { children: new Map(), operations: [] }
}

function routeType(operation: Operation) {
  return `typeof routes.${operation.name}`
}

/** What a validating client answers itself: 422 for a request it did not send, 502 for a response that does not match. */
const PROBLEMS = [
  "ClientResponse<RequestValidationProblem, 422, 'json'>",
  "ClientResponse<ResponseValidationProblem, 502, 'json'>",
]

/** A node of the client's type: `$get`, ..., `$url` and `$path` for its operations, then a key per next segment. */
function nodeType(node: TreeNode, checked: boolean): string {
  const members: string[] = []
  if (node.operations.length > 0) {
    for (const operation of node.operations) {
      const responses = [...operation.responses, ...(checked ? PROBLEMS : [])]
      const response = responses.length === 0 ? 'never' : responses.join(' | ')
      members.push(
        `readonly $${operation.method}: (args${operation.optional ? '?' : ''}: ${operation.args}, options?: ClientRequestOptions) => Promise<${response}>`,
      )
    }
    const all = node.operations.map(routeType).join(' | ')
    members.push(`readonly $url: UrlEndpoint<${all}>`, `readonly $path: PathEndpoint<${all}>`)
  }
  for (const [key, child] of node.children) members.push(`readonly ${keyOf(key)}: ${nodeType(child, checked)}`)
  return block(members)
}

/**
 * The client's type written out (with the checks' 422 and 502 when `checked`, and the aliases at
 * its root), so the client is not typed from the routes, which costs more to type-check.
 */
function clientType(operations: readonly Operation[], withAliases: boolean, checked: boolean): string {
  const root = treeNode()
  for (const operation of operations) {
    let node = root
    for (const key of chainOf(operation.path)) {
      let child = node.children.get(key)
      if (child === undefined) node.children.set(key, (child = treeNode()))
      node = child
    }
    node.operations.push(operation)
  }
  const aliases = new Map<string, Operation>()
  if (withAliases) {
    for (const operation of operations) {
      const alias = operation.operationId === undefined ? '' : aliasOf(operation.operationId)
      if (alias !== '' && !aliases.has(alias)) aliases.set(alias, operation)
    }
  }
  const members = [...root.children].map(([key, child]) => {
    const alias = aliases.get(key)
    const node = nodeType(child, checked)
    // An alias that is a first segment as well (`/login`, `login`): called, it is the alias.
    return `readonly ${keyOf(key)}: ${alias === undefined ? node : `(${alias.alias}) & ${node}`}`
  })
  for (const [alias, operation] of aliases) {
    if (!root.children.has(alias)) members.push(`readonly ${keyOf(alias)}: ${operation.alias}`)
  }
  return block(members)
}

/** The types of openapi-client the client's type may name. */
const CLIENT_TYPES = [
  'AliasRequestOptions',
  'ClientErrorStatusCode',
  'ClientRequestOptions',
  'ClientResponse',
  'InfoStatusCode',
  'PathEndpoint',
  'RedirectStatusCode',
  'RequestValidationProblem',
  'ResponseValidationProblem',
  'ServerErrorStatusCode',
  'SuccessStatusCode',
  'UrlEndpoint',
] as const

/** The client file, not formatted yet: typed with `Client` given the document, else from the routes. */
export function generateClient(options: GenerateOptions, document?: Json): string | undefined {
  const { client } = options
  if (client === undefined) return undefined
  const specifier = relativeSpecifier(posix.normalize(client.output), posix.normalize(options.output))
  const baseUrl = JSON.stringify(client.baseUrl ?? '/')
  const checked = givesRoutes(options)
  if (document === undefined) {
    return [
      "import { oc } from 'openapi-client'",
      checked ? `import { routes } from '${specifier}'` : `import type { routes } from '${specifier}'`,
      '',
      `export const client = ${checked ? `oc(routes, ${baseUrl})` : `oc<typeof routes>(${baseUrl})`}`,
      '',
    ].join('\n')
  }
  // `oc()` infers its type from the annotation, so no route is read.
  return [
    "import { oc } from 'openapi-client'",
    ...(checked ? [`import { routes } from '${specifier}'`] : []),
    `import type { Client } from '${specifier}'`,
    '',
    `export const client: Client = oc(${checked ? 'routes, ' : ''}${baseUrl})`,
    '',
  ].join('\n')
}
