const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI is required');
  process.exit(1);
}

const VALID_DAYS = new Set([
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]);

function normalizeDays(daysValue) {
  const raw = Array.isArray(daysValue)
    ? daysValue
    : typeof daysValue === 'string'
      ? daysValue.split(',')
      : [];

  const normalized = raw
    .map((value) => String(value).trim().toLowerCase())
    .filter((day) => VALID_DAYS.has(day));

  return [...new Set(normalized)];
}

async function migrateFeedingDaysToArray() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db();
    const collection = db.collection('feedingschedules');

    console.log('Starting feeding days migration (string -> DayOfWeek[])...');

    const candidates = await collection
      .find({
        $or: [{ days: { $type: 'string' } }, { days: { $type: 'array' } }],
      })
      .project({ _id: 1, days: 1 })
      .toArray();

    console.log(`Found ${candidates.length} candidate schedules`);

    let updated = 0;
    let skipped = 0;

    for (const doc of candidates) {
      const normalized = normalizeDays(doc.days);
      if (normalized.length === 0) {
        skipped += 1;
        continue;
      }

      const current = Array.isArray(doc.days) ? doc.days : null;
      const alreadyNormalized =
        current !== null &&
        current.length === normalized.length &&
        current.every((value, index) => value === normalized[index]);

      if (alreadyNormalized) {
        skipped += 1;
        continue;
      }

      await collection.updateOne(
        { _id: doc._id },
        {
          $set: {
            days: normalized,
            updatedAt: new Date(),
          },
        }
      );

      updated += 1;
    }

    console.log(`Updated ${updated} schedules`);
    console.log(`Skipped ${skipped} schedules`);
    console.log('Feeding days migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await client.close();
  }

  process.exit(0);
}

migrateFeedingDaysToArray();
