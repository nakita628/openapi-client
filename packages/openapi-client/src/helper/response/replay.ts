/**
 * Makes a response whose body was already read readable again. The prototype is swapped rather
 * than copying, so the response keeps its `url`, `redirected` and `type`; a copy is only made
 * lazily for readers other than `json()`.
 */

const STATE = Symbol('openapi-client.replay')

type State = {
  readonly text: string
  /** The already-parsed JSON body; undefined when it was not parsable. */
  readonly parsed: { readonly value: unknown } | undefined
  /** Whether `json()` read it. */
  read: boolean
  /** A lazily made `Response` of the text, for the other readers. */
  copy: Response | undefined
}

type Replayed = Response & { [STATE]: State }

function consumed() {
  return Promise.reject(new TypeError('Body has already been consumed.'))
}

function copyOf(response: Replayed): Response {
  const state = response[STATE]
  state.copy ??= new Response(state.text, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
  return state.copy
}

/** A reader delegated to the copy; rejects once `json()` has been read. */
function delegate<K extends 'text' | 'blob' | 'arrayBuffer' | 'bytes' | 'formData'>(name: K) {
  return function (this: Replayed) {
    return this[STATE].read ? consumed() : copyOf(this)[name]()
  }
}

const REPLAY: object = Object.create(Response.prototype, {
  json: {
    value(this: Replayed) {
      const state = this[STATE]
      if (state.read || state.copy?.bodyUsed) return consumed()
      state.read = true
      return state.parsed === undefined
        ? Promise.resolve().then(() => JSON.parse(state.text))
        : Promise.resolve(state.parsed.value)
    },
  },
  text: { value: delegate('text') },
  blob: { value: delegate('blob') },
  arrayBuffer: { value: delegate('arrayBuffer') },
  bytes: { value: delegate('bytes') },
  formData: { value: delegate('formData') },
  body: {
    get(this: Replayed) {
      return copyOf(this).body
    },
  },
  bodyUsed: {
    get(this: Replayed) {
      const state = this[STATE]
      return state.read || (state.copy?.bodyUsed ?? false)
    },
  },
  clone: {
    value(this: Replayed) {
      if (this[STATE].read) throw new TypeError('Response.clone: Body has already been consumed.')
      return copyOf(this).clone()
    },
  },
})

/**
 * Makes `response` readable again from `text`; `parsed` is what `json()` returns. Falls back to a
 * new `Response` when the original is from another realm or not extensible.
 */
export function replay(response: Response, text: string, parsed?: { readonly value: unknown }): Response {
  const state: State = { text, parsed, read: false, copy: undefined }
  if (response instanceof Response && Object.isExtensible(response)) {
    Object.defineProperty(response, STATE, { value: state })
    Object.setPrototypeOf(response, REPLAY)
    return response
  }
  const copy = new Response(text, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
  Object.defineProperty(copy, STATE, { value: state })
  Object.setPrototypeOf(copy, REPLAY)
  return copy
}

/** Whether a response has a body, without forcing a replayed response's copy. */
export function hasBody(response: Response | { readonly body: unknown }): boolean {
  return STATE in response ? (response as Replayed)[STATE].text !== '' : response.body !== null
}
