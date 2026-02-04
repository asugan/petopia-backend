import { NextFunction, Request, Response } from 'express';
import { ZodError, ZodSchema } from 'zod';
import { createError } from './errorHandler';
import { AuthenticatedRequest } from './auth';

export const validate = (
  schema: ZodSchema,
  source: 'body' | 'query' | 'params' = 'body'
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = req[source] as unknown;
      const validatedData = schema.parse(data);

      // Query validation: req.query is read-only getter, use new property
      if (source === 'query') {
        (req as AuthenticatedRequest).validatedQuery = validatedData as Record<string, unknown>;
        next();
        return;
      }

      // Params validation: also use separate property to avoid read-only issues if any
      if (source === 'params') {
        (req as AuthenticatedRequest).validatedParams = validatedData as Record<string, unknown>;
        // Also keep updating params for backward compatibility if it's writable
        try {
          (req as unknown as Record<string, unknown>)[source] = validatedData;
        } catch (e) {
          // Ignore if read-only
        }
        next();
        return;
      }

      // Body validation: replace existing data (usually writable)
      (req as unknown as Record<string, unknown>)[source] = validatedData;

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.issues.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));

        next(
          createError('Validation failed', 400, 'VALIDATION_ERROR', details)
        );
      } else {
        next(error);
      }
    }
  };
};

// Alias for backward compatibility
export const validateRequest = validate;
