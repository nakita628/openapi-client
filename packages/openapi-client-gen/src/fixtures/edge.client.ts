import { oc } from 'openapi-client'
import type { Client } from './edge.routes.js'

export const client: Client = oc('/')
