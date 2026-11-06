import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { parseArgs } from 'node:util'

import { parseOpenAPI } from 'oas-truth'

import { generate, SCHEMA_LIBRARIES } from './index.js'
import type { SchemaLibrary } from './index.js'

export const USAGE = `Usage: openapi-client-gen <input> -o <routes.ts> [options]

  <input>               an OpenAPI (.yaml, .yml, .json) or TypeSpec (.tsp) document
  -o, --output <file>   the routes file (each route with schema<T>())
  --schema <library>    declare each schema with zod, valibot or arktype: the client checks
                        requests and responses against them
  --client <file>       also write the client, its type written out: oc(routes, baseUrl)
  --base-url <url>      the client's base URL ('/' by default)
  --no-aliases          the client typed only: const client: Client = oc(baseUrl), no aliases
  -h, --help            this help`

/** What `run` answers: the message to print, and whether it succeeded. */
export type CliResult =
  | { readonly ok: true; readonly message: string }
  | { readonly ok: false; readonly message: string }

const INPUT = /\.(?:ya?ml|json|tsp)$/u

/** Runs the CLI on its arguments (without `node` and the script). */
export async function run(args: readonly string[]): Promise<CliResult> {
  const parsed = (() => {
    try {
      return parseArgs({
        args: [...args],
        allowPositionals: true,
        allowNegative: true,
        options: {
          output: { type: 'string', short: 'o' },
          client: { type: 'string' },
          'base-url': { type: 'string' },
          schema: { type: 'string' },
          aliases: { type: 'boolean', default: true },
          help: { type: 'boolean', short: 'h' },
        },
      })
    } catch (error) {
      return error instanceof Error ? error : new Error(String(error))
    }
  })()
  if (parsed instanceof Error) return { ok: false, message: `${parsed.message}\n\n${USAGE}` }
  const { values, positionals } = parsed
  if (values.help === true) return { ok: true, message: USAGE }
  const [input] = positionals
  if (input === undefined || !INPUT.test(input)) {
    return { ok: false, message: `The input must be a .yaml, .yml, .json or .tsp file\n\n${USAGE}` }
  }
  if (values.output === undefined || !values.output.endsWith('.ts')) {
    return { ok: false, message: `The output (-o) must be a .ts file\n\n${USAGE}` }
  }
  if (values.client !== undefined && !values.client.endsWith('.ts')) {
    return { ok: false, message: `The client must be a .ts file\n\n${USAGE}` }
  }
  const schema = SCHEMA_LIBRARIES.find((library): library is SchemaLibrary => library === values.schema)
  if (values.schema !== undefined && schema === undefined) {
    return { ok: false, message: `The schema must be one of ${SCHEMA_LIBRARIES.join(', ')}\n\n${USAGE}` }
  }

  const document = await parseOpenAPI(input)
  if (!document.ok) return { ok: false, message: document.error }
  try {
    const files = await generate(document.value, {
      output: values.output,
      ...(schema === undefined ? {} : { schema }),
      ...(values.client === undefined
        ? {}
        : {
            client: {
              output: values.client,
              aliases: values.aliases,
              ...(values['base-url'] === undefined ? {} : { baseUrl: values['base-url'] }),
            },
          }),
    })
    for (const [file, code] of files) {
      await mkdir(dirname(file), { recursive: true })
      await writeFile(file, code)
    }
    return { ok: true, message: [...files.keys()].map((file) => `Generated ${file}`).join('\n') }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}
