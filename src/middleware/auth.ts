import { NextFunction, Request, Response } from 'express';
import { auth } from '../lib/auth';
import { fromNodeHeaders } from 'better-auth/node';
import { createError } from './errorHandler';

/**
 * Extended Request interface with authenticated user data
 */
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
    emailVerified: boolean;
    image?: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  session?: {
    id: string;
    userId: string;
    token: string;
    expiresAt: Date;
    ipAddress?: string | null;
    userAgent?: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
}

/**
 * Middleware that requires authentication.
 * Returns 401 if no valid session is found.
 */
export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
      return;
    }

    // Attach user and session to request
    req.user = session.user;
    req.session = session.session;
    next();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Auth middleware error:', error);
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired session',
      },
    });
  }
}

/**
 * Middleware that optionally attaches user data if authenticated.
 * Allows unauthenticated requests to continue.
 */
export async function optionalAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (session) {
      req.user = session.user;
      req.session = session.session;
    }
    next();
  } catch {
    // Silently continue without auth on error
    next();
  }
}

/**
 * Middleware that requires a valid internal API key.
 * Used for internal/cron endpoints that should not be accessible to regular users.
 * The API key should be passed in the X-Internal-API-Key header.
 */
export function requireInternalApiKey(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const apiKey = req.headers['x-internal-api-key'];
  const expectedKey = process.env.INTERNAL_API_KEY;

  if (!expectedKey) {
    // eslint-disable-next-line no-console
    console.error('INTERNAL_API_KEY environment variable is not configured');
    res.status(500).json({
      success: false,
      error: {
        code: 'CONFIG_ERROR',
        message: 'Internal API key not configured',
      },
    });
    return;
  }

  if (!apiKey || apiKey !== expectedKey) {
    res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Invalid or missing API key',
      },
    });
    return;
  }

  next();
}

/**
 * Helper function to get authenticated user ID with proper error handling
 * @param req - AuthenticatedRequest object
 * @returns User ID string
 * @throws Error if user is not authenticated
 */
export const requireAuth = (req: AuthenticatedRequest): string => {
  if (!req.user?.id) {
    throw createError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return req.user.id;
};

/**
 * Helper function to get parameter from request with proper error handling
 * @param param - Parameter value from req.params or req.query
 * @param paramName - Name of the parameter for error messages
 * @returns Parameter value
 * @throws Error if parameter is missing
 */
export const requireParam = (param: string | undefined, paramName: string): string => {
  if (!param) {
    throw createError(`${paramName} is required`, 400, 'BAD_REQUEST');
  }
  return param;
};
