/**
 * JSON Schema to TypeScript type, as the value on the wire. What a type cannot say (`minLength`,
 * `pattern`, `format`, ...) is left out.
 */

/** A JSON object. */
export type Json = { readonly [key: string]: unknown }

export const isJson = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const listOf = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : [])

/** What `toType` needs beside the schema. */
export type TypeContext = {
  /** The type name of each `components.schemas` entry, by its key in the document. */
  readonly names: ReadonlyMap<string, string>
  /** What a local `$ref` that is not a component schema points to. */
  readonly resolve: (ref: string) => unknown
  /** A form field's binary (`format: binary`) is a `Blob`; anywhere else it is a string. */
  readonly form?: boolean
  /** A form binary's type: `Blob` by default, `File` with a schema library (its file schemas reject a plain `Blob`). */
  readonly binary?: 'Blob' | 'File'
}

/** What `type: object` or `type: array` is without any other keyword. */
const BARE = new Set(['{}', '{ [key: string]: unknown }', 'unknown[]'])

const SCHEMA_REF = '#/components/schemas/'

/** The key of a `#/components/schemas/` `$ref`, its JSON Pointer and percent escapes undone. */
export function schemaKeyOf(ref: string): string | undefined {
  if (!ref.startsWith(SCHEMA_REF)) return undefined
  const key = ref.slice(SCHEMA_REF.length).replaceAll('~1', '/').replaceAll('~0', '~')
  try {
    return decodeURIComponent(key)
  } catch {
    return key
  }
}

/** A property key as TypeScript writes it: bare when it is an identifier, quoted otherwise. */
export const keyOf = (key: string) => (/^[A-Za-z_$][\w$]*$/u.test(key) ? key : JSON.stringify(key))

/** A union or intersection member, or an array item: parenthesized when it is itself a union or intersection. */
const operand = (type: string) => (hasTopLevelOperator(type) ? `(${type})` : type)

/** A `|` or `&` outside any bracket and any string literal. */
function hasTopLevelOperator(type: string): boolean {
  let depth = 0
  let quoted = false
  let escaped = false
  for (const char of type) {
    if (escaped) escaped = false
    else if (quoted) {
      if (char === '\\') escaped = true
      else if (char === '"') quoted = false
    } else if (char === '"') quoted = true
    else if ('{[(<'.includes(char)) depth += 1
    else if ('}])>'.includes(char)) depth -= 1
    else if (depth === 0 && (char === '|' || char === '&')) return true
  }
  return false
}

/** The union of types, written once each; `unknown` absorbs, `never` drops. */
export const union = (types: readonly string[]) => {
  const unique = [...new Set(types)]
  if (unique.includes('unknown')) return 'unknown'
  const members = unique.filter((type) => type !== 'never')
  if (members.length <= 1) return members[0] ?? 'never'
  return members.map(operand).join(' | ')
}

const intersection = (types: readonly string[]) => {
  const members = [...new Set(types)].filter((type) => type !== 'unknown')
  if (members.includes('never')) return 'never'
  if (members.length <= 1) return members[0] ?? 'unknown'
  return members.map(operand).join(' & ')
}

const literalOf = (value: unknown): string =>
  value === null || typeof value !== 'object' ? JSON.stringify(value) : 'unknown'

const TYPES = ['string', 'number', 'integer', 'boolean', 'null', 'array', 'object'] as const

type SimpleType = (typeof TYPES)[number]

const isSimpleType = (value: unknown): value is SimpleType => TYPES.some((type) => type === value)

/** The types a schema declares, or the ones its keywords imply (`properties` an object, ...). */
function typesOf(schema: Json): SimpleType[] {
  const declared = Array.isArray(schema['type']) ? schema['type'] : [schema['type']]
  const types = declared.filter(isSimpleType)
  if (types.length > 0) return types
  const implied: SimpleType[] = [
    ...(schema['properties'] !== undefined || schema['additionalProperties'] !== undefined ? ['object' as const] : []),
    ...(schema['items'] !== undefined || schema['prefixItems'] !== undefined ? ['array' as const] : []),
  ]
  return implied
}

function objectType(schema: Json, context: TypeContext, seen: ReadonlySet<string>): string {
  const properties = isJson(schema['properties']) ? schema['properties'] : {}
  const required = new Set(listOf(schema['required']).filter((key) => typeof key === 'string'))
  const fields = Object.entries(properties).map(
    ([key, value]) => `${keyOf(key)}${required.has(key) ? '' : '?'}: ${toType(value, context, seen)}`,
  )
  const additional = schema['additionalProperties'] ?? (isJson(schema['patternProperties']) ? true : undefined)
  const patterns = isJson(schema['patternProperties']) ? Object.values(schema['patternProperties']) : []
  const rest =
    additional === false
      ? undefined
      : additional === true || additional === undefined
        ? fields.length === 0
          ? 'unknown'
          : undefined
        : union([toType(additional, context, seen), ...patterns.map((value) => toType(value, context, seen))])
  const object = fields.length === 0 ? undefined : `{ ${fields.join('; ')} }`
  const record = rest === undefined ? undefined : `{ [key: string]: ${rest} }`
  if (object !== undefined && record !== undefined) {
    // A declared property's type must be one of the index signature's: the rest stays apart.
    return rest === 'unknown' ? object : `${object} & ${record}`
  }
  return object ?? record ?? '{}'
}

function arrayType(schema: Json, context: TypeContext, seen: ReadonlySet<string>): string {
  const items = schema['items']
  // Draft-04's tuple: `items` as an array, `additionalItems` the rest.
  const prefix = Array.isArray(schema['prefixItems']) ? schema['prefixItems'] : Array.isArray(items) ? items : undefined
  const rest = Array.isArray(items) ? schema['additionalItems'] : items
  if (prefix !== undefined) {
    const minItems = typeof schema['minItems'] === 'number' ? schema['minItems'] : prefix.length
    const members = prefix.map((item, index) => `${toType(item, context, seen)}${index < minItems ? '' : '?'}`)
    const spread =
      rest === false
        ? []
        : [`...${operand(rest === undefined || rest === true ? 'unknown' : toType(rest, context, seen))}[]`]
    return `[${[...members, ...spread].join(', ')}]`
  }
  return `${operand(items === undefined || items === true ? 'unknown' : toType(items, context, seen))}[]`
}

function simpleType(type: SimpleType, schema: Json, context: TypeContext, seen: ReadonlySet<string>): string {
  switch (type) {
    case 'string':
      return context.form === true && (schema['format'] === 'binary' || schema['contentMediaType'] !== undefined)
        ? (context.binary ?? 'Blob')
        : 'string'
    case 'number':
    case 'integer':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'null':
      return 'null'
    case 'array':
      return arrayType(schema, context, seen)
    case 'object':
      return objectType(schema, context, seen)
  }
}

/**
 * The TypeScript type of a schema. A component schema is named by its type (`User`), so that a
 * recursive one stays a reference; any other local `$ref` is written in place.
 */
export function toType(schema: unknown, context: TypeContext, seen: ReadonlySet<string> = new Set()): string {
  if (schema === true) return 'unknown'
  if (schema === false) return 'never'
  if (!isJson(schema)) return 'unknown'

  const ref = schema['$ref']
  if (typeof ref === 'string') {
    const key = schemaKeyOf(ref)
    const name = key === undefined ? undefined : context.names.get(key)
    if (name !== undefined) return name
    if (seen.has(ref) || !ref.startsWith('#/')) return 'unknown'
    return toType(context.resolve(ref), context, new Set([...seen, ref]))
  }

  const nullable = schema['nullable'] === true
  const withNull = (type: string) => (nullable ? union([type, 'null']) : type)

  if (schema['const'] !== undefined) return withNull(literalOf(schema['const']))
  if (Array.isArray(schema['enum'])) return withNull(union(schema['enum'].map(literalOf)))

  // `oneOf` / `anyOf` a union, `allOf` an intersection, over what the schema says beside them.
  const choices = [...listOf(schema['oneOf']), ...listOf(schema['anyOf'])]
  const all = listOf(schema['allOf'])
  const types = typesOf(schema)
  const own = types.length === 0 ? undefined : union(types.map((type) => simpleType(type, schema, context, seen)))
  const parts = [
    // A bare `type: object` beside them says nothing they do not.
    ...(own === undefined || (BARE.has(own) && (choices.length > 0 || all.length > 0)) ? [] : [own]),
    ...all.map((member) => toType(member, context, seen)),
    ...(choices.length === 0 ? [] : [union(choices.map((member) => toType(member, context, seen)))]),
  ]
  return withNull(parts.length === 0 ? 'unknown' : intersection(parts))
}
