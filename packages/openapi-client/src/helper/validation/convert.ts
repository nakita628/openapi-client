/**
 * `createRoute()` for Effect Schema: each Effect schema is converted to a Standard Schema at run
 * time (once per schema), while the types keep Effect's schemas, whose `Encoded`/`Type` are
 * cheaper to read than `~standard.types`.
 */

import { Schema } from 'effect'

import type { EffectRouteConfig } from '../../types/route.js'
import { isObject } from '../../utils/object.js'
import { createRoute as createBase } from '../route/index.js'

const converted = new WeakMap<object, unknown>()

/** An Effect schema as a Standard Schema; anything else unchanged. */
function standard(value: unknown): unknown {
  if (!isObject(value) || '~standard' in value || !Schema.isSchema(value)) return value
  let result = converted.get(value)
  if (result === undefined) {
    result = Schema.toStandardSchemaV1(value as unknown as Schema.Codec<unknown, unknown>)
    converted.set(value, result)
  }
  return result
}

/** Replaces the schema of each media type of a content, in place. */
function convertContent(content: unknown): void {
  if (!isObject(content)) return
  for (const media of Object.values(content)) {
    if (isObject(media) && 'schema' in media) media['schema'] = standard(media['schema'])
  }
}

/** Replaces the schemas of a response, a request body or a parameter, in place. */
function convertObject(value: unknown): void {
  if (!isObject(value) || Schema.isSchema(value)) return
  convertContent(value['content'])
  if ('schema' in value) value['schema'] = standard(value['schema'])
  if ('headers' in value) {
    const headers = value['headers']
    if (Schema.isSchema(headers)) value['headers'] = standard(headers)
    else if (isObject(headers)) for (const header of Object.values(headers)) convertObject(header)
  }
}

/** Declares a route with Effect schemas, converting them to Standard Schemas in place. */
export function createRoute<const R extends EffectRouteConfig>(route: R): R {
  const request = route.request as Record<string, unknown> | undefined
  if (request !== undefined) {
    for (const part of ['params', 'query', 'headers', 'cookies']) {
      if (part in request) request[part] = standard(request[part])
    }
    convertObject(request['body'])
  }
  for (const response of Object.values(route.responses)) convertObject(response)
  return createBase(route as never) as R
}
