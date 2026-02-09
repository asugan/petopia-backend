const { MongoClient } = require('mongodb');
const { fromZonedTime, formatInTimeZone } = require('date-fns-tz');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;
const MIGRATION_KEY = '2026-02-recurrence-enddate-exclusive-boundary';

/**
 * @param {unknown} timezone
 * @returns {boolean}
 */
function isValidTimezone(timezone) {
  if (typeof timezone !== 'string') {
    return false;
  }

  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {unknown} timezone
 * @returns {string}
 */
function resolveTimezone(timezone) {
  const trimmed = typeof timezone === 'string' ? timezone.trim() : '';
  if (!trimmed) {
    return 'UTC';
  }
  return isValidTimezone(trimmed) ? trimmed : 'UTC';
}

/**
 * @param {Date} endDate
 * @param {string} timezone
 * @returns {Date}
 */
function toExclusiveBoundary(endDate, timezone) {
  const localDate = formatInTimeZone(endDate, timezone, 'yyyy-MM-dd');
  const [yearStr, monthStr, dayStr] = localDate.split('-');
  const nextDate = new Date(
    Date.UTC(Number(yearStr), Number(monthStr) - 1, Number(dayStr) + 1)
  );
  const nextLocalDate = formatInTimeZone(nextDate, 'UTC', 'yyyy-MM-dd');
  return fromZonedTime(`${nextLocalDate} 00:00:00`, timezone);
}

function isUtcMidnight(date) {
  return (
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0
  );
}

/**
 * @param {unknown} value
 * @returns {Date | null}
 */
function toValidDate(value) {
  if (!(value instanceof Date) && typeof value !== 'string' && typeof value !== 'number') {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

/**
 * @typedef {object} RecurrenceRuleDoc
 * @property {unknown} _id
 * @property {unknown} endDate
 * @property {unknown} timezone
 */

async function migrateRecurrenceEndDates() {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is required');
  }

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db();
    const recurrenceRules = db.collection('recurrencerules');
    const migrations = db.collection('migrations');

    const existingMigration = await migrations.findOne({ key: MIGRATION_KEY });
    if (existingMigration) {
      console.log(`Migration already applied: ${MIGRATION_KEY}`);
      return;
    }

    const cursor = recurrenceRules.find({ endDate: { $exists: true, $ne: null } });
    const updates = [];
    let scanned = 0;

    while (await cursor.hasNext()) {
      /** @type {RecurrenceRuleDoc | null} */
      const doc = await cursor.next();
      if (!doc?._id || !doc?.endDate) {
        continue;
      }

      scanned += 1;
      const timezone = resolveTimezone(doc.timezone);
      const currentEndDate = toValidDate(doc.endDate);
      if (!currentEndDate) {
        continue;
      }

      // Migrate only legacy values that were stored as UTC midnight.
      // This avoids shifting manually-corrected or already-normalized rules.
      if (!isUtcMidnight(currentEndDate)) {
        continue;
      }

      const nextEndDate = toExclusiveBoundary(currentEndDate, timezone);
      if (nextEndDate.getTime() === currentEndDate.getTime()) {
        continue;
      }

      updates.push({
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: { endDate: nextEndDate } },
        },
      });
    }

    let modified = 0;
    if (updates.length > 0) {
      const result = await recurrenceRules.bulkWrite(updates);
      modified = result.modifiedCount ?? 0;
    }

    await migrations.insertOne({
      key: MIGRATION_KEY,
      scanned,
      modified,
      createdAt: new Date(),
    });

    console.log(`Migration completed. Scanned: ${scanned}, Modified: ${modified}`);
  } finally {
    await client.close();
  }
}

migrateRecurrenceEndDates()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
