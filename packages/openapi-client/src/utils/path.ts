import { text } from './value.js'

/** The chain segments of a path template: `/users/{id}` is `users`, `:id`; `/` is `index`. */
export const chainOf = (template: string): string[] =>
  template
    .replace(/^\//, '')
    .split('/')
    .map((segment) => (segment === '' ? 'index' : segment.replace(/^\{(.+)\}$/, ':$1')))

/** The path of a call from its chain segments: `:id` filled in (encoded), `index` for `/`. */
export const pathOf = (segments: readonly string[], param: Readonly<Record<string, unknown>> | undefined): string =>
  segments
    .map((segment) =>
      segment === 'index'
        ? ''
        : segment.startsWith(':')
          ? encodeURIComponent(text(param?.[segment.slice(1)] ?? ''))
          : segment,
    )
    .join('/')
