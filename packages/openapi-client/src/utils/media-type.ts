import type { RuntimeRoute } from '../types/validation.js'

export const JSON_TYPE = /^application\/(?:[\w!#$%&*.^`~-]*\+)?json$/i

export const FORM_TYPE = /^(?:multipart\/form-data|application\/x-www-form-urlencoded)$/i

/** The media type of a `Content-Type` header, without its parameters (`; charset=utf-8`). */
export const mediaTypeOf = (headers: Headers): string | undefined => headers.get('content-type')?.split(';')[0]?.trim()

/** Whether a response says its body is JSON. */
export const isJson = (response: { readonly headers: Headers }): boolean => {
  const type = mediaTypeOf(response.headers)
  return type !== undefined && JSON_TYPE.test(type)
}

/** A route's request body JSON media type and form encoding. */
export function bodyFormatOf(route: RuntimeRoute): {
  readonly json?: string
  readonly form?: 'multipart' | 'urlencoded'
} {
  const types = Object.keys(route.request?.body?.content ?? {})
  const json = types.find((type) => JSON_TYPE.test(type))
  const form = types.includes('multipart/form-data')
    ? 'multipart'
    : types.includes('application/x-www-form-urlencoded')
      ? 'urlencoded'
      : undefined
  return { ...(json === undefined ? {} : { json }), ...(form === undefined ? {} : { form }) }
}
