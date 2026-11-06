import { describe, expect, it } from 'vite-plus/test'

import { toType } from './typescript.js'
import type { TypeContext } from './typescript.js'

const context: TypeContext = {
  names: new Map([['User', 'User']]),
  resolve: (ref) => (ref === '#/$defs/Id' ? { type: 'string' } : undefined),
}

describe('toType', () => {
  it.each([
    [{ type: 'string' }, 'string'],
    [{ type: 'integer' }, 'number'],
    [{ type: 'boolean' }, 'boolean'],
    [{ type: 'null' }, 'null'],
    [{ type: ['string', 'null'] }, 'string | null'],
    [{ type: 'string', nullable: true }, 'string | null'],
    [{ type: 'string', format: 'binary' }, 'string'],
    [{ enum: ['a', 'b c', 1, null] }, '"a" | "b c" | 1 | null'],
    [{ const: 'x' }, '"x"'],
    [{ $ref: '#/components/schemas/User' }, 'User'],
    [{ $ref: '#/$defs/Id' }, 'string'],
    [{ $ref: 'other.yaml#/User' }, 'unknown'],
    [{ type: 'array', items: { type: 'string' } }, 'string[]'],
    [{ type: 'array', items: { type: ['string', 'number'] } }, '(string | number)[]'],
    [{ type: 'array' }, 'unknown[]'],
    [{ type: 'array', prefixItems: [{ type: 'string' }, { type: 'number' }], items: false }, '[string, number]'],
    [{ type: 'array', prefixItems: [{ type: 'string' }] }, '[string, ...unknown[]]'],
    [{ type: 'array', items: [{ type: 'string' }], additionalItems: false, minItems: 0 }, '[string?]'],
    [{ type: 'object' }, '{ [key: string]: unknown }'],
    [{ type: 'object', additionalProperties: false }, '{}'],
    [
      { type: 'object', properties: { a: { type: 'string' }, 'b-c': { type: 'number' } }, required: ['a'] },
      '{ a: string; "b-c"?: number }',
    ],
    [{ type: 'object', additionalProperties: { type: 'number' } }, '{ [key: string]: number }'],
    [
      { type: 'object', properties: { a: { type: 'string' } }, additionalProperties: { type: 'number' } },
      '{ a?: string } & { [key: string]: number }',
    ],
    [{ properties: { a: { type: 'string' } } }, '{ a?: string }'],
    [{ oneOf: [{ type: 'string' }, { type: 'number' }] }, 'string | number'],
    [{ anyOf: [{ type: 'string' }, { type: 'null' }] }, 'string | null'],
    [
      { allOf: [{ $ref: '#/components/schemas/User' }, { properties: { b: { type: 'string' } } }] },
      'User & { b?: string }',
    ],
    [{ type: 'object', oneOf: [{ $ref: '#/components/schemas/User' }, { type: 'string' }] }, 'User | string'],
    [{ allOf: [{ oneOf: [{ const: 1 }, { const: 2 }] }, { type: 'number' }] }, '(1 | 2) & number'],
    [{ properties: { a: { type: 'string', description: 'The A', deprecated: true } } }, '{ a?: string }'],
    [{}, 'unknown'],
    [true, 'unknown'],
    [false, 'never'],
  ])('writes %j as %s', (schema, type) => {
    expect(toType(schema, context)).toBe(type)
  })

  it('writes a form field binary as a Blob', () => {
    expect(toType({ type: 'string', format: 'binary' }, { ...context, form: true })).toBe('Blob')
    expect(toType({ type: 'string', format: 'binary' }, { ...context, form: true, binary: 'File' })).toBe('File')
  })

  it('stops at a local $ref that refers to itself', () => {
    expect(toType({ $ref: '#/a' }, { names: new Map(), resolve: () => ({ $ref: '#/a' }) })).toBe('unknown')
  })
})
