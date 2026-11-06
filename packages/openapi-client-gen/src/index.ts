/** openapi-client-gen: an openapi-client routes file and client from an OpenAPI document. */

import { format } from 'oxfmt'
import type { FormatConfig } from 'oxfmt'

import { generateClient, generateRoutes } from './generate.js'
import type { GenerateOptions } from './generate.js'
import { isJson } from './typescript.js'

export { generateClient, generateRoutes } from './generate.js'
export { SCHEMA_LIBRARIES } from './generate.js'
export type { GenerateOptions, SchemaLibrary } from './generate.js'
export { toType } from './typescript.js'
export type { TypeContext } from './typescript.js'

const FORMAT: FormatConfig = { printWidth: 100, singleQuote: true, semi: false }

async function formatted(file: string, source: string, config: FormatConfig): Promise<string> {
  const { code, errors } = await format(file, source, config)
  if (errors.length > 0) throw new Error(`${file}: ${errors.map((error) => error.message).join('\n')}`)
  return code
}

/** The files to write, by path: the routes, and the client when it is asked for. Formatted with oxfmt. */
export async function generate(
  document: unknown,
  options: GenerateOptions & { readonly format?: FormatConfig },
): Promise<Map<string, string>> {
  if (!isJson(document)) throw new Error('The document is not an object')
  const config = { ...FORMAT, ...options.format }
  const files = new Map([[options.output, await formatted(options.output, generateRoutes(document, options), config)]])
  const client = generateClient(options, document)
  if (client !== undefined && options.client !== undefined) {
    files.set(options.client.output, await formatted(options.client.output, client, config))
  }
  return files
}
