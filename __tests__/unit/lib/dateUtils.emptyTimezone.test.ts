import { describe, expect, it } from 'vitest';
import { getUTCDateRangeForLocalDate } from '@/lib/dateUtils';

describe('getUTCDateRangeForLocalDate with empty/invalid timezone', () => {
  describe('Empty string timezone', () => {
    it('should fallback to UTC when timezone is empty string', () => {
      const dateStr = '2026-02-04';
      const emptyTimezone = '';  // Boş string - bu oluyor mu?
      
      const { start, end } = getUTCDateRangeForLocalDate(dateStr, emptyTimezone);
      
      console.log('\n=== Empty String Timezone Test ===');
      console.log('Timezone provided:', JSON.stringify(emptyTimezone));
      console.log('Range start:', start.toISOString());
      console.log('Range end:', end.toISOString());
      
      // Boş string falsy olduğu için UTC fallback'i çalışmalı
      // UTC'de 4 Şubat: 2026-02-04T00:00:00Z - 2026-02-05T00:00:00Z
      expect(start.toISOString()).toBe('2026-02-04T00:00:00.000Z');
      expect(end.toISOString()).toBe('2026-02-05T00:00:00.000Z');
    });

    it('should demonstrate the bug when frontend sends no timezone', () => {
      // Senaryo:
      // 1. Frontend timezone göndermiyor (undefined)
      // 2. Backend controller: toString(undefined) → ''
      // 3. Service: clientTimezone = '' (boş string)
      // 4. getUTCDateRangeForLocalDate(date, '') çağrılıyor
      // 5. '' || 'UTC' → 'UTC'
      // 6. UTC timezone kullanılıyor
      
      const eventDate = '2026-02-04';
      const eventTime = '10:00';
      const userTimezone = 'Europe/Istanbul';  // Kullanıcı Istanbul'da
      
      // Event UTC olarak kaydedildi: 4 Şubat 10:00 Istanbul = 07:00 UTC
      const eventUTC = '2026-02-04T07:00:00.000Z';
      
      console.log('\n=== Bug Scenario: No Timezone from Frontend ===');
      console.log('User timezone:', userTimezone);
      console.log('Event local time:', `${eventDate} ${eventTime}`);
      console.log('Event UTC time:', eventUTC);
      
      // Frontend 4 Şubat seçiyor
      const selectedDate = '2026-02-04';
      
      // Ama backend'e timezone gönderilmiyor (undefined → '' → 'UTC')
      const backendTimezone = '';  // Boş string geliyor
      
      const { start, end } = getUTCDateRangeForLocalDate(selectedDate, backendTimezone);
      
      console.log('\nQuery with empty timezone (falls back to UTC):');
      console.log('Query date:', selectedDate);
      console.log('Query timezone:', JSON.stringify(backendTimezone), '→ UTC');
      console.log('Query range start:', start.toISOString());
      console.log('Query range end:', end.toISOString());
      
      // Event 07:00 UTC'de
      // Query range UTC'de: 00:00 - 00:00 (next day)
      // Event range'de mi?
      const eventTimeMs = new Date(eventUTC).getTime();
      const inRange = eventTimeMs >= start.getTime() && eventTimeMs < end.getTime();
      
      console.log('\nEvent in UTC range:', inRange);
      
      // Event 07:00 UTC'de, range 00:00 - 00:00 (next day) UTC
      // Yani evet, range'de olmalı
      expect(inRange).toBe(true);
      
      // Peki neden kullanıcı göremiyor?
      // Belki de event farklı bir saatte kaydedildi?
      // Veya frontend'de bir şeyler yanlış?
    });
  });

  describe('Comparison: Correct vs Bug scenario', () => {
    it('should show the difference between correct and buggy query', () => {
      const selectedDate = '2026-02-04';
      const eventUTC = '2026-02-04T07:00:00.000Z';  // 4 Şubat 10:00 Istanbul
      
      console.log('\n=== Comparison: Correct vs Buggy ===');
      console.log('Event UTC time:', eventUTC);
      console.log('Selected date:', selectedDate);
      
      // DOĞRU: Istanbul timezone gönderilirse
      console.log('\n--- CORRECT (Istanbul timezone) ---');
      const correctRange = getUTCDateRangeForLocalDate(selectedDate, 'Europe/Istanbul');
      console.log('Range:', correctRange.start.toISOString(), '-', correctRange.end.toISOString());
      const correctInRange = new Date(eventUTC).getTime() >= correctRange.start.getTime() && 
                              new Date(eventUTC).getTime() < correctRange.end.getTime();
      console.log('Event in range:', correctInRange);
      
      // HATALI: Timezone boş string/undefined gelirse
      console.log('\n--- BUGGY (Empty timezone → UTC) ---');
      const buggyRange = getUTCDateRangeForLocalDate(selectedDate, '');
      console.log('Range:', buggyRange.start.toISOString(), '-', buggyRange.end.toISOString());
      const buggyInRange = new Date(eventUTC).getTime() >= buggyRange.start.getTime() && 
                           new Date(eventUTC).getTime() < buggyRange.end.getTime();
      console.log('Event in range:', buggyInRange);
      
      // Her iki durumda da event range'de olmalı
      expect(correctInRange).toBe(true);
      expect(buggyInRange).toBe(true);
      
      console.log('\n=== Result ===');
      console.log('Both queries find the event!');
      console.log('So the bug is NOT in getUTCDateRangeForLocalDate.');
    });
  });

  describe('Edge case: Late night event', () => {
    it('should test late night event that might appear on wrong day', () => {
      // Gece yarısı olay: 4 Şubat 00:30 Istanbul
      // UTC'de: 3 Şubat 21:30
      const eventUTC = '2026-02-03T21:30:00.000Z';
      const selectedDate = '2026-02-04';
      
      console.log('\n=== Late Night Event Edge Case ===');
      console.log('Event local time: 2026-02-04 00:30 Istanbul');
      console.log('Event UTC time:', eventUTC);
      
      // Istanbul timezone ile query
      const istanbulRange = getUTCDateRangeForLocalDate(selectedDate, 'Europe/Istanbul');
      console.log('\nIstanbul query range:');
      console.log('Start:', istanbulRange.start.toISOString());
      console.log('End:', istanbulRange.end.toISOString());
      
      const inIstanbulRange = new Date(eventUTC).getTime() >= istanbulRange.start.getTime() && 
                              new Date(eventUTC).getTime() < istanbulRange.end.getTime();
      console.log('Event in Istanbul range:', inIstanbulRange);
      
      // UTC ile query
      const utcRange = getUTCDateRangeForLocalDate(selectedDate, 'UTC');
      console.log('\nUTC query range:');
      console.log('Start:', utcRange.start.toISOString());
      console.log('End:', utcRange.end.toISOString());
      
      const inUTCRange = new Date(eventUTC).getTime() >= utcRange.start.getTime() && 
                         new Date(eventUTC).getTime() < utcRange.end.getTime();
      console.log('Event in UTC range:', inUTCRange);
      
      // Event 21:30 UTC'de (3 Şubat)
      // Istanbul range: 3 Şubat 21:00 - 4 Şubat 21:00 UTC
      // UTC range: 4 Şubat 00:00 - 5 Şubat 00:00 UTC
      
      expect(inIstanbulRange).toBe(true);   // Istanbul query finds it
      expect(inUTCRange).toBe(false);        // UTC query does NOT find it (it's on Feb 3 in UTC)
      
      console.log('\n=== Analysis ===');
      console.log('Late night event (00:30 Istanbul = 21:30 UTC prev day):');
      console.log('- Istanbul query finds it (correct)');
      console.log('- UTC query does NOT find it (wrong day in UTC)');
      console.log('');
      console.log('If timezone parameter is missing → UTC used → Event NOT found!');
    });
  });

  describe('The actual bug reproduction', () => {
    it('should reproduce the exact bug reported by user', () => {
      // Kullanıcı diyor ki:
      // - 4 Şubat'ta event ekliyor
      // - Calendar'da 4 Şubat'ta nokta görünüyor ✓
      // - BottomSheet'te 4 Şubat seçildiğinde event gözükmüyor ✗
      // - 5 Şubat seçildiğinde gözüküyor ✗
      
      console.log('\n=== ACTUAL BUG REPRODUCTION ===');
      console.log('User creates event at 4 Feb 00:30 (Istanbul midnight)');
      
      // Event oluşturuluyor: 4 Şubat 00:30 Istanbul
      const eventLocalDate = '2026-02-04';
      const eventLocalTime = '00:30';
      const userTimezone = 'Europe/Istanbul';
      
      // Frontend combineDateTimeToISO ile UTC'ye çeviriyor
      // new Date("2026-02-04T00:30:00") localde parse edilip toISOString() ile UTC'ye çevriliyor
      // Istanbul UTC+3, yani 00:30 Istanbul = 21:30 önceki gün UTC
      const eventUTC = '2026-02-03T21:30:00.000Z';
      
      console.log('Event local:', `${eventLocalDate} ${eventLocalTime} ${userTimezone}`);
      console.log('Event UTC:', eventUTC);
      
      // WeekView'da kontrol:
      // toZonedTime(eventUTC, userTimezone) → 4 Şubat 00:30 Istanbul
      // Yani nokta 4 Şubat'ta görünür ✓
      console.log('\n--- WeekView (uses toZonedTime) ---');
      console.log('toZonedTime converts UTC back to Istanbul: 2026-02-04 00:30');
      console.log('WeekView shows dot on 4 Feb: ✓ CORRECT');
      
      // BottomSheet'te kontrol:
      // Frontend 4 Şubat seçiyor
      // Backend'e: /api/events/calendar/2026-02-04?timezone=Europe/Istanbul
      console.log('\n--- BottomSheet with CORRECT timezone ---');
      const correctRange = getUTCDateRangeForLocalDate('2026-02-04', 'Europe/Istanbul');
      console.log('Query range:', correctRange.start.toISOString(), '-', correctRange.end.toISOString());
      const inCorrectRange = new Date(eventUTC) >= correctRange.start && new Date(eventUTC) < correctRange.end;
      console.log('Event in range:', inCorrectRange, '✓ CORRECT');
      
      // HATALI: Timezone gönderilmiyor (undefined → '' → 'UTC')
      console.log('\n--- BottomSheet with MISSING timezone (bug) ---');
      const buggyRange = getUTCDateRangeForLocalDate('2026-02-04', '');  // Empty string → UTC
      console.log('Query range:', buggyRange.start.toISOString(), '-', buggyRange.end.toISOString());
      const inBuggyRange = new Date(eventUTC) >= buggyRange.start && new Date(eventUTC) < buggyRange.end;
      console.log('Event in range:', inBuggyRange, '✗ EVENT NOT FOUND!');
      
      // Şimdi 5 Şubat seçilirse:
      console.log('\n--- BottomSheet with 5 Feb (workaround) ---');
      const nextDayRange = getUTCDateRangeForLocalDate('2026-02-05', '');  // Empty string → UTC
      console.log('Query range:', nextDayRange.start.toISOString(), '-', nextDayRange.end.toISOString());
      const inNextDayRange = new Date(eventUTC) >= nextDayRange.start && new Date(eventUTC) < nextDayRange.end;
      console.log('Event in range:', inNextDayRange, '✓ NOT FOUND (expected)');
      
      expect(inCorrectRange).toBe(true);
      expect(inBuggyRange).toBe(false);      // BUG!
      expect(inNextDayRange).toBe(false);    // No accidental next-day match
      
      console.log('\n=== CONCLUSION ===');
      console.log('BUG: When timezone parameter is missing/empty:');
      console.log('1. Backend falls back to UTC');
      console.log('2. Late night events (00:00-03:00 Istanbul) appear on wrong day');
      console.log('3. Event created at 4 Feb 00:30 is NOT found on 4 Feb query');
      console.log('4. It is also NOT found on 5 Feb query');
    });
  });
});
