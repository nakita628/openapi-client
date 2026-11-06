/** Request and response validation against a route's Standard Schemas. */

import type {
  Args,
  ResponseCheck,
  RuntimeContent,
  RuntimeRoute,
  ValidationIssue,
  ValidationLocation,
} from '../../types/validation.js'
import { FORM_TYPE, JSON_TYPE, mediaTypeOf } from '../../utils/media-type.js'
import { replay } from '../response/replay.js'
import { isObject } from '../../utils/object.js'
import { isStandard, validatorOf } from './schema.js'
import type { StandardResult } from './schema.js'

export { problem } from './problem.js'

type Checked = { readonly issues: ValidationIssue[]; readonly value: unknown }

type MaybePromise<T> = T | Promise<T>

const NONE: ValidationIssue[] = []

function issuesOf(result: StandardResult, where: ValidationLocation): ValidationIssue[] {
  if (result.issues === undefined || result.issues.length === 0) return NONE
  return result.issues.map((issue) => ({
    in: where,
    path: issue.path === undefined ? '' : issue.path.map((key) => String(isObject(key) ? key.key : key)).join('.'),
    message: issue.message,
  }))
}

function settle(result: StandardResult, value: unknown, where: ValidationLocation) {
  const issues = issuesOf(result, where)
  return { issues, value: issues.length > 0 ? value : result.value }
}

/** Validates `value` against `schema`; stays synchronous unless the schema returns a promise. */
function validate(schema: unknown, value: unknown, where: ValidationLocation): MaybePromise<Checked> {
  const run = validatorOf(schema)
  if (run === undefined) return { issues: NONE, value }
  const result = run(value)
  return result instanceof Promise ? result.then((r) => settle(r, value, where)) : settle(result, value, where)
}

function schemaFor(content: RuntimeContent | undefined, mediaType: RegExp): unknown {
  if (content === undefined) return undefined
  if ('application/json' in content && mediaType === JSON_TYPE) return content['application/json']?.schema
  for (const type in content) if (mediaType.test(type)) return content[type]?.schema
  return undefined
}

/** Collects the issues of several checks, awaiting only if one is a promise. */
function gather(checks: readonly MaybePromise<Checked>[]): MaybePromise<ValidationIssue[]> {
  if (checks.some((check) => check instanceof Promise)) {
    return Promise.all(checks.map(async (check) => check)).then((all) => all.flatMap((check) => check.issues))
  }
  const issues: ValidationIssue[] = []
  for (const check of checks as readonly Checked[]) if (check.issues.length > 0) issues.push(...check.issues)
  return issues
}

const EMPTY = Object.freeze({})

/** Validates the request parts; synchronous when every schema is. */
export function checkRequest(route: RuntimeRoute, args: Args | undefined): MaybePromise<ValidationIssue[]> {
  const request = route.request
  if (request === undefined) return NONE
  const { params, query, headers, cookies, body } = request
  const checks: MaybePromise<Checked>[] = []
  if (params !== undefined) checks.push(validate(params, args?.param ?? EMPTY, 'path'))
  if (query !== undefined) checks.push(validate(query, args?.query ?? EMPTY, 'query'))
  if (headers !== undefined) checks.push(validate(headers, args?.header ?? EMPTY, 'header'))
  if (cookies !== undefined) checks.push(validate(cookies, args?.cookie ?? EMPTY, 'cookie'))
  const sent = args?.json !== undefined || args?.form !== undefined
  if (body !== undefined && (sent || body.required !== false)) {
    const json = schemaFor(body.content, JSON_TYPE)
    checks.push(
      json !== undefined && args?.form === undefined
        ? validate(json, args?.json, 'body')
        : validate(schemaFor(body.content, FORM_TYPE), args?.form, 'body'),
    )
  }
  return gather(checks)
}

/**
 * Validates the response's headers and JSON body against the declaration for its status (exact,
 * then `NXX`, then `default`). The body is read once and replayed.
 */
export async function checkResponse(route: RuntimeRoute, res: Response): Promise<ResponseCheck> {
  const declared =
    route.responses[String(res.status)] ?? route.responses[`${String(res.status)[0]}XX`] ?? route.responses['default']
  if (declared === undefined) return { issues: NONE, response: res }
  const headers = declared.headers === undefined ? NONE : await checkHeaders(declared.headers, res.headers)
  const schema = schemaFor(declared.content, JSON_TYPE)
  // `schema<T>()` validates nothing: leave the body unread.
  if (schema === undefined || !isStandard(schema)) return { issues: headers, response: res }
  const type = mediaTypeOf(res.headers) ?? ''
  if (!JSON_TYPE.test(type)) {
    return {
      issues: [...headers, { in: 'body', path: '', message: `Expected JSON, received ${type || 'nothing'}` }],
      response: res,
    }
  }
  const text = await res.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    const response = replay(res, text)
    return { issues: [...headers, { in: 'body', path: '', message: 'The body is not valid JSON' }], response }
  }
  const response = replay(res, text, { value: parsed })
  let checked = validate(schema, parsed, 'body')
  if (checked instanceof Promise) checked = await checked
  const issues = headers.length === 0 ? checked.issues : [...headers, ...checked.issues]
  return { issues, response, output: checked.value }
}

/**
 * Validates response headers against either an object schema (given a case-insensitive view of
 * the headers) or an OpenAPI Headers Object.
 */
async function checkHeaders(declared: unknown, headers: Headers): Promise<ValidationIssue[]> {
  if (!isObject(declared)) return NONE
  if (isStandard(declared)) {
    const view = new Proxy(
      {},
      {
        get: (_target, name) => (typeof name === 'string' ? (headers.get(name) ?? undefined) : undefined),
        has: (_target, name) => typeof name === 'string' && headers.has(name),
        ownKeys: () => [...headers.keys()],
        getOwnPropertyDescriptor: (_target, name) =>
          typeof name === 'string' && headers.has(name)
            ? { value: headers.get(name), enumerable: true, configurable: true }
            : undefined,
      },
    )
    return (await validate(declared, view, 'header')).issues
  }
  const issues = await Promise.all(
    Object.entries(declared).map(async ([name, header]) => {
      if (!isObject(header)) return []
      const value = headers.get(name)
      if (value === null) {
        return header['required'] === true ? [{ in: 'header' as const, path: name, message: 'Required' }] : []
      }
      return (await validate(header['schema'], value, 'header')).issues.map((issue) => ({
        ...issue,
        path: issue.path ? `${name}.${issue.path}` : name,
      }))
    }),
  )
  return issues.flat()
}
