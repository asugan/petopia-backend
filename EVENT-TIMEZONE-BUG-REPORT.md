# Event Timezone Bug Report

## Issue Summary

Events are appearing in the calendar on the correct date (4 February), but when clicking on that date in the calendar, the bottom sheet shows **empty**. However, when clicking on the **next day (5 February)**, the events appear in the bottom sheet.

## Problem Description

### Current Behavior
- ✅ Calendar view shows events on the correct date (4 Feb) with dot indicator
- ✅ Home page and pet profile show events correctly
- ✅ Event time is correct: 09:41 Istanbul time
- ❌ Bottom sheet for 4 Feb is **empty**
- ❌ Bottom sheet for 5 Feb **shows the events** (wrong day)

### Event Data in Database
```json
{
  "_id": "6982dbc8d016b6c66b78a256",
  "startTime": "2026-02-04T06:41:00.000Z",
  "status": "upcoming",
  "type": "vet_visit"
}
```

**Note:** Event is stored as 06:41 UTC, which equals 09:41 Istanbul time (UTC+3).

### User Settings
```json
{
  "timezone": "Europe/Istanbul"
}
```

### Server Environment
- **Server Timezone:** CET (UTC+1)
- **User Local Time:** Istanbul (UTC+3)
- **Time Difference:** 2 hours

## Root Cause Analysis

### The Issue is in `getEventsByDate` Function

The problem lies in `/src/services/eventService.ts` in the `getEventsByDate` function:

```typescript
async getEventsByDate(
  userId: string,
  date: string,  // "2026-02-04" from frontend
  params: EventQueryParams
): Promise<{ events: HydratedDocument<IEventDocument>[]; total: number }> {
  
  // Gets user's timezone from settings
  const settings = await UserSettingsModel.findOne({ userId })
    .select({ timezone: 1 })
    .lean()
    .exec();

  // Calculates UTC range for the given local date
  const { start, end } = getUTCDateRangeForLocalDate(
    date,
    settings?.timezone ?? 'UTC'  // "Europe/Istanbul"
  );

  // Query: start = 2026-02-03T21:00:00Z, end = 2026-02-04T21:00:00Z
  const whereClause: QueryFilter<IEventDocument> = {
    userId: new Types.ObjectId(userId),
    startTime: {
      $gte: start,  // 2026-02-03T21:00:00Z
      $lt: end,     // 2026-02-04T21:00:00Z
    },
  };
}
```

### Date Range Calculation Problem

For **4 February 2026** with **Europe/Istanbul** timezone:

| Time | Istanbul (UTC+3) | UTC |
|------|------------------|-----|
| Start of Day | 4 Feb 00:00 | 3 Feb 21:00 |
| End of Day | 4 Feb 23:59 | 4 Feb 21:00 |

**The Event:**
- Event time: 09:41 Istanbul = 06:41 UTC
- UTC timestamp: `2026-02-04T06:41:00.000Z`

**The Problem:**
- Query range: `2026-02-03T21:00:00Z` to `2026-02-04T21:00:00Z`
- Event is at: `2026-02-04T06:41:00Z`
- Event is **inside** the range ✅

**BUT** the events are appearing on **5 February** instead of **4 February**!

### The Real Issue: Server vs Client Timezone Mismatch

**Server Environment:** CET (UTC+1)
**Client Environment:** Istanbul (UTC+3)

When the frontend sends the date "2026-02-04", the server might be interpreting this differently due to:
1. Server's local timezone affecting date parsing
2. Potential off-by-one error in date boundary calculation
3. Query invalidation using server's local date instead of user's timezone

## Affected Endpoints

| Endpoint | Status | Notes |
|----------|--------|-------|
| `GET /api/events/upcoming` | ✅ Working | Used by calendar view |
| `GET /api/events/calendar/:date` | ❌ Broken | Used by bottom sheet |

## Why Other Parts Work

- **Calendar View** uses `useUpcomingEvents()` → `/api/events/upcoming` endpoint
  - This endpoint doesn't filter by specific date, it filters by time range
  - Returns all upcoming events regardless of specific date

- **Bottom Sheet** uses `useCalendarEvents(date)` → `/api/events/calendar/:date` endpoint
  - This endpoint filters by exact date boundaries
  - **This is where the bug manifests**

## Debug Steps Needed

### 1. Add Logging to Backend

Add to `/src/services/eventService.ts` in `getEventsByDate`:

```typescript
console.log('=== getEventsByDate Debug ===');
console.log('Input date:', date);
console.log('User timezone:', settings?.timezone);
console.log('Calculated UTC range:');
console.log('  Start:', start.toISOString());
console.log('  End:', end.toISOString());
console.log('Where clause:', JSON.stringify(whereClause));
console.log('Events found:', events.length);
console.log('Event startTimes:', events.map(e => e.startTime.toISOString()));
console.log('============================');
```

### 2. Test Cases

Test the following scenarios:

1. **Morning Event** (09:00 Istanbul):
   - Should appear on correct date
   - Currently appears on next day ❌

2. **Evening Event** (23:00 Istanbul):
   - Should appear on correct date
   - Check if it appears on correct day or previous day

3. **Noon Event** (12:00 Istanbul):
   - Should appear on correct date
   - Check behavior

## Temporary Workaround

Until the bug is fixed, users can:
1. Create events in the afternoon/evening (after server noon)
2. Or wait for the fix

## Proposed Solutions

### Solution 1: Frontend Sends Timezone
Modify the API to accept timezone from frontend:

```typescript
// New endpoint
GET /api/events/calendar/:date?timezone=Europe/Istanbul
```

### Solution 2: Use DateTime Instead of Date
Instead of sending just `2026-02-04`, send full datetime with timezone:

```typescript
GET /api/events/calendar/2026-02-04T00:00:00+03:00
```

### Solution 3: Fix Date Boundary Calculation
Review and fix `getUTCDateRangeForLocalDate` function in `/src/lib/dateUtils.ts` to ensure it works correctly regardless of server's local timezone.

## Related Files

- `/src/services/eventService.ts` - Main service file
- `/src/lib/dateUtils.ts` - Date utility functions
- `/src/controllers/eventController.ts` - Controller

## Priority

**HIGH** - This affects core functionality and user experience. Events not appearing on the correct day is a critical bug.

---

*Report created: 2026-02-04*
*Issue discovered by: Development Team*
