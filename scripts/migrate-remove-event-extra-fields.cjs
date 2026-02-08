const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;

async function removeEventExtraFields() {
  if (!MONGODB_URI) {
    console.error('MONGODB_URI is required');
    process.exit(1);
  }

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db();

    console.log('Starting migration for removed event fields...');

    const eventsResult = await db.collection('events').updateMany(
      {
        $or: [
          { endTime: { $exists: true } },
          { location: { $exists: true } },
          { notes: { $exists: true } },
        ],
      },
      { $unset: { endTime: '', location: '', notes: '' } }
    );

    const recurrenceRulesResult = await db.collection('recurrencerules').updateMany(
      {
        $or: [
          { location: { $exists: true } },
          { notes: { $exists: true } },
          { eventDurationMinutes: { $exists: true } },
        ],
      },
      { $unset: { location: '', notes: '', eventDurationMinutes: '' } }
    );

    console.log(`events: matched=${eventsResult.matchedCount}, modified=${eventsResult.modifiedCount}`);
    console.log(
      `recurrencerules: matched=${recurrenceRulesResult.matchedCount}, modified=${recurrenceRulesResult.modifiedCount}`
    );
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await client.close();
  }

  process.exit(0);
}

removeEventExtraFields();
