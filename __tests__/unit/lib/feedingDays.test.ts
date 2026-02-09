import { describe, expect, it } from 'vitest';
import { normalizeFeedingDaysInput } from '@/lib/feedingDays';

describe('normalizeFeedingDaysInput', () => {
  it('normalizes comma separated string to unique lowercase day array', () => {
    expect(normalizeFeedingDaysInput(' Monday,Tuesday,monday ')).toEqual([
      'monday',
      'tuesday',
    ]);
  });

  it('filters invalid values from string arrays', () => {
    expect(normalizeFeedingDaysInput(['friday', 'invalid', 'SUNDAY'])).toEqual([
      'friday',
      'sunday',
    ]);
  });
});
