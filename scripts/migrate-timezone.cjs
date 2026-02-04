const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;
const TARGET_TIMEZONE = 'UTC';

async function migrateTimezones() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db();
    const collection = db.collection('usersettings');

    console.log('Starting timezone migration...');

    const result = await collection.updateMany(
      { timezone: 'Europe/Istanbul' },
      { $set: { timezone: TARGET_TIMEZONE } }
    );

    console.log(
      `Updated ${result.modifiedCount} usersettings from Europe/Istanbul to ${TARGET_TIMEZONE}`
    );
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
    }
  }

  process.exit(0);
}

migrateTimezones();
