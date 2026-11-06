/** The alias of an operationId (`list-pets` -> `listPets`); separators must match `AliasOf`'s. */
export const aliasOf = (operationId: string): string => {
  const words = operationId.split(/[ !"#%&'()*+,\-./:;<=>?@[\\\]^`{|}~]+/u).filter((word) => word !== '')
  const joined = words
    .map((word, index) => (index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join('')
  return /^[0-9]/u.test(joined) ? `_${joined}` : joined
}

/** The alias of a route's `operationId`, if any. */
export const routeAliasOf = (route: object): string | undefined => {
  const operationId = (route as { readonly operationId?: unknown }).operationId
  if (typeof operationId !== 'string') return undefined
  const alias = aliasOf(operationId)
  return alias === '' ? undefined : alias
}
