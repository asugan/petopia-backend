const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI is required');
  process.exit(1);
}

async function syncFeedingReminderState() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db();
    const collection = db.collection('feedingschedules');

    console.log('Starting feeding schedule reminder sync...');

    const mismatchCount = await collection.countDocuments({
      $expr: { $ne: ['$isActive', '$remindersEnabled'] },
    });

    console.log(`Found ${mismatchCount} schedules with mismatched state`);

    const result = await collection.updateMany(
      {},
      [
        {
          $set: {
            remindersEnabled: { $ifNull: ['$isActive', true] },
            nextNotificationTime: {
              $cond: [{ $eq: [{ $ifNull: ['$isActive', true] }, true] }, '$nextNotificationTime', '$$REMOVE'],
            },
          },
        },
      ]
    );

    console.log(`Matched ${result.matchedCount} schedules`);
    console.log(`Updated ${result.modifiedCount} schedules`);
    console.log('Feeding schedule reminder sync completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await client.close();
  }

  process.exit(0);
}

syncFeedingReminderState();
