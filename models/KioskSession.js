const mongoose = require("mongoose");

const kioskSessionSchema = new mongoose.Schema({
  phone: String,
  terminalId: String,
  expiresAt: Date
});

module.exports = mongoose.model("KioskSession", kioskSessionSchema);
