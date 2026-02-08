const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;

async function removeHealthRecordLegacyFields() {
  if (!MONGODB_URI) {
    console.error('MONGODB_URI is required');
    process.exit(1);
  }

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db();

    console.log('Starting migration for removed health record fields...');

    const linkedDocs = await db
      .collection('healthrecords')
      .find(
        {
          $or: [
            { nextVisitEventId: { $exists: true, $ne: null } },
            { expenseId: { $exists: true, $ne: null } },
          ],
        },
        {
          projection: { nextVisitEventId: 1, expenseId: 1 },
        }
      )
      .toArray();

    const linkedEventIds = [
      ...new Set(
        linkedDocs
          .map((doc) => doc.nextVisitEventId)
          .filter(Boolean)
          .map((id) => String(id))
      ),
    ];

    const linkedExpenseIds = [
      ...new Set(
        linkedDocs
          .map((doc) => doc.expenseId)
          .filter(Boolean)
          .map((id) => String(id))
      ),
    ];

    let deletedEvents = 0;
    let deletedExpenses = 0;

    const validEventObjectIds = linkedEventIds
      .filter((id) => ObjectId.isValid(id))
      .map((id) => new ObjectId(id));

    const validExpenseObjectIds = linkedExpenseIds
      .filter((id) => ObjectId.isValid(id))
      .map((id) => new ObjectId(id));

    if (validEventObjectIds.length > 0) {
      const result = await db.collection('events').deleteMany({
        _id: { $in: validEventObjectIds },
      });
      deletedEvents = result.deletedCount;
    }

    if (validExpenseObjectIds.length > 0) {
      const result = await db.collection('expenses').deleteMany({
        _id: { $in: validExpenseObjectIds },
      });
      deletedExpenses = result.deletedCount;
    }

    const result = await db.collection('healthrecords').updateMany(
      {
        $or: [
          { description: { $exists: true } },
          { veterinarian: { $exists: true } },
          { clinic: { $exists: true } },
          { cost: { $exists: true } },
          { currency: { $exists: true } },
          { baseCurrency: { $exists: true } },
          { amountBase: { $exists: true } },
          { fxRate: { $exists: true } },
          { fxAsOf: { $exists: true } },
          { notes: { $exists: true } },
          { nextVisitEventId: { $exists: true } },
          { expenseId: { $exists: true } },
        ],
      },
      {
        $unset: {
          description: '',
          veterinarian: '',
          clinic: '',
          cost: '',
          currency: '',
          baseCurrency: '',
          amountBase: '',
          fxRate: '',
          fxAsOf: '',
          notes: '',
          nextVisitEventId: '',
          expenseId: '',
        },
      }
    );

    console.log(`healthrecords: matched=${result.matchedCount}, modified=${result.modifiedCount}`);
    console.log(`events deleted by link: ${deletedEvents}`);
    console.log(`expenses deleted by link: ${deletedExpenses}`);
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await client.close();
  }

  process.exit(0);
}

removeHealthRecordLegacyFields();
