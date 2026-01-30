# Petopia Backend Notification Sistemi Raporu

## 1. Genel Mimari

Petopia backend'i **Expo Push Notification** API'sini kullanarak push notification sistemi implemente edilmiştir. Sistem modüler bir yapıda olup, aşağıdaki ana bileşenlerden oluşmaktadır:

### 1.1 Temel Bileşenler

| Bileşen | Dosya Yolu | Açıklama |
|---------|-----------|----------|
| Push Notification Service | `src/services/pushNotificationService.ts` | Ana notification servisi |
| Device Model | `src/models/mongoose/userDevices.ts` | Cihaz kayıt modeli |
| Scheduled Notification Model | `src/models/mongoose/scheduledNotifications.ts` | Event reminder kayıtları |
| Feeding Notification Model | `src/models/mongoose/feedingNotification.ts` | Besleme reminder kayıtları |
| Event Reminder Service | `src/services/eventReminderService.ts` | Event hatırlatıcıları |
| Feeding Reminder Service | `src/services/feedingReminderService.ts` | Besleme hatırlatıcıları |
| Budget Alert Service | `src/services/budgetAlertService.ts` | Bütçe uyarıları |
| Job Scheduler | `src/jobs/scheduler.ts` | Cron job yöneticisi |

---

## 2. Veri Modelleri

### 2.1 UserDevice Model (`userDevices.ts`)

Kullanıcı cihazlarının push token'larını saklar.

```typescript
interface IUserDeviceDocument {
  userId: Types.ObjectId;
  expoPushToken: string;        // Expo push token
  deviceId: string;             // Benzersiz cihaz ID
  deviceName?: string;
  platform: 'ios' | 'android' | 'web';
  appVersion?: string;
  lastActiveAt: Date;
  isActive: boolean;            // Token geçerli mi?
}
```

**Indexler:**
- `{ userId: 1, isActive: 1 }` - Hızlı kullanıcı cihaz sorguları
- `{ expoPushToken: 1 }` - Token temizleme için

### 2.2 ScheduledNotification Model (`scheduledNotifications.ts`)

Event reminder notification'larını takip eder.

```typescript
interface IScheduledNotificationDocument {
  userId: Types.ObjectId;
  eventId: Types.ObjectId;
  expoPushToken: string;
  scheduledFor: Date;           // Hatırlatıcı gönderim zamanı
  sentAt?: Date;                // Gerçek gönderim zamanı
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  errorMessage?: string;
  retryCount: number;
  maxRetries: number;
  notificationId?: string;      // Expo'dan dönen ID
}
```

**Indexler:**
- `{ userId: 1, status: 1 }`
- `{ eventId: 1, status: 1 }`
- `{ scheduledFor: 1, status: 1, sentAt: 1 }`

### 2.3 FeedingNotification Model (`feedingNotification.ts`)

Besleme hatırlatıcı notification'larını saklar.

```typescript
interface IFeedingNotificationDocument {
  userId: Types.ObjectId;
  scheduleId: Types.ObjectId;
  petId: Types.ObjectId;
  scheduledFor: Date;
  sentAt?: Date;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  expoPushToken: string;
  notificationId?: string;
  errorMessage?: string;
  retryCount?: number;
  maxRetries?: number;
}
```

**Önemli Index:**
```typescript
// Aynı schedule için aynı zamanda duplicate notification önleme
{ scheduleId: 1, scheduledFor: 1, status: 1 }, 
{ unique: true, partialFilterExpression: { status: 'pending' } }
```

### 2.4 UserSettings Model (Notification Ayarları)

```typescript
interface IUserSettingsDocument {
  notificationsEnabled: boolean;        // Genel bildirimler
  budgetNotificationsEnabled: boolean;  // Bütçe uyarıları
  feedingRemindersEnabled: boolean;     // Besleme hatırlatıcıları
  quietHoursEnabled: boolean;           // Sessiz saatler
  quietHours: {
    startHour: number;
    startMinute: number;
    endHour: number;
    endMinute: number;
  };
}
```

---

## 3. Servis Katmanı

### 3.1 PushNotificationService (`pushNotificationService.ts`)

**Ana Metodlar:**

| Metod | Açıklama |
|-------|----------|
| `sendNotification(token, payload)` | Tek cihaza notification gönder |
| `sendNotifications(tokens, payload)` | Toplu notification gönder (batch 100) |
| `sendToUser(userId, payload)` | Tüm aktif cihazlara gönder |
| `registerDevice(...)` | Cihaz kaydet/güncelle |
| `deactivateDevice(deviceId)` | Cihazı deaktive et |
| `getUserActiveDevices(userId)` | Kullanıcının aktif cihazlarını getir |

**Teknik Detaylar:**
- Expo API limiti: **100 mesaj/batch**
- Retry mekanizması: **3 deneme**, exponential backoff
- Invalid token temizleme: `DeviceNotRegistered`, `InvalidCredentials`
- Runtime validation: **Zod** ile Expo response validasyonu

**Error Handling:**
```typescript
// Retryable hatalar (tekrar denenir)
- rate limit, timeout, server errors (429, 500, 502, 503, 504)

// Non-retryable (token temizlenir)
- DeviceNotRegistered, InvalidCredentials
```

### 3.2 EventReminderService (`eventReminderService.ts`)

Event hatırlatıcılarını yönetir.

**Özellikler:**
- **Reminder Preset'leri:**
  - `standard`: [1440, 120, 60, 15] dk (1 gün, 2 saat, 1 saat, 15 dk)
  - `compact`: [60, 15] dk
  - `minimal`: [15] dk

- **Cursor-based pagination:** Büyük dataset'ler için 100'lük batch'ler
- **User timezone cache:** Tekrarlayan sorguları önler
- **Event type emoji:** 🍽️ 🏃 ✂️ 🎾 🎓 🏥 🚶 🛁 💉 💊

**Metodlar:**
- `scheduleReminders(config)` - Event için hatırlatıcı planla
- `cancelReminders(eventId)` - Hatırlatıcıları iptal et
- `scheduleAllUpcomingReminders()` - Tüm yaklaşan event'ler için planla
- `markMissedEvents()` - Geçmiş event'leri missed olarak işaretle

### 3.3 FeedingReminderService (`feedingReminderService.ts`)

Besleme hatırlatıcılarını yönetir.

**Özellikler:**
- Timezone desteği (date-fns-tz kullanır)
- Günlük/haftalık besleme zamanı hesaplama
- Duplicate notification önleme (upsert pattern)

**Metodlar:**
- `scheduleFeedingReminder(config)` - Besleme hatırlatıcısı planla
- `cancelFeedingReminders(scheduleId)` - Hatırlatıcıları iptal et
- `markFeedingCompleted(scheduleId, userId)` - Beslemeyi tamamlandı işaretle
- `sendFeedingReminder(scheduleId, userId)` - Anında hatırlatıcı gönder
- `getScheduleNotifications(scheduleId)` - Notification durumunu getir
- `calculateNextFeedingTime(time, days, timezone)` - Sonraki besleme zamanını hesapla

### 3.4 BudgetAlertService (`budgetAlertService.ts`)

Bütçe uyarılarını yönetir.

**Özellikler:**
- **Upsert pattern:** Aynı dönem için duplicate alert önleme
- **Severity levels:** `warning`, `critical`
- **Race condition handling:** Double-check mekanizması

**Alert Mantığı:**
- `percentage >= 100%` → **critical**
- `percentage >= alertThreshold * 100` → **warning**

**Metodlar:**
- `sendBudgetAlert(userId, ...)` - Kullanıcıya bütçe uyarısı gönder
- `sendAlertsToAllUsers()` - Tüm kullanıcılara kontrol et ve gönder
- `getBudgetAlertStatus(userId)` - Alert durumunu getir

---

## 4. Job Scheduler (`scheduler.ts`)

**Cron Job'lar:**

| Job | Frekans | Açıklama |
|-----|---------|----------|
| `recurrence-generator` | Günlük 02:00 | Tekrarlayan event'leri oluştur |
| `reminder-scheduler` | Her 15 dk | Yaklaşan event hatırlatıcıları |
| `missed-event-checker` | Her 15 dk | Kaçırılan event'leri işaretle |
| `budget-alert-checker` | Her saat | Bütçe uyarılarını kontrol et |
| `feeding-reminder-checker` | Her 15 dk | Besleme hatırlatıcılarını gönder |

**Graceful Shutdown:**
- SIGTERM, SIGINT signal handler'ları
- Job'ları durdur, 1 sn bekle, çık

---

## 5. API Routes

### 5.1 Push Routes (`pushRoutes.ts`)

**Endpoints:**

```
POST   /api/push/devices      - Cihaz kaydet
DELETE /api/push/devices      - Cihaz deaktive et
GET    /api/push/devices      - Kullanıcı cihazlarını listele
POST   /api/push/test         - Test notification gönder
```

**Request Body (Register Device):**
```typescript
{
  expoPushToken: string;    // Expo'dan alınan token
  deviceId: string;         // UUID veya benzersiz ID
  platform: 'ios' | 'android' | 'web';
  deviceName?: string;
  appVersion?: string;
}
```

### 5.2 Feeding Schedule Routes (`feedingScheduleRoutes.ts`)

**Notification ile İlgili Endpoints:**

```
PUT    /:id/reminder          - Hatırlatıcı ayarlarını güncelle
POST   /:id/reminder          - Anında hatırlatıcı gönder
GET    /:id/notifications     - Notification durumunu getir
POST   /:id/complete          - Beslemeyi tamamlandı işaretle
```

### 5.3 User Settings Routes (`userSettingsRoutes.ts`)

**Notification Ayarları:**
```typescript
PUT /api/user-settings
{
  notificationsEnabled?: boolean;
  budgetNotificationsEnabled?: boolean;
  quietHoursEnabled?: boolean;
  quietHours?: {
    startHour: number;
    startMinute: number;
    endHour: number;
    endMinute: number;
  };
}
```

---

## 6. Konfigürasyon

### 6.1 Environment Variables

```bash
# Expo Push API
EXPO_ACCESS_TOKEN=<expo_access_token>

# Scheduler Timezone
SCHEDULER_TIMEZONE=Europe/Istanbul  # Varsayılan: UTC
```

### 6.2 Expo Push Config (`expoPushConfig.ts`)

```typescript
EXPO_PUSH_API_URL = 'https://exp.host/--/api/v2/push/send'

EXPO_PUSH_ERRORS = {
  DEVICE_NOT_REGISTRED: 'DeviceNotRegistered',
  INVALID_CREDENTIALS: 'InvalidCredentials',
  MESSAGE_TOO_BIG: 'MessageTooBig',
  QUOTA_EXCEEDED: 'QuotaExceeded',
  TOO_MANY_REQUESTS: 'TooManyRequests',
}
```

### 6.3 Notification Mesajları (`notificationMessages.ts`)

**Budget Alert Mesajları:**
```typescript
warning: {
  title: 'Budget alert',
  body: 'You've used X% of your monthly budget. $Y remaining.'
}

critical: {
  title: 'Budget exceeded', 
  body: 'You've exceeded your budget by $X. Current: $Y / $Z'
}
```

**Feeding Reminder Mesajları:**
```typescript
title: (petName) => `🍽️ Feeding time for ${petName}`
body: ({ petName, amount, foodType }) => 
  `Time to feed ${petName}: ${amount} of ${foodType}`
```

---

## 7. Çalışma Akışları

### 7.1 Event Reminder Akışı

```
1. Scheduler her 15 dk'da çalışır
2. Yaklaşan event'leri bul (sonraki 7 gün)
3. Her event için:
   - Kullanıcının timezone'ını cache'den veya DB'den al
   - Reminder preset'e göre dakikaları hesapla
   - Her hatırlatıcı zamanı için:
     * Notification mesajını formatla (emoji + tarih)
     * Kullanıcının tüm aktif cihazlarına gönder
     * ScheduledNotification kaydı oluştur
   - Event'i scheduledNotificationIds ile güncelle
```

### 7.2 Feeding Reminder Akışı

```
1. Scheduler her 15 dk'da çalışır
2. Pending FeedingNotification'ları bul (scheduledFor <= now)
3. Her notification için:
   - Schedule hala aktif mi kontrol et (değilse cancel)
   - Pet bilgilerini getir
   - Push notification gönder
   - Başarılı ise:
     * Status: 'sent', sentAt güncelle
     * Schedule.lastNotificationAt güncelle
     * Sonraki besleme zamanını hesapla
     * Yeni notification planla
   - Başarısız ise retry veya failed
```

### 7.3 Budget Alert Akışı

```
1. Scheduler her saat çalışır
2. Aktif bütçesi olan tüm kullanıcıları bul
3. Her kullanıcı için:
   - Aynı dönem/severity için alert gönderilmiş mi kontrol et
   - Mevcut harcamayı hesapla (Expense aggregation)
   - Yüzdeyi hesapla: (harcama / bütçe) * 100
   - Threshold'u aşıyorsa:
     * Severity belirle (critical/warning)
     * Double-check race condition
     * Notification gönder
     * Budget kaydını alert bilgileriyle güncelle
```

### 7.4 Device Registration Akışı

```
1. Client Expo'dan push token alır
2. POST /api/push/devices
3. Service deviceId ile upsert yapar:
   - Varsa: expoPushToken, lastActiveAt güncelle
   - Yoksa: Yeni kayıt oluştur
4. Aynı deviceId farklı user'a kaydolursa overwrite
```

---

## 8. Hata Yönetimi ve Güvenlik

### 8.1 Token Yönetimi

- **Invalid Token Tespiti:** Expo'dan dönen `DeviceNotRegistered`, `InvalidCredentials` hataları
- **Otomatik Temizlik:** Invalid token'lar otomatik deaktive edilir
- **Manual Cleanup:** Device deletion API'si

### 8.2 Retry Mekanizması

- **Exponential Backoff:** 1sn, 2sn, 4sn aralıklarla 3 deneme
- **Retryable Hatalar:** Rate limit, timeout, server errors
- **Non-retryable:** Auth hataları, invalid token'lar

### 8.3 Duplicate Önleme

- **ScheduledNotification:** eventId + scheduledFor + status unique index
- **FeedingNotification:** scheduleId + scheduledFor + status unique index (pending)
- **BudgetAlert:** period + severity kontrolü

---

## 9. Performans Optimizasyonları

1. **Cursor-based Pagination:** Büyük dataset'lerde memory verimliği
2. **Batch Processing:** 100'lük batch'ler (Expo limiti)
3. **User Timezone Cache:** Tekrarlayan DB sorgularını önleme
4. **Pre-fetching:** Feeding checker'da schedule ve pet bilgileri önceden çekilir
5. **Compound Indexler:** Sık kullanılan sorgu pattern'leri için optimize

---

## 10. Gelecek Geliştirmeler İçin Hazırlık

- **Quiet Hours:** Model'de alan tanımlı ama implementasyon yok
- **i18n Support:** Notification mesajları şu an İngilizce, Türkçe karışık
- **Notification History:** Kullanıcı geçmişi görüntüleme API'si yok
- **Rich Notifications:** Görseller, action butonları eklenmemiş

---

**Rapor Tarihi:** 29 Ocak 2026  
**Backend Path:** `/home/asugan/Projects/petopia-backend`
