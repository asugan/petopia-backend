import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz';

export function calculateNextFeedingTime(
  time: string,
  days: string,
  timezone: string,
  now: Date = new Date()
): Date | null {
  const [hours, minutes] = time.split(':').map(Number);
  if (hours === undefined || minutes === undefined) {
    return null;
  }

  const dayNames = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ];

  const normalizedDays = days.toLowerCase();
  const nowInTimezone = toZonedTime(now, timezone);
  const todayName = dayNames[nowInTimezone.getDay()] ?? 'sunday';

  const todayDateStr = formatInTimeZone(now, timezone, 'yyyy-MM-dd');
  const todayFeedingTimeUTC = fromZonedTime(`${todayDateStr}T${time}:00`, timezone);

  if (normalizedDays.includes(todayName) && todayFeedingTimeUTC > now) {
    return todayFeedingTimeUTC;
  }

  for (let i = 1; i <= 7; i++) {
    const nextDayDate = new Date(nowInTimezone);
    nextDayDate.setDate(nowInTimezone.getDate() + i);
    const nextDayName = dayNames[nextDayDate.getDay()] ?? 'sunday';

    if (normalizedDays.includes(nextDayName)) {
      const nextDayDateStr = formatInTimeZone(nextDayDate, timezone, 'yyyy-MM-dd');
      return fromZonedTime(`${nextDayDateStr}T${time}:00`, timezone);
    }
  }

  return null;
}
