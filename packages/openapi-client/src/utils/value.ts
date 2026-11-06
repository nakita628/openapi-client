/** Whether a value is sent: `undefined` and `null` are left out. */
export const present = (value: unknown): boolean => value !== undefined && value !== null

/** A value as text: a `Date` as ISO 8601. */
export const text = (value: unknown): string => (value instanceof Date ? value.toISOString() : String(value))

/** The default query builder: repeats the key for arrays, skips `undefined` and `null`. */
export const buildSearchParams = (query: Readonly<Record<string, unknown>>): URLSearchParams => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : [value]) if (present(item)) params.append(key, text(item))
  }
  return params
}

/** A form as `FormData` (multipart, the default), or `URLSearchParams` (urlencoded). */
export const formOf = (form: Readonly<Record<string, unknown>>, encoding: 'multipart' | 'urlencoded'): BodyInit => {
  const data = encoding === 'urlencoded' ? new URLSearchParams() : new FormData()
  for (const [key, value] of Object.entries(form)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (!present(item)) continue
      if (item instanceof Blob && data instanceof FormData) data.append(key, item)
      else data.append(key, text(item))
    }
  }
  return data
}
