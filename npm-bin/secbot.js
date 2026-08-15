#!/usr/bin/env node

const { start } = require('../scripts/run-product.js');

start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(`[secbot] ${error.message}`);
  process.exit(1);
});

