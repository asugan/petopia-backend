const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;

async function removeExpenseLegacyFields() {
  if (!MONGODB_URI) {
    console.error('MONGODB_URI is required');
    process.exit(1);
  }

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db();

    console.log('Starting migration for removed expense fields...');

    const expensesResult = await db.collection('expenses').updateMany(
      {
        $or: [
          { description: { $exists: true } },
          { receiptPhoto: { $exists: true } },
          { vendor: { $exists: true } },
          { notes: { $exists: true } },
        ],
      },
      {
        $unset: {
          description: '',
          receiptPhoto: '',
          vendor: '',
          notes: '',
        },
      }
    );

    console.log(`expenses: matched=${expensesResult.matchedCount}, modified=${expensesResult.modifiedCount}`);
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await client.close();
  }

  process.exit(0);
}

removeExpenseLegacyFields();
