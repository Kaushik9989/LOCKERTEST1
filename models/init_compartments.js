/**
 * add_locker_level_fields.js
 *
 * Adds the following to every locker ONLY IF missing:
 *  lastSeen, status, meta, ip, updatedAt
 */

const mongoose = require('mongoose');
const Locker = require('./locker'); // adjust path if needed

const MONGO_URI = process.env.MONGO_URI ||
  'mongodb+srv://vivekkaushik2005:0OShH2EJiRwMSt4m@cluster0.vaqwvzd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

mongoose.set('strictQuery', false);

async function migrate() {
  console.log('Connecting to DB...');
  await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });

  const cursor = Locker.find().cursor();
  let processed = 0;
  const LOG_INTERVAL = 100;

  try {
    for (let locker = await cursor.next(); locker != null; locker = await cursor.next()) {
      let modified = false;

      // Add fields only if missing (never overwrite)
      if (locker.lastSeen === undefined) {
        locker.lastSeen = null;
        modified = true;
      }

      if (locker.status === undefined) {
        locker.status = 'unknown';
        modified = true;
      }

      if (locker.meta === undefined) {
        locker.meta = {
          os: null,
          uptimeSec: null,
          freeDiskMb: null,
          batteryPercent: null,
          firmwareVersion: null
        };
        modified = true;
      }

      if (locker.ip === undefined) {
        locker.ip = null;
        modified = true;
      }

      if (locker.updatedAt === undefined) {
        locker.updatedAt = null;
        modified = true;
      }

      if (modified) {
        try {
          await locker.save();
        } catch (err) {
          console.error(`❌ Failed to save locker ${locker._id}`, err);
        }
      }

      processed++;
      if (processed % LOG_INTERVAL === 0) {
        console.log(`Processed ${processed} lockers (last ID ${locker._id})`);
      }
    }

    console.log(`✅ Migration complete. Total lockers processed: ${processed}`);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

migrate()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
