# Timezone Kullanılabilecek Diğer Yerler

## ℹ️ Özet

`useUserTimezone` hook'u şu anda sadece **Calendar → Bottom Sheet** için implemente edildi. Ancak
uygulamanın birçok yerinde event tarihleri ile çalışılıyor ve timezoneAware olması gerekli.

---

## 📋 Yerler Listesi

### 1. 🔴 KRİTİK: Notification Service (Lib/services/notificationService.ts)

**Neden önemli:** Reminder scheduling için event zamanları hesaplanıyor.

```typescript
// Line ~: scheduleFeedingReminder, scheduleEventReminder fonksiyonları
const eventDate = new Date(event.startTime);
```

**Problem:**

- Device timezone ile reminder schedule ediliyor
- User timezone farklıysa reminder tam zamanında gelmeyebilir

**Öneri:**

```typescript
import { useUserTimezone } from '@/lib/hooks/useUserTimezone';

// Notification service'de kullanım:
const scheduleEventReminder = (event: Event, timezone: string) => {
  // event.startTime'ı user timezone'ına göre hesapla
  const eventDateInUserTZ = formatInTimeZone(
    new Date(event.startTime),
    timezone,
    'yyyy-MM-dd HH:mm'
  );
  // ...
};
```

**Priority:** ⚠️ HIGH - Reminder'lar yanlış saatte gelebilir

---

### 2. 🟠 YÜKSEK: Event Utils (lib/utils/events.ts)

**Neden:** Event grouping ve filtering kullanılıyor.

```typescript
// Line 34: filterUpcomingEvents
const eventDate = new Date(event.startTime);

// Line 69: groupEventsByTime
const eventDate = new Date(event.startTime);
```

**Problem:**

- `isToday()`, `isTomorrow()`, `isAfter()` fonksiyonları device timezone'ını kullanıyor
- User timezone +3 ise, device timezone -8 ise; bugün gösterilecek eventler yanlış günde görünebilir

**Öneri:**

```typescript
import { isToday, isTomorrow, isAfter } from 'date-fns';
import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz';

export const groupEventsByTime = (events: Event[], timezone: string): EventGroups => {
  const userNow = toZonedTime(new Date(), timezone);
  // ... diğer hesaplamalar
};
```

**Priority:** ⚠️ HIGH - Ana ekranda yanlış eventler gösterilebilir

---

### 3. 🟠 YÜKSEK: Event Detail Screen (app/event/[id].tsx)

**Neden:** Event tarih ve saat formatlama

```typescript
// Line 188-189
const eventDate = format(new Date(event.startTime), 'dd MMMM yyyy', { locale });
const eventTime = format(new Date(event.startTime), 'HH:mm', { locale });

// Line 379-380 (share)
const dateStr = format(new Date(event.startTime), 'MMM dd, yyyy', { locale });
const timeStr = format(new Date(event.startTime), 'hh:mm a', { locale });
```

**Problem:**

- Kullanıcıya gösterilen tarih device timezone'ında
- User timezone farklıysa yanlış tarih gösterir

**Öneri:**

```typescript
import { formatInTimeZone } from 'date-fns-tz';
import { useUserTimezone } from '@/lib/hooks/useUserTimezone';

const userTimezone = useUserTimezone();

const eventDate = formatInTimeZone(new Date(event.startTime), userTimezone, 'dd MMMM yyyy', {
  locale,
});
const eventTime = formatInTimeZone(new Date(event.startTime), userTimezone, 'HH:mm', { locale });
```

**Priority:** 🟡 MEDIUM - UX sorunu, ama functionality'ı etkilemez

---

### 4. 🟡 ORTA: Calendar Event Card (components/calendar/CalendarEventCard.tsx)

**Neden:** Event kartında zaman gösterme

```typescript
// Line 105
format(new Date(event.startTime), 'p', { locale }); // 'p' = local time (HH:MM AM/PM)
```

**Problem:** Yukarıdaki ile aynı

**Öneri:**

```typescript
import { formatInTimeZone } from 'date-fns-tz';

formatInTimeZone(new Date(event.startTime), userTimezone, 'p', { locale });
```

**Priority:** 🟡 MEDIUM - UX sorunu

---

### 5. 🟢 DÜŞÜK: Home Screen - Upcoming Events (app/(tabs)/index.tsx)

**Neden:** Ana ekranda yaklaşan eventleri gösteriyor

**İlgili Hook:** `lib/hooks/useHomeData.ts` → `useGroupedUpcomingEvents`

**Current Implementation:**

```typescript
// lib/hooks/useEvents.ts - useGroupedUpcomingEvents
const upcomingEvents = useMemo(() => {
  return filterUpcomingEvents(allEvents, daysToShow, maxEvents);
}, [allEvents, daysToShow, maxEvents]);
```

**Problem:** filterUpcomingEvents device timezone'ını kullanıyor

**Priority:** 🟡 MEDIUM - Ana ekran yanlış eventler gösterebilir

---

### 6. 🟢 DÜŞÜK: Activity Utils (lib/utils/activityUtils.ts)

**Neden:** Activitiy hesaplamalarında event zamanları kullanılıyor

**Probable Code:**

```typescript
const eventDate = new Date(event.startTime);
```

**Context:** Activity tracking / dashboard için

**Priority:** 🟢 LOW - Analytics/optional feature

---

### 7. 🟢 DÜŞÜK: Event Form (hooks/useEventForm.ts)

**Neden:** Event edit formunda başlangıç zamanını gösteriyor

```typescript
? new Date(event.startTime)
```

**Context:** Form initial value olarak kullanılıyor

**Priority:** 🟢 LOW - Form input gösterim sorunu

---

## 📊 Öncelik Tablosu

| Konum               | Priority  | Zorluk | Etki                           | Önerilen Action |
| ------------------- | --------- | ------ | ------------------------------ | --------------- |
| NotificationService | 🔴 HIGH   | Orta   | Yanlış reminder                | ✅ Implement et |
| events.ts (utils)   | 🔴 HIGH   | Orta   | Yanlış event grouping          | ✅ Implement et |
| Event Detail        | 🟠 HIGH   | Düşük  | Yanlış tarih gösterimi         | ✅ Implement et |
| CalendarEventCard   | 🟡 MEDIUM | Düşük  | UX sorunu                      | ⏰ İleride yap  |
| Home Screen         | 🟡 MEDIUM | Düşük  | Yanlış eventler gösterilebilir | ⏰ İleride yap  |
| ActivityUtils       | 🟢 LOW    | Düşük  | Analytics                      | 📝 Not al       |
| EventForm           | 🟢 LOW    | Düşük  | Form input                     | 📝 Not al       |

---

## 🚀 Hızlı Fix Planı

### Adım 1: formatInTimeZone'i Global Utility Yap

```typescript
// lib/utils/dateUtils.ts (yeni)
import { formatInTimeZone } from 'date-fns-tz';
import { useUserTimezone } from '@/lib/hooks/useUserTimezone';

export function formatEventDate(date: Date, formatStr: string, locale?: Locale): string {
  const timezone = useUserTimezone();
  return formatInTimeZone(date, timezone, formatStr, { locale });
}
```

### Adım 2: NotificationService'i Güncelle

- `scheduleFeedingReminder` ve `scheduleEventReminder` fonksiyonlarına timezone parametresi ekle

### Adım 3: events.ts'i Güncelle

- `filterUpcomingEvents` ve `groupEventsByTime` fonksiyonlarına timezone parametresi ekle

### Adım 4: Event Detail'i Güncelle

- Tarih formatlamalarında `formatInTimeZone` kullan

---

## 💡 Ek İyileştirmeler

### 1. Backend'e Timezone Parametresi Ekle

```
GET /api/events/today?timezone=Europe/Istanbul
GET /api/events/upcoming?timezone=Europe/Istanbul
```

### 2. User Timezone Senkronizasyonu

- Login sonrası device timezone'ını user settings'e gönder
- Settings'de timezone'ı değiştirince mobile tarafı güncelle

### 3. Date Display Helper

```typescript
// Tarih gösterimleri için helper
const formatDate = (date: Date) => formatInTimeZone(date, userTimezone, 'dd MMM yyyy');
const formatTime = (date: Date) => formatInTimeZone(date, userTimezone, 'HH:mm');
const formatDateTime = (date: Date) => formatInTimeZone(date, userTimezone, 'dd MMM yyyy, HH:mm');
```

---

## ⚠️ Test Senaryoları

Test etmek için:

1. Device timezone = America/Los_Angeles (UTC-8)
2. User timezone = Europe/Istanbul (UTC+3)
3. Event oluştur: 2026-02-04 09:00 Istanbul time

Sonra kontrol et:

- [ ] Event detayında 09:00 görünüyor mu?
- [ ] Calendar'de 4 Şubat'ta gösteriliyor mu?
- [ ] Home screen'de doğru sıralanıyor mu?
- [ ] Reminder tam saatte geliyor mu?
