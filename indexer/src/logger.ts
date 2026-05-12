// indexer/src/logger.ts — pino logger.
//
// LOG_LEVEL env (trace/debug/info/warn/error) controls verbosity. We pin
// `formatters.level` so log lines emit `{"level":"info",...}` instead of
// pino's default numeric level — easier to grep in Render logs and matches
// the `::warning::` annotation idiom used elsewhere.

import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
});

export type Logger = typeof logger;
