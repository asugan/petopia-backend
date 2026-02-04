# Fix for Event Timezone Bug

## Root Cause Analysis

### Issue 1: Mobile App Uses Device Timezone Instead of User Timezone

**Location:** `/petopia-mobile/components/calendar/MonthView.tsx:61` and
`/petopia-mobile/components/calendar/WeekView.tsx:54`

The mobile app determines which day to show event indicators using the device's local timezone:

```typescript
const eventDateStr = toISODateString(new Date(event.startTime)); // Uses DEVICE local time
```

**Problem:** If the device timezone differs from the user's timezone setting in the backend, event
dots will appear on the wrong day.

**Example:**

- Backend user timezone: Europe/Istanbul (UTC+3)
- Device timezone: America/Los_Angeles (UTC-8)
- Event time: 2026-02-04T06:41:00.000Z (09:41 Istanbul, 22:41 Los Angeles on Feb 3)
- Result: Event dot shows on Feb 3 in Los Angeles instead of Feb 4 (Istanbul)

### Issue 2: Mobile App Sends Local Date String to Backend

**Location:** `/petopia-mobile/app/(tabs)/calendar.tsx:54`

```typescript
const formattedDate = toISODateString(currentDate) ?? '';
```

**Problem:** The date string is generated using DEVICE local time, but the backend interprets it
based on the USER timezone setting from the database.

When the device timezone differs from the user's timezone setting, mismatched dates are sent to the
API.

## Recommended Fixes

### Fix 1: Add Debug Logging to Backend

Add logging to `/src/services/eventService.ts` in the `getEventsByDate` function (around line 63):

```typescript
async getEventsByDate(
  userId: string,
  date: string,
  params: EventQueryParams
): Promise<{ events: HydratedDocument<IEventDocument>[]; total: number }> {
  // ... existing code ...

  console.log('=== getEventsByDate Debug ===');
  console.log('Input date:', date);
  console.log('User timezone:', settings?.timezone);
  console.log('Calculated UTC range:');
  console.log('  Start:', start.toISOString());
  console.log('  End:', end.toISOString());
  console.log('Where clause:', JSON.stringify(whereClause, null, 2));

  const eventsList = await EventModel.find(whereClause)
    .sort({ startTime: 1 })
    .limit(limit)
    .skip(offset)
    .exec();

  console.log('Events found:', eventsList.length);
  if (eventsList.length > 0) {
    console.log('Event startTimes:', eventsList.map(e => e.startTime.toISOString()));
  }
  console.log('================================\n');

  return {
    events: eventsList,
    total,
  };
}
```

### Fix 2: Mobile App Should Send User Timezone with Date

**Option A: Include timezone in API request**

Update `/petopia-mobile/lib/config/env.ts`:

```typescript
EVENTS_BY_DATE: (date: string, timezone?: string) =>
  timezone
    ? `/api/events/calendar/${date}?timezone=${timezone}`
    : `/api/events/calendar/${date}`,
```

Update `/petopia-mobile/lib/services/eventService.ts`:

```typescript
async getEventsByDate(date: string, timezone?: string): Promise<ApiResponse<Event[]>> {
  // Get user timezone from Redux store
  // Pass timezone to API endpoint
}
```

Update backend `/src/routes/eventRoutes.ts`:

```typescript
const dateParamSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  timezone: z.string().optional(),
});

router.get(
  '/calendar/:date',
  validateRequest(dateParamSchema, 'params'),
  validateRequest(z.object({ timezone: z.string().optional() }), 'query'),
  eventController.getEventsByDate
);
```

**Option B: Use full datetime with timezone**

Send datetime instead of date-only string:

```
GET /api/events/calendar/2026-02-04T00:00:00+03:00
```

### Fix 3: Mobile App Should Convert Event Start Times to User Timezone

Update `/petopia-mobile/components/calendar/MonthView.tsx` and `WeekView.tsx` to use user's
timezone:

```typescript
import { fromUTCWithOffset } from '@/lib/utils/dateConversion';

// Get user timezone from Redux/store
const userTimezone = useUserTimezone(); // You'll need to create this hook

const getEventsForDay = (day: Date) => {
  const dayStr = toISODateString(day);
  if (!dayStr) return [];

  return events.filter(event => {
    const eventDateInUserTZ = fromUTCWithOffset(event.startTime, userTimezone);
    const eventDateStr = toISODateString(eventDateInUserTZ);
    return eventDateStr === dayStr;
  });
};
```

## Quick Verification Steps

1. Check backend logs to see:
   - What date string is being received from the mobile app
   - What timezone is being used
   - What UTC range is calculated
   - Whether events are found

2. In the mobile app, check:
   - Device timezone vs. user's timezone setting in backend
   - What date string is being sent to the API

## Immediate Workaround

Until proper fixes are implemented, ensure the device timezone matches the user's timezone setting
in the backend.

## Priority

**HIGH** - This bug causes events to not appear on the correct day in the calendar, which is a core
feature.

## Files to Modify

1. `/src/services/eventService.ts` - Add debug logging
2. `/petopia-mobile/lib/utils/dateConversion.ts` - Ensure it properly handles timezone conversions
3. `/petopia-mobile/components/calendar/MonthView.tsx` - Use user timezone instead of device
   timezone
4. `/petopia-mobile/components/calendar/WeekView.tsx` - Use user timezone instead of device timezone
5. `/petopia-mobile/app/(tabs)/calendar.tsx` - Ensure correct date is sent to API
6. `/petopia-mobile/lib/services/eventService.ts` - Include timezone in API call option

## Testing Scenarios

1. **Same timezone:** Device timezone = User timezonetimezone → Should work correctly
2. **Different timezone:** Device timezone ≠ User timezone → Events show on wrong day
3. **Edge cases:**
   - Events near midnight
   - Events on different days in different timezones
   - DST transitions
