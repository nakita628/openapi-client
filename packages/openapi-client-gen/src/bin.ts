#!/usr/bin/env node
import process from 'node:process'

import { run } from './cli.js'

const result = await run(process.argv.slice(2))
if (result.ok) process.stdout.write(`${result.message}\n`)
else {
  process.stderr.write(`${result.message}\n`)
  process.exitCode = 1
}
