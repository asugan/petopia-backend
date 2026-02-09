const DAY_NAMES = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export type DayOfWeek = (typeof DAY_NAMES)[number];

function isDayOfWeek(value: string): value is DayOfWeek {
  return (DAY_NAMES as readonly string[]).includes(value);
}

export function normalizeFeedingDaysInput(
  value: string | string[] | null | undefined
): DayOfWeek[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];

  const normalized = values
    .map((day) => day.trim().toLowerCase())
    .filter((day): day is DayOfWeek => isDayOfWeek(day));

  return [...new Set(normalized)];
}
