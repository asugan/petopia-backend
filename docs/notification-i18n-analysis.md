# Petopia Backend Notification i18n Analiz Raporu

## 🚨 Tespit Edilen Sorunlar

### 1. Karmaşık Dil Kullanımı (MEVCUT SORUN)

**Dosya:** `src/services/eventReminderService.ts` (Satır 69-73)

```typescript
const notificationBody = minutes >= 1440
  ? `${formattedDate} (${Math.floor(minutes / 1440)} gün sonra)`   // 🇹🇷 Türkçe
  : minutes >= 60
    ? `${formattedDate} (${Math.floor(minutes / 60)} saat sonra)` // 🇹🇷 Türkçe
    : `${formattedDate} (${minutes} dakika sonra)`;               // 🇹🇷 Türkçe
```

**SORUN:** Event hatırlatıcı mesajları Türkçe sabit kodlanmış!
- "gün sonra" (days later)
- "saat sonra" (hours later)
- "dakika sonra" (minutes later)

Bu mesajlar TÜM kullanıcılara Türkçe gönderiliyor, dil ayarına bakılmaksızın!

### 2. İngilizce Sabit Kodlanmış Mesajlar

**Dosya:** `src/config/notificationMessages.ts`

```typescript
export const budgetAlertMessages: BudgetAlertMessages = {
  warning: {
    title: 'Budget alert',  // 🇺🇸 İngilizce
    body: ({ percentage, currency, remaining }) =>
      `You've used ${percentage.toFixed(0)}% of your monthly budget. ${currency} ${remaining.toFixed(2)} remaining.`,  // 🇺🇸 İngilizce
  },
  critical: {
    title: 'Budget exceeded',  // 🇺🇸 İngilizce
    body: ({ currency, exceeded, current, budget }) =>
      `You've exceeded your monthly budget by ${currency} ${exceeded.toFixed(2)}. Current spending: ${currency} ${current.toFixed(2)} / ${currency} ${budget.toFixed(2)}`,  // 🇺🇸 İngilizce
  },
};

export const feedingReminderMessages: FeedingReminderMessages = {
  title: (petName: string) => `🍽️ Feeding time for ${petName}`,  // 🇺🇸 İngilizce
  body: ({ petName, amount, foodType }) => `Time to feed ${petName}: ${amount} of ${foodType}`,  // 🇺🇸 İngilizce
};
```

### 3. Kullanıcı Dil Bilgisi Kullanılmıyor

**Mevcut Durum:**
- ✅ UserSettings modelinde `language` alanı var
- ✅ API'de language güncelleme endpoint'i var
- ❌ Ama notification servisleri bu bilgiyi KULLANMIYOR!

**Örnek:**
```typescript
// UserSettings'den language alınabilir ama alınmıyor
const userSettings = await UserSettingsModel.findOne({ userId: event.userId });
const userLanguage = userSettings?.language ?? 'en'; // ❌ Kullanılmıyor!
```

---

## 📊 Etkilenen Bildirim Türleri

| Bildirim Türü | Dil Durumu | Etkilenen Servisler |
|--------------|------------|-------------------|
| **Event Reminders** | 🇹🇷 Türkçe (sabit) | `eventReminderService.ts`, `scheduler.ts` |
| **Budget Alerts** | 🇺🇸 İngilizce (sabit) | `budgetAlertService.ts`, `budgetAlertChecker.ts` |
| **Feeding Reminders** | 🇺🇸 İngilizce (sabit) | `feedingReminderService.ts`, `feedingReminderChecker.ts` |

---

## 🛠️ Çözüm Önerisi: Backend i18n Implementasyonu

### Adım 1: i18n Kütüphanesi Kurulumu

```bash
npm install i18next i18next-fs-backend
```

### Adım 2: Çeviri Dosyaları Yapısı

```
src/
├── locales/
│   ├── en/
│   │   └── notifications.json
│   ├── tr/
│   │   └── notifications.json
│   ├── de/
│   │   └── notifications.json
│   └── ... (30 dil)
```

**Örnek: `src/locales/en/notifications.json`**
```json
{
  "eventReminder": {
    "daysLater": "{{count}} days later",
    "hoursLater": "{{count}} hours later",
    "minutesLater": "{{count}} minutes later",
    "title": "{{emoji}} {{petName}}: {{eventTitle}}",
    "titleNoPet": "{{emoji}} {{eventTitle}}"
  },
  "budgetAlert": {
    "warning": {
      "title": "Budget alert",
      "body": "You've used {{percentage}}% of your monthly budget. {{currency}} {{remaining}} remaining."
    },
    "critical": {
      "title": "Budget exceeded",
      "body": "You've exceeded your monthly budget by {{currency}} {{exceeded}}. Current spending: {{currency}} {{current}} / {{currency}} {{budget}}"
    }
  },
  "feedingReminder": {
    "title": "🍽️ Feeding time for {{petName}}",
    "body": "Time to feed {{petName}}: {{amount}} of {{foodType}}"
  }
}
```

**Örnek: `src/locales/tr/notifications.json`**
```json
{
  "eventReminder": {
    "daysLater": "{{count}} gün sonra",
    "hoursLater": "{{count}} saat sonra",
    "minutesLater": "{{count}} dakika sonra",
    "title": "{{emoji}} {{petName}}: {{eventTitle}}",
    "titleNoPet": "{{emoji}} {{eventTitle}}"
  },
  "budgetAlert": {
    "warning": {
      "title": "Bütçe Uyarısı",
      "body": "Aylık bütçenizin %{{percentage}}'ini kullandınız. Kalan: {{currency}} {{remaining}}"
    },
    "critical": {
      "title": "Bütçe Aşıldı",
      "body": "Aylık bütçenizi {{currency}} {{exceeded}} kadar aştınız. Mevcut harcama: {{currency}} {{current}} / {{currency}} {{budget}}"
    }
  },
  "feedingReminder": {
    "title": "🍽️ {{petName}} beslenme zamanı",
    "body": "{{petName}} besleme zamanı: {{amount}} {{foodType}}"
  }
}
```

### Adım 3: i18n Konfigürasyonu

**Yeni Dosya: `src/config/i18n.ts`**

```typescript
import i18next from 'i18next';
import Backend from 'i18next-fs-backend';
import path from 'path';

// Initialize i18next
i18next
  .use(Backend)
  .init({
    lng: 'en', // default language
    fallbackLng: 'en',
    ns: ['notifications'],
    defaultNS: 'notifications',
    backend: {
      loadPath: path.join(__dirname, '../locales/{{lng}}/{{ns}}.json'),
    },
    interpolation: {
      escapeValue: false, // XSS koruması gerekmez (backend'de HTML yok)
    },
  });

export default i18next;
```

### Adım 4: Notification Service Güncellemeleri

**`src/services/eventReminderService.ts` - Düzeltilmiş Hali:**

```typescript
import i18next from '../config/i18n';
import { UserSettingsModel } from '../models/mongoose/index.js';

// ...

async scheduleReminders(config: EventReminderConfig): Promise<EventReminderResult> {
  const { eventId, userId, eventType, eventTitle, startTime, petName, reminderMinutes, timezone } = config;

  // Get user's language preference
  const userSettings = await UserSettingsModel.findOne({ userId: new Types.ObjectId(userId) });
  const userLang = userSettings?.language ?? 'en';
  
  // Change i18n language for this user
  i18next.changeLanguage(userLang);

  // ...

  for (const minutes of reminderMinutes) {
    // ...

    // Format notification content using i18n
    const emoji = this.getEventTypeEmoji(eventType);
    const formattedDate = formatInTimeZone(startTime, timezone, 'MMM d, HH:mm');

    const notificationTitle = petName
      ? i18next.t('eventReminder.title', { emoji, petName, eventTitle })
      : i18next.t('eventReminder.titleNoPet', { emoji, eventTitle });

    const days = Math.floor(minutes / 1440);
    const hours = Math.floor(minutes / 60);
    const mins = minutes;

    let notificationBody: string;
    if (minutes >= 1440) {
      notificationBody = `${formattedDate} (${i18next.t('eventReminder.daysLater', { count: days })})`;
    } else if (minutes >= 60) {
      notificationBody = `${formattedDate} (${i18next.t('eventReminder.hoursLater', { count: hours })})`;
    } else {
      notificationBody = `${formattedDate} (${i18next.t('eventReminder.minutesLater', { count: mins })})`;
    }

    // Send notification...
  }
}
```

**`src/config/notificationMessages.ts` - Düzeltilmiş Hali:**

```typescript
import i18next from './i18n';

export const getBudgetAlertMessages = (language: string) => {
  i18next.changeLanguage(language);
  
  return {
    warning: {
      title: i18next.t('budgetAlert.warning.title'),
      body: ({ percentage, currency, remaining }: { percentage: number; currency: string; remaining: number }) =>
        i18next.t('budgetAlert.warning.body', { 
          percentage: percentage.toFixed(0), 
          currency, 
          remaining: remaining.toFixed(2) 
        }),
    },
    critical: {
      title: i18next.t('budgetAlert.critical.title'),
      body: ({ currency, exceeded, current, budget }: { currency: string; exceeded: number; current: number; budget: number }) =>
        i18next.t('budgetAlert.critical.body', { 
          currency, 
          exceeded: exceeded.toFixed(2), 
          current: current.toFixed(2), 
          budget: budget.toFixed(2) 
        }),
    },
  };
};

export const getFeedingReminderMessages = (language: string) => {
  i18next.changeLanguage(language);
  
  return {
    title: (petName: string) => i18next.t('feedingReminder.title', { petName }),
    body: ({ petName, amount, foodType }: { petName: string; amount: string; foodType: string }) => 
      i18next.t('feedingReminder.body', { petName, amount, foodType }),
  };
};
```

### Adım 5: Servislerin Güncellenmesi

**`src/services/budgetAlertService.ts`:**

```typescript
// ESKİ:
import { budgetAlertMessages } from '../config/notificationMessages.js';

// YENİ:
import { getBudgetAlertMessages } from '../config/notificationMessages.js';

async sendBudgetAlert(userId: string, ...): Promise<BudgetAlertResult> {
  // ...
  
  // Get user's language
  const userSettings = await UserSettingsModel.findOne({ userId: new Types.ObjectId(userId) });
  const userLang = userSettings?.language ?? 'en';
  
  // Get localized messages
  const messages = getBudgetAlertMessages(userLang);
  
  const title = severity === 'critical' 
    ? messages.critical.title 
    : messages.warning.title;
  
  const body = severity === 'critical'
    ? messages.critical.body({ currency, exceeded: Math.abs(remaining), current: currentSpending, budget: budgetAmount })
    : messages.warning.body({ percentage, currency, remaining });
  
  // Send notification...
}
```

**`src/services/feedingReminderService.ts`:**

```typescript
// ESKİ:
import { feedingReminderMessages } from '../config/notificationMessages.js';

// YENİ:
import { getFeedingReminderMessages } from '../config/notificationMessages.js';

async sendFeedingReminder(scheduleId: string, userId: string): Promise<FeedingReminderResult> {
  // ...
  
  // Get user's language
  const userSettings = await UserSettingsModel.findOne({ userId: new Types.ObjectId(userId) });
  const userLang = userSettings?.language ?? 'en';
  
  // Get localized messages
  const messages = getFeedingReminderMessages(userLang);
  
  const title = messages.title(pet.name);
  const body = messages.body({
    petName: pet.name,
    amount: schedule.amount,
    foodType: schedule.foodType,
  });
  
  // Send notification...
}
```

**`src/jobs/feedingReminderChecker.ts`:**

```typescript
// Her notification gönderiminde kullanıcının dilini al
const userSettings = await UserSettingsModel.findOne({ userId: notification.userId });
const userLang = userSettings?.language ?? 'en';
const messages = getFeedingReminderMessages(userLang);

await pushNotificationService.sendToUser(notification.userId.toString(), {
  title: messages.title(pet.name),
  body: messages.body({
    petName: pet.name,
    amount: schedule.amount,
    foodType: schedule.foodType,
  }),
  // ...
});
```

---

## 📋 Implementasyon Checklist

### Phase 1: Temel Kurulum (1-2 gün)
- [ ] `npm install i18next i18next-fs-backend`
- [ ] `src/config/i18n.ts` oluştur
- [ ] `src/locales/` dizin yapısını oluştur
- [ ] Varsayılan İngilizce çeviri dosyalarını oluştur

### Phase 2: Çeviri Dosyaları (3-5 gün)
- [ ] İngilizce (en) - Referans
- [ ] Türkçe (tr) - Mevcut Türkçe metinler taşınacak
- [ ] Diğer 28 dil için çeviri yönetimi (mobil ile senkronizasyon)

### Phase 3: Kod Güncellemeleri (2-3 gün)
- [ ] `notificationMessages.ts` refactor
- [ ] `eventReminderService.ts` güncelle
- [ ] `budgetAlertService.ts` güncelle
- [ ] `feedingReminderService.ts` güncelle
- [ ] `feedingReminderChecker.ts` güncelle

### Phase 4: Test (2 gün)
- [ ] Unit testler
- [ ] Manuel test (farklı dillerde)
- [ ] Staging ortamında test

---

## 🌍 Mobil-Backend Senkronizasyonu

### Çeviri Key Uyumluluğu

Mobil ve backend aynı çeviri key'lerini kullanmalı:

| Key | Mobil (i18next) | Backend (i18next) | Durum |
|-----|-----------------|-------------------|-------|
| `eventReminder.title` | ✅ | ✅ | Senkronize |
| `budgetAlert.warning.title` | ✅ | ✅ | Senkronize |
| `feedingReminder.title` | ✅ | ✅ | Senkronize |

### Dil Kodları

Her iki platform da aynı ISO 639-1 dil kodlarını kullanmalı:
- `en` - English
- `tr` - Türkçe
- `de` - Deutsch
- `fr` - Français
- ... (30 dil)

---

## ⚡ Acil Düzeltme (Hızlı Fix)

Eğer tam i18n implementasyonu zaman alacaksa, en azından şu Türkçe metinleri İngilizce'ye çevirin:

**Dosya:** `src/services/eventReminderService.ts`

```typescript
// ESKİ (Türkçe):
const notificationBody = minutes >= 1440
  ? `${formattedDate} (${Math.floor(minutes / 1440)} gün sonra)`
  : minutes >= 60
    ? `${formattedDate} (${Math.floor(minutes / 60)} saat sonra)`
    : `${formattedDate} (${minutes} dakika sonra)`;

// YENİ (İngilizce - Geçici):
const notificationBody = minutes >= 1440
  ? `${formattedDate} (${Math.floor(minutes / 1440)} days later)`
  : minutes >= 60
    ? `${formattedDate} (${Math.floor(minutes / 60)} hours later)`
    : `${formattedDate} (${minutes} minutes later)`;
```

---

## 📊 Sonuç

**Mevcut Durum:** ❌ **KRİTİK SORUN**

1. **Event Reminders:** 🇹🇷 Türkçe gönderiliyor (tüm kullanıcılara)
2. **Budget Alerts:** 🇺🇸 İngilizce gönderiliyor
3. **Feeding Reminders:** 🇺🇸 İngilizce gönderiliyor
4. **Kullanıcı Dil Tercihi:** ❌ Hiç dikkate alınmıyor

**Gerekli:** Backend i18n implementasyonu (Tahmini: 1 hafta)

**Geçici Çözüm:** Türkçe metinleri İngilizce'ye çevir (5 dakika)

**Not:** Mobil uygulama zaten 30 dilde i18n desteğine sahip. Backend senkronize edilmeli.

---

**Rapor Tarihi:** 29 Ocak 2026  
**Backend Path:** `/home/asugan/Projects/petopia-backend`  
**Etkilenen Dosya Sayısı:** 5+  
**Önerilen Dil Sayısı:** 30 (mobil ile senkron)
