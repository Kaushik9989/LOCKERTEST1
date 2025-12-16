// Terminal schema (Mongoose)
const mongoose = require('mongoose');

const TerminalSchema = new mongoose.Schema({
  terminalId: { type: String, required: true, unique: true },
  lastSeen: { type: Date },
  status: { type: String, default: 'offline' }, // online/offline/maintenance
  ip: String,
  publicIp: String,
  agentVersion: String,
  fwVersion: String,
  uptimeSeconds: Number,
  cpuPercent: Number,
  memPercent: Number,
  diskPercent: Number,
  peripherals: mongoose.Schema.Types.Mixed,
  location: { city: String, lat: Number, lon: Number },
  tags: [String],
  desiredState: mongoose.Schema.Types.Mixed
}, { timestamps: true });

const StatusHistorySchema = new mongoose.Schema({
  terminalId: { type: String, index: true },
  oldStatus: String,
  newStatus: String,
  changedAt: { type: Date, default: Date.now },
  reason: String,
  meta: mongoose.Schema.Types.Mixed
});

const Terminal = mongoose.model('Terminal', TerminalSchema);
const StatusHistory = mongoose.model('StatusHistory', StatusHistorySchema);

// middleware to log status changes
TerminalSchema.pre('findOneAndUpdate', async function(next) {
  try {
    const update = this.getUpdate();
    if (!update) return next();
    // simplified - handle $set etc.
    const newStatus = (update.status || (update.$set && update.$set.status));
    if (!newStatus) return next();

    // find current doc to compare
    const filter = this.getQuery();
    const current = await this.model.findOne(filter).lean();
    const oldStatus = current ? current.status : null;

    if (oldStatus !== newStatus) {
      await StatusHistory.create({
        terminalId: current ? current.terminalId : (filter.terminalId || update.terminalId),
        oldStatus,
        newStatus,
        reason: 'update', // you may set 'heartbeat' or 'worker'
        meta: {
          ip: (update.ip || (update.$set && update.$set.ip)),
          lastSeen: (update.lastSeen || (update.$set && update.$set.lastSeen))
        }
      });
    }
    return next();
  } catch (err) {
    return next(err);
  }
});

// Make sure to register middleware before using findOneAndUpdate
