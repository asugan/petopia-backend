const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;

async function removeEventDescriptions() {
  if (!MONGODB_URI) {
    console.error('MONGODB_URI is required');
    process.exit(1);
  }

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db();

    console.log('Starting event/recurrence description removal migration...');

    const eventsResult = await db.collection('events').updateMany(
      { description: { $exists: true } },
      { $unset: { description: '' } }
    );

    const recurrenceRulesResult = await db.collection('recurrencerules').updateMany(
      { description: { $exists: true } },
      { $unset: { description: '' } }
    );

    console.log(
      `events: matched=${eventsResult.matchedCount}, modified=${eventsResult.modifiedCount}`
    );
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

removeEventDescriptions();
