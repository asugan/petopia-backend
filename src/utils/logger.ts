/* eslint-disable no-console */
class Logger {
  error(message: string, ...args: unknown[]): void {
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    console.info(`[INFO] ${new Date().toISOString()} - ${message}`, ...args);
  }

  debug(message: string, ...args: unknown[]): void {
    console.debug(`[DEBUG] ${new Date().toISOString()} - ${message}`, ...args);
  }
}

export const logger = new Logger();
