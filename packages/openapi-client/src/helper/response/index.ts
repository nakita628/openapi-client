/** Reading response bodies, and the `DetailedError` thrown for failed calls. */

import type { ClientResponse, ParsedResponse, ResponseBodyType } from '../../types/response.js'
import { isJson } from '../../utils/media-type.js'
import { NULL_BODY_STATUSES, REASONS } from '../../utils/status.js'
import { hasBody } from './replay.js'

/** A failed call: a non-`ok` response, or (from an alias) a request that got no response. */
export class DetailedError extends Error {
  /** The parsed response body and status text. */
  readonly detail: { readonly data: unknown; readonly statusText: string } | undefined
  readonly statusCode: number | undefined
  /** `NETWORK`, `TIMEOUT` or `ABORTED` for a request that got no response. */
  readonly code: string | undefined
  /** Extra data for errors constructed by hand. */
  readonly log: unknown
  /** The alias that threw it, if any. */
  readonly alias: string | undefined

  constructor(
    message: string,
    options: {
      readonly detail?: { readonly data: unknown; readonly statusText: string }
      readonly statusCode?: number
      readonly code?: string
      readonly log?: unknown
      readonly alias?: string
      readonly cause?: unknown
    } = {},
  ) {
    super(message, 'cause' in options ? { cause: options.cause } : undefined)
    this.name = 'DetailedError'
    this.detail = options.detail
    this.statusCode = options.statusCode
    this.code = options.code
    this.log = options.log
    this.alias = options.alias
  }
}

/** Reads a call's body by its `Content-Type`; throws `DetailedError` when the response is not `ok`. */
export async function parseResponse<T extends ClientResponse<any, any, any>>(
  response: T | Promise<T>,
): Promise<ParsedResponse<T>> {
  const res = await response
  let data: unknown
  if (hasBody(res) && !NULL_BODY_STATUSES.has(res.status)) {
    data = isJson(res) ? await res.json() : await res.text()
  }
  if (!res.ok) throw failure(res, data)
  return data as ParsedResponse<T>
}

/** The `DetailedError` of a non-`ok` response. */
export function failure(res: Response | ClientResponse<unknown>, data: unknown, alias?: string): DetailedError {
  const statusText = res.statusText || REASONS[res.status] || ''
  return new DetailedError(statusText ? `${res.status} ${statusText}` : String(res.status), {
    statusCode: res.status,
    detail: { data, statusText },
    ...(alias === undefined ? {} : { alias }),
  })
}

/** The `DetailedError` of a request that got no response. */
export function unanswered(error: unknown, alias: string): DetailedError {
  const name = error instanceof Error ? error.name : undefined
  const code = name === 'TimeoutError' ? 'TIMEOUT' : name === 'AbortError' ? 'ABORTED' : 'NETWORK'
  const message = error instanceof Error ? error.message : String(error)
  return new DetailedError(`${code}: ${message}`, { code, alias, cause: error })
}

/** Reads a body as `responseType` says; `auto` picks JSON, text or `Blob` by `Content-Type`. */
export async function readBody(
  res: Response,
  method: string,
  responseType: ResponseBodyType = 'auto',
): Promise<unknown> {
  switch (responseType) {
    case 'text':
      return res.text()
    case 'blob':
      return res.blob()
    case 'arrayBuffer':
      return res.arrayBuffer()
    case 'formData':
      return res.formData()
    case 'stream':
      return res.body
  }
  if (method === 'head' || NULL_BODY_STATUSES.has(res.status) || !hasBody(res)) return undefined
  if (responseType === 'json' || isJson(res)) {
    const text = await res.text()
    return text === '' ? undefined : JSON.parse(text)
  }
  const type = res.headers.get('content-type') ?? ''
  if (!type || type.startsWith('text/') || type.includes('xml') || type.includes('x-www-form-urlencoded')) {
    return res.text()
  }
  return res.blob()
}
