/**
 * Simple logger utility
 */

export function createLogger(namespace: string) {
  return {
    info: (...args: unknown[]) => {
      console.log(`[${namespace}]`, ...args);
    },
    warn: (...args: unknown[]) => {
      console.warn(`[${namespace}]`, ...args);
    },
    error: (...args: unknown[]) => {
      console.error(`[${namespace}]`, ...args);
    },
    log: (...args: unknown[]) => {
      console.log(`[${namespace}]`, ...args);
    },
  };
}
