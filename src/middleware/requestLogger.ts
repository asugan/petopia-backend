import morgan from 'morgan';
import { Request, Response } from 'express';

const REDACTED_KEYS = new Set([
  'password',
  'token',
  'expoPushToken',
  'authorization',
  'cookie',
  'accessToken',
  'refreshToken',
  'secret',
]);

const redact = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(item => redact(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};

  for (const [key, nestedValue] of Object.entries(input)) {
    output[key] = REDACTED_KEYS.has(key)
      ? '[REDACTED]'
      : redact(nestedValue);
  }

  return output;
};

// Custom Morgan format for API logging
morgan.token('body', (req: Request) => {
  if (req.method === 'POST' || req.method === 'PUT') {
    return JSON.stringify(redact(req.body));
  }
  return '-';
});

const format =
  ':method :url :status :res[content-length] - :response-time ms :body';

export const requestLogger = morgan(format, {
  skip: (req: Request, _res: Response) => {
    // Skip logging for health checks in production
    return process.env.NODE_ENV === 'production' && req.url === '/health';
  },
});
