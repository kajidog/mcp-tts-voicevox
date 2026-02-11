#!/usr/bin/env node

import { connectStdio } from '@kajidog/mcp-core'
import { server } from './server.js'

connectStdio(server).catch(() => {
  process.exit(1)
})
