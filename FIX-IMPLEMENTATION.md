# Timezone Bug Fix - Implementation Summary

## Changes Made

### Backend (petopia-backend)

#### 1. `/src/routes/eventRoutes.ts`

- Added `timezoneQuerySchema` validation for optional timezone query parameter
- Updated `/calendar/:date` route to accept both date params and timezone query

#### 2. `/src/controllers/eventController.ts`

- Updated `getEventsByDate` method to extract `timezone` from query parameters
- Passes timezone to `eventService.getEventsByDate()`

#### 3. `/src/services/eventService.ts`

- Updated `getEventsByDate()` to accept optional `clientTimezone` parameter
- Timezone priority: clientTimezone > userSettings.timezone > 'UTC'
- Enhanced debug logging to show:
  - Client timezone
  - User settings timezone
  - Effective timezone (which one is being used)
  - Calculated UTC range
  - Events found

### Mobile App (petopia-mobile)

#### 1. `/lib/hooks/useUserTimezone.ts` (NEW FILE)

- Created custom hook to get user's timezone from Zustand store
- Returns 'UTC' as default if no timezone is set

#### 2. `/lib/services/eventService.ts`

- Updated `getEventsByDate()` to accept optional `timezone` parameter
- If timezone is provided, appends `?timezone=<tz>` to API request URL
- Uses `encodeURIComponent()` to properly escape timezone string

#### 3. `/lib/hooks/useEvents.ts`

- Updated `useCalendarEvents()` hook to accept optional `timezone` in options
- Added timezone to query key to prevent cache issues when timezone changes
- Passes timezone to `eventService.getEventsByDate()`

#### 4. `/app/(tabs)/calendar.tsx`

- Added `useUserTimezone()` hook to get user's timezone
- Passes timezone to `useCalendarEvents()` hook

## How It Works

### Before (Buggy Behavior):

```
Mobile Device: UTC-8  ────┐
                           │── Backend interprets date "2026-02-04"
Backend DB User: UTC+3  ──┘   as UTC+3
                            ↓
Mobile shows events for: Feb 4 (UTC-8)
Backend returns events for: Feb 4 (UTC+3)
Result: MISMATCH
```

### After (Fixed Behavior):

```
Mobile Device: UTC-8  ────┐
                           │── Backend receives date "2026-02-04" AND
Backend DB User: UTC+3  ──┘   timezone "Europe/Istanbul"
                            ↓
Mobile sends: ?timezone=Europe/Istanbul
Backend uses: Europe/Istanbul for UTC conversion
Result: CONSISTENT
```

## API Changes

### GET /api/events/calendar/:date

**New Query Parameter:**

```
GET /api/events/calendar/2026-02-04?timezone=Europe/Istanbul
```

**Parameters:**

- `date` (path): Date in YYYY-MM-DD format
- `timezone` (query, optional): IANA timezone string (e.g., "Europe/Istanbul",
  "America/Los_Angeles")

**Behavior:**

- If `timezone` is provided → use it for UTC conversion
- If not provided → fallback to user's timezone setting from database
- If neither → fallback to 'UTC'

## Testing Steps

### 1. Backend Testing

```bash
# Test with timezone parameter
curl "http://localhost:3000/api/events/calendar/2026-02-04?timezone=Europe/Istanbul" \
  -H "Authorization: Bearer <token>"

# Test without timezone
curl "http://localhost:3000/api/events/calendar/2026-02-04" \
  -H "Authorization: Bearer <token>"

# Check console logs for debug output
```

### 2. Mobile App Testing

1. Open calendar screen
2. Check backend console logs for:
   - Client timezone
   - User settings timezone
   - Effective timezone
   - UTC range calculated
   - Events found

3. Test scenarios:
   - Click on a day with events
   - Verify events appear in bottom sheet
   - Verify event dots show on correct day in calendar

### 3. Cross-Timezone Testing

1. Set device timezone to different region (e.g., America/Los_Angeles)
2. Set user timezone to different region (e.g., Europe/Istanbul)
3. Create event for Feb 4 at 09:00 Istanbul time
4. Verify event appears on Feb 4 in calendar
5. Verify backend receives correct date query

## Debug Logging

The backend now logs:

```
=== getEventsByDate Debug ===
Input date: 2026-02-04
Client timezone: Europe/Istanbul
User settings timezone: Europe/Istanbul
Effective timezone: Europe/Istanbul
Calculated UTC range:
  Start: 2026-02-03T21:00:00.000Z
  End: 2026-02-04T21:00:00.000Z
Query: {...}
Events found: 1
Event startTimes: ['2026-02-04T06:41:00.000Z']
================================
```

## Backward Compatibility

✅ **Fully backward compatible:**

- Old API calls without timezone parameter still work
- Mobile apps not updated will use user timezone from database
- Updated mobile apps can send timezone parameter

## Future Enhancements

### 1. Add timezone to other endpoints:

- `GET /api/events/today?timezone=...`
- `GET /api/events/upcoming?timezone=...`

### 2. Use `formatInTimeZone` from date-fns-tz:

For consistent display of dates in user timezone across the app

### 3. Add timezone sync on login:

Ensure mobile app timezone matches backend user settings

## Files Modified

### Backend (4 files)

1. `/src/routes/eventRoutes.ts`
2. `/src/controllers/eventController.ts`
3. `/src/services/eventService.ts`
4. `TIMEZONE-BUG-FIX.md` (created)

### Mobile App (4 files)

1. `/lib/hooks/useUserTimezone.ts` (created)
2. `/lib/services/eventService.ts`
3. `/lib/hooks/useEvents.ts`
4. `/app/(tabs)/calendar.tsx`

## Next Steps

1. ✅ Backend changes implemented and type-checked
2. ✅ Mobile app changes implemented
3. ⏳ **Testing required**: Run backend and mobile app, verify fix works
4. ⏳ **Monitor logs**: Check debug output for timezone calculations
5. ⏳ **Additional endpoints**: Add timezone support to `/today` and `/upcoming` endpoints if needed

## Rollback Plan

If issues occur, can rollback by:

1. Removing `timezone` parameter from backend (backward compatible)
2. Reverting mobile app to not send timezone
3. Backend will continue using user timezone from database

---

**Status:** ✅ Implementation Complete **Type-Check:** ✅ Passing **Ready for:** Testing
