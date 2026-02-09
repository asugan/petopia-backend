export const DEFAULT_TIMEZONE = 'UTC';

export function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function sanitizeTimezone(timezone?: string | null): string | undefined {
  const trimmed = timezone?.trim();
  if (!trimmed) {
    return undefined;
  }

  return isValidTimezone(trimmed) ? trimmed : undefined;
}

export function resolveEffectiveTimezone(options: {
  clientTimezone?: string | null;
  userTimezone?: string | null;
  fallback?: string;
}): string {
  const fallback = sanitizeTimezone(options.fallback) ?? DEFAULT_TIMEZONE;

  return (
    sanitizeTimezone(options.clientTimezone) ??
    sanitizeTimezone(options.userTimezone) ??
    fallback
  );
}
