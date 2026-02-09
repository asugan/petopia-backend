import { fromZonedTime, toZonedTime } from 'date-fns-tz';

export interface QuietHoursWindow {
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
}

export const DEFAULT_QUIET_HOURS: QuietHoursWindow = {
  startHour: 22,
  startMinute: 0,
  endHour: 8,
  endMinute: 0,
};

export function isInQuietHours(
  date: Date,
  timezone: string,
  quietHours: QuietHoursWindow
): boolean {
  const zonedDate = toZonedTime(date, timezone);
  const currentMinutes = zonedDate.getHours() * 60 + zonedDate.getMinutes();
  const startMinutes = quietHours.startHour * 60 + quietHours.startMinute;
  const endMinutes = quietHours.endHour * 60 + quietHours.endMinute;

  if (startMinutes === endMinutes) {
    return false;
  }

  const crossesMidnight = startMinutes > endMinutes;
  if (crossesMidnight) {
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }

  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

export function getNextAllowedTime(
  date: Date,
  timezone: string,
  quietHours: QuietHoursWindow
): Date {
  if (!isInQuietHours(date, timezone, quietHours)) {
    return date;
  }

  const zonedDate = toZonedTime(date, timezone);
  const adjusted = new Date(zonedDate);

  const currentMinutes = zonedDate.getHours() * 60 + zonedDate.getMinutes();
  const startMinutes = quietHours.startHour * 60 + quietHours.startMinute;
  const endMinutes = quietHours.endHour * 60 + quietHours.endMinute;
  const crossesMidnight = startMinutes > endMinutes;

  if (crossesMidnight && currentMinutes >= startMinutes) {
    adjusted.setDate(adjusted.getDate() + 1);
  }

  adjusted.setHours(quietHours.endHour, quietHours.endMinute, 0, 0);
  return fromZonedTime(adjusted, timezone);
}
