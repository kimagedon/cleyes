/**
 * Minimal logger with level control.
 * In production (VITE_ENV=production), debug logs are suppressed.
 * Centralizing all logging here makes it easy to add remote logging or silencing.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const MIN_LEVEL: LogLevel =
  import.meta.env.MODE === 'production' ? 'warn' : 'debug';

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[MIN_LEVEL];
}

export const logger = {
  debug: (tag: string, ...args: unknown[]) => {
    if (shouldLog('debug')) {
      // eslint-disable-next-line no-console
      console.debug(`[${tag}]`, ...args);
    }
  },
  info: (tag: string, ...args: unknown[]) => {
    if (shouldLog('info')) {
      // eslint-disable-next-line no-console
      console.info(`[${tag}]`, ...args);
    }
  },
  warn: (tag: string, ...args: unknown[]) => {
    if (shouldLog('warn')) {
      // eslint-disable-next-line no-console
      console.warn(`[${tag}]`, ...args);
    }
  },
  error: (tag: string, ...args: unknown[]) => {
    if (shouldLog('error')) {
      // eslint-disable-next-line no-console
      console.error(`[${tag}]`, ...args);
    }
  },
};
