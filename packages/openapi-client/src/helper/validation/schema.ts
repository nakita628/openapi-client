import { isObject } from '../../utils/object.js'

/** Whether a value is a Standard Schema (callable ones included). */
export const isStandard = (value: unknown): boolean => isObject(value) && '~standard' in value

export type StandardIssue = {
  readonly message: string
  readonly path?: readonly (PropertyKey | { readonly key: PropertyKey })[] | undefined
}

export type StandardResult = { readonly value?: unknown; readonly issues?: readonly StandardIssue[] }

export type Validate = (value: unknown) => StandardResult | Promise<StandardResult>

/** A Standard Schema's `validate`; undefined for `schema<T>()`. */
export function validatorOf(schema: unknown): Validate | undefined {
  const standard = isObject(schema) ? schema['~standard'] : undefined
  return isObject(standard) && typeof standard['validate'] === 'function'
    ? (standard['validate'] as Validate)
    : undefined
}
