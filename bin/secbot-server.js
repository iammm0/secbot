#!/usr/bin/env node

/** 仅启动 HTTP 后端（供 API / CI / 自动化使用）；完整产品请使用 `secbot`。 */
require('../server/dist/main.js');

