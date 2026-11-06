import { oc } from 'openapi-client'
import { routes } from './todo.routes.js'
import type { Client } from './todo.routes.js'

export const client: Client = oc(routes, '/')
