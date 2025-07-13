#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { server } from './server'

server.connect(new StdioServerTransport()).catch(() => {
  process.exit(1)
})
