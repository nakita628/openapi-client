import type { ValidationIssue, ValidationLocation } from '../../types/validation.js'

const PARTS: Readonly<Record<ValidationLocation, string>> = {
  path: 'path parameters',
  query: 'query parameters',
  header: 'headers',
  cookie: 'cookies',
  body: 'body',
}

/** An RFC 9457 Problem Details response: 422 for the request, 502 for the response. */
export function problem(status: 422 | 502, instance: string, errors: readonly ValidationIssue[]): Response {
  const title = status === 422 ? 'Unprocessable Content' : 'Bad Gateway'
  const parts = [...new Set(errors.map((error) => PARTS[error.in]))].join(', ')
  const detail = status === 422 ? `Invalid ${parts}.` : `The response does not match the route: invalid ${parts}.`
  const body = { type: 'about:blank', title, status, detail, instance, errors }
  return new Response(JSON.stringify(body), {
    status,
    statusText: title,
    headers: { 'Content-Type': 'application/problem+json' },
  })
}
