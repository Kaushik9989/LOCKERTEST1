//size 800 × 1280 portrait
const fetch = require('node-fetch'); // npm i node-fetch@2
const os = require('os');
const express = require("express");
const mongoose = require("mongoose");
const lockerID = "L00002";
const { Server } = require("socket.io");
const crypto = require("node:crypto");
const cors = require("cors");
const Razorpay = require("razorpay");
const methodOverride = require("method-override");
const axios = require("axios");
const uaParser = require("ua-parser-js");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const bodyParser = require("body-parser");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const Locker = require("./models/locker.js");
const Parcel2 = require("./models/parcel2Updated.js");
const cron = require("node-cron");
const bcrypt = require("bcryptjs");
const User = require("./models/User/UserUpdated.js");
const app = express();
const PORT = 8000;
const ejsMate = require("ejs-mate");
const flash = require("connect-flash");
const expressLayouts = require("express-ejs-layouts");
const MONGO_URI =
  "mongodb+srv://vivekkaushik2005:0OShH2EJiRwMSt4m@cluster0.vaqwvzd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const QRCode = require("qrcode");
require("dotenv").config();
const compression = require("compression");
app.use(compression());
require("dotenv").config();
const twilio = require("twilio");
const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_VERIFY_SERVICE_SID,
  TWILIO_WHATSAPP_VERIFY_SID,
} = process.env;
if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_VERIFY_SERVICE_SID) {
  console.warn(
    "Twilio env vars missing. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_VERIFY_SERVICE_SID."
  );
}
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});
const http = require("http");
const https = require("https");
const server = http.createServer(app);
const io = new Server(server);

const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
const VERIFY_SID = TWILIO_VERIFY_SERVICE_SID;
const WHATSAPP_VERIFY_SID = TWILIO_WHATSAPP_VERIFY_SID;

const PRICES = { small: 10, medium: 20, large: 30 };

app.engine("ejs", ejsMate); // Set ejs-mate as the EJS engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  console.log('[REQ]', req.method, req.originalUrl);
  console.log('[HEADERS]', req.headers);
  console.log('[BODY]', req.body);
  next();
});
app.use(express.urlencoded({ extended: true }));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(methodOverride("_method"));

app.use(express.static("public"));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use("/css", express.static(path.join(__dirname, "public", "css")));
app.use("/js", express.static(path.join(__dirname, "public", "js")));
app.use(express.json());
require("dotenv").config();

function normalizePhone(phone) {
  // remove non-digits
  const digits = (phone || "").replace(/\D/g, "");
  // if phone length is 10, assume +91; otherwise, assume supplied includes country code
  if (digits.length === 10) return "+91" + digits;
  if (digits.startsWith("0")) return "+" + digits.replace(/^0+/, "");
  return digits.startsWith("+") ? digits : "+" + digits;
}

function checkInternet(cb) {
  const req = https.get("https://www.google.com", (res) => {
    cb(true);
    req.destroy();
  });
  req.on("error", () => cb(false));
  req.setTimeout(3000, () => {
    req.destroy();
    cb(false);
  });
}

// --- Step 2: Connect Mongo ---
async function connectMongo() {
  try {
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 10000, // wait max 5s
    });
    console.log("✅ MongoDB connected");
    // require("./server.js"); // start express
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
    console.log("🔁 Exiting, will restart when PM2 restarts the process...");
    process.exit(1); // let PM2/system restart
  }
}

function waitForInternet(retries = 20) {
  checkInternet((connected) => {
    if (connected) {
      console.log("🌍 Internet detected, trying MongoDB...");
      connectMongo();
    } else {
      if (retries <= 0) {
        console.error("❌ Internet not available after retries, exiting.");
        process.exit(1);
      }
      console.log("❌ No internet yet, retrying in 5s...");
      setTimeout(() => waitForInternet(retries - 1), 5000);
    }
  });
}

// --- Start process ---
waitForInternet();

// HARDWARE

const BU_IP = "192.168.0.178";
const BU_PORT = 4001;
const net = require("net");

let client1 = null;
let isConnected = false;

// =========================
//  Packet Builders
// =========================
function buildKerongUnlockPacket(compartmentId = 0x00, addr = 0x00) {
  const STX = 0x02;
  const CMD = 0x81;
  const ASK = 0x00;
  const DATALEN = 0x00;
  const ETX = 0x03;

  const LOCKNUM = compartmentId; // 0x00 to 0x0B
  const bytes = [STX, addr, LOCKNUM, CMD, ASK, DATALEN, ETX];
  const checksum = bytes.reduce((sum, byte) => sum + byte, 0) & 0xff;
  bytes.push(checksum);

  return Buffer.from(bytes);
}

function isLockerUnlocked(status, lockerId) {
  const key = `Lock_${lockerId}`;
  if (!status.hasOwnProperty(key)) {
    throw new Error(`Locker ${lockerId} not found in status`);
  }
  return status[key] === "Unlocked";
}

async function unlockAndConfirm(lockNum, addr) {
  // 1. Send unlock packet
  await sendUnlock(lockNum, addr);

  // 2. Small delay (allow hardware to respond, ~300-500ms recommended)
  await new Promise((r) => setTimeout(r, 500));

  // 3. Query status
  const status = await getLockStatus(lockNum, addr); // implement send 0x80 and parse response

  // 4. Check if unlocked
  if (!status.isUnlocked) {
    throw new Error(`Failed to unlock locker ${lockNum} at addr ${addr}`);
  }

  return true;
}

function buildGetStatusPacket(addr = 0x00) {
  const STX = 0x02;
  const LOCKNUM = 0x00;
  const CMD = 0x80;
  const ASK = 0x00;
  const DATALEN = 0x00;
  const ETX = 0x03;

  let sum = STX + addr + LOCKNUM + CMD + ASK + DATALEN + ETX;
  const SUM = sum & 0xff;

  return Buffer.from([STX, addr, LOCKNUM, CMD, ASK, DATALEN, ETX, SUM]);
}

function parseLockStatus(data) {
  const len = data.length;
  if (len < 10) return null;

  const hookLow = data[len - 2];
  const hookHigh = data[len - 1];
  const hookState = (hookHigh << 8) | hookLow;

  let status = {};
  for (let i = 0; i < 12; i++) {
    status[`Lock_${i}`] = hookState & (1 << i) ? "Locked" : "Unlocked";
  }
  return status;
}

// =========================
//  BU Connection
// =========================
function connectToBU(ip = BU_IP, port = BU_PORT) {
  return new Promise((resolve) => {
    client1 = new net.Socket();

    client1.connect(port, ip, () => {
      console.log(`✅ Connected to BU at ${ip}:${port}`);
      isConnected = true;
      resolve(true);
    });

    client1.on("error", (err) => {
      console.error(`❌ TCP Error: ${err.message}`);
      isConnected = false;
      resolve(false);
    });

    client1.on("close", () => {
      console.warn("⚠️ BU connection closed. Reconnecting...");
      isConnected = false;
      setTimeout(() => connectToBU(ip, port), 2000);
    });

    // General data listener for polling
    client1.on("data", (data) => {
      // This will get overridden in send functions using once(), but for polling:
      if (pollingCallback) {
        pollingCallback(data);
      }
    });
  });
}

function closeBUConnection() {
  if (client1 && isConnected) {
    client1.end();
    client1.destroy();
    isConnected = false;
    console.log("🔌 BU connection closed manually");
  }
}
app.get("/status", (req, res) => {
  res.render("status");
});

// =========================
//  Send Packets
// =========================
async function sendPacket(packet) {
  return new Promise((resolve) => {
    if (!isConnected || !client1) {
      console.warn("⚠️ No active BU connection");
      return resolve(null);
    }

    client1.write(packet, (err) => {
      if (err) {
        console.error(`❌ Write Error: ${err.message}`);
        return resolve(null);
      }
      console.log("📤 Sent:", packet.toString("hex").toUpperCase());
    });

    client1.once("data", (data) => {
      console.log(`📥 Received: ${data.toString("hex").toUpperCase()}`);
      resolve(data);
    });
  });
}

function sendUnlock(compartmentId, addr = 0x00) {
  return sendPacket(buildKerongUnlockPacket(compartmentId, addr));
}

// =========================
//  Polling
// =========================
let pollingCallback = null;

function startPollingMultiple(addresses = [0x00, 0x01], intervalMs = 500, io) {
  pollingCallback = (data) => {
    const status = parseLockStatus(data);
    if (status) {
      // Extract address from response
      const addrFromResponse = data[1]; // byte after STX is usually address
      io.emit("lockerStatus", { addr: addrFromResponse, status });
    }
  };

  let currentIndex = 0;

  setInterval(() => {
    if (isConnected) {
      const addr = addresses[currentIndex];
      client1.write(buildGetStatusPacket(addr));
      currentIndex = (currentIndex + 1) % addresses.length;
    }
  }, intervalMs);
}

function startPolling(addr, intervalMs = 500, io) {
  pollingCallback = (data) => {
    const status = parseLockStatus(data);
    if (status) {
      io.emit("lockerStatus", { addr, status });
    }
  };

  setInterval(() => {
    if (isConnected) {
      client1.write(buildGetStatusPacket(addr));
    }
  }, intervalMs);
}

(async () => {
  await connectToBU();

  // Example: Start polling lockers for live UI updates
  startPolling(0x00, 500, io /* pass your Socket.IO instance */);
  startPolling(0x01, 500, io /* pass your Socket.IO instance */);
  startPollingMultiple([0x00, 0x01], 500, io);
  // Example: Unlock locker #2 after 3 seconds
  setTimeout(() => {}, 3000);
})();






const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.post(
  "/api/locker/scan",
  express.text({ type: "*/*" }),
  async (req, res) => {
    const [accessCode, lockerId] = req.body.split("///");
    console.log(req.body);

    if (!accessCode) {
      return res
        .status(400)
        .json({ success: false, message: "Access code is required." });
    }

    // Find the parcel by accessCode
    const parcel = await Parcel2.findOne({ accessCode });
    if (!parcel) {
      return res
        .status(404)
        .json({ success: false, message: "Parcel not found." });
    }

    if (parcel.status === "picked") {
      return res
        .status(400)
        .json({
          success: false,
          message: "Parcel has already been picked up.",
        });
    }

    if (parcel.status === "awaiting_drop") {
      if (!lockerId) {
        return res.status(400).json({
          success: false,
          message: "Locker ID is required for drop-off.",
        });
      }

      // If locker was predefined in parcel (e.g. via QR), enforce locker match
      if (parcel.lockerId && parcel.lockerId !== lockerId) {
        return res.status(400).json({
          success: false,
          message: `This parcel is assigned to locker ${parcel.lockerId}. Please scan it at the correct locker.`,
          lockerMismatch: true, // 👈 Add this
          expectedLocker: parcel.lockerId, // 👈 Optional: for UI display
        });
      }

      const locker = await Locker.findOne({ lockerId });

      if (!locker) {
        return res.status(404).json({
          success: false,
          message: "Specified locker not found.",
        });
      }
      let compartment;

      compartment = locker.compartments.find(
        (c) => !c.isBooked && c.size === parcel.size
      );

      if (!compartment) {
        return res.status(400).json({
          success: false,
          message: "No available compartments in this locker.",
        });
      }

      let addr = 0x00;
      let lockNum = parseInt(compartment.compartmentId);

      if (lockNum > 11) {
        addr = 0x01; // second BU
        lockNum = lockNum - 12; // reset to 0–11 range
      }

      const sent = await sendUnlock(lockNum, addr);
      if (!sent) {
        console.warn(
          `❌ Failed to send unlock packet to locker ${compartment.compartmentId}`
        );
        return res
          .status(502)
          .json({ success: false, message: "Failed to send unlock packet." });
      }

      // 2) Verify unlocked
      await wait(500);
      const status = await checkLockerStatus(addr, lockNum, 2000);
      if (status !== "Unlocked") {
        return res.status(504).json({
          success: false,
          message: "Compartment did not unlock (timeout or still locked).",
          details: { addr, lockNum, reported: status || null },
        });
      }

      // Lock the compartment
      compartment.isBooked = true;
      compartment.currentParcelId = parcel._id;
      await locker.save();

      // Update parcel with locker info
      parcel.status = "awaiting_pick";
      parcel.lockerLat = locker.location.lat;
      parcel.lockerLng = locker.location.lng;
      parcel.lockerId = locker.lockerId; // (re)assign if not already
      parcel.compartmentId = compartment.compartmentId;
      parcel.UsercompartmentId = parseInt(compartment.compartmentId) + 1;
      parcel.droppedAt = new Date();
      await parcel.save();

      //Notify Receiver
      if (parcel.store_self) {
        await client.messages.create({
          to: `whatsapp:+91${parcel.senderPhone}`,
          from: "whatsapp:+15558076515",
          contentSid: "HXa7a69894f9567b90c1cacab6827ff46c",
          contentVariables: JSON.stringify({
            1: parcel.senderName,
            2: `mobile/incoming/${parcel._id}/qr`,
          }),
        });
      } else {
        await client.messages.create({
          to: `whatsapp:+91${parcel.receiverPhone}`,
          from: "whatsapp:+15558076515",
          contentSid: "HX4200777a18b1135e502d60b796efe670", // Approved Template SID
          contentVariables: JSON.stringify({
            1: parcel.receiverName,
            2: parcel.senderName,
            3: `mobile/incoming/${parcel._id}/qr`,
            4: `dir/?api=1&destination=${parcel.lockerLat},${parcel.lockerLng}`,
          }),
        });
      }
      io.emit("parcelUpdated", {
        parcelId: parcel._id,
        status: parcel.status,
        lockerId: parcel.lockerId,
        compartmentId: parseInt(parcel.compartmentId) + 1,
        pickedUpAt: parcel.pickedUpAt,
        droppedAt: parcel.droppedAt,
      });

      return res.json({
        success: true,
        message: `Parcel dropped successfully. Compartment ${compartment.compartmentId} locked.`,
        compartmentId: parseInt(parcel.compartmentId) + 1,
        lockerId: locker._id,
        parcelStatus: "awaiting_drop",
      });
    }

    if (parcel.status === "awaiting_pick" || parcel.status === "in_locker") {
      // This is a pickup

      const [accessCode, lockerId] = req.body.split("///");

      if (!parcel.lockerId || !parcel.compartmentId) {
        return res.json({
          success: false,
          message: "Parcel is not assigned to any locker.",
        });
      }

      // Check that the scanned locker matches the parcel's locker
      if (lockerId !== parcel.lockerId) {
        return res.json({
          success: false,
          message: `This parcel belongs to locker ${parcel.lockerId}. Please scan it at the correct locker.`,
        });
      }

      // Find locker and compartment
      const locker = await Locker.findOne({ lockerId: parcel.lockerId });

      if (!locker) {
        return res
          .status(404)
          .json({ success: false, message: "Locker not found." });
      }

      const compartment = locker.compartments.find(
        (c) => c.compartmentId === parcel.compartmentId
      );
      if (!compartment) {
        return res.json({ success: false, message: "Compartment not found." });
      }



      let addr1 = 0x00;
      let lockNum1 = parseInt(compartment.compartmentId);

      if (lockNum1 > 11) {
        addr1 = 0x01; // second BU
        lockNum1 = lockNum1 - 12; // reset to 0–11 range
      }
      const sent = await sendUnlock(lockNum1, addr1);
      if (!sent) {
        console.warn(
          `❌ Failed to send unlock packet to locker ${compartment.compartmentId}`
        );
        return res
          .status(502)
          .json({ success: false, message: "Failed to send unlock packet." });
      }

      // 2) Verify unlocked
      await wait(500);
      const status = await checkLockerStatus(addr1, lockNum1, 2000);
      if (status !== "Unlocked") {
        return res.status(504).json({
          success: false,
          message: "Compartment did not unlock (timeout or still locked).",
          details: { addr: addr1, lockNum: lockNum1, reported: status || null },
        });
      }

      // Otherwise: normal pickup flow
     
      compartment.isBooked = false;
      compartment.currentParcelId = null;
      await locker.save();

      // Update parcel
      parcel.status = "picked";
      parcel.pickedUpAt = new Date();
      await parcel.save();

      // Unlock compartment
     
      compartment.isBooked = false;
      compartment.currentParcelId = null;
      await locker.save();

      // Update parcel
      parcel.status = "picked";
      parcel.pickedUpAt = new Date();
      await parcel.save();
      const unlockPacket = buildKerongUnlockPacket(compartment.compartmentId);

      await client.messages.create({
        to: `whatsapp:+91${parcel.senderPhone}`,
        from: "whatsapp:+15558076515",
        contentSid: "HX5d9cb78910c37088fb14e660af060c1b", // Approved Template SID
        contentVariables: JSON.stringify({
          1: "User",
          2: "you ",
        }),
      });
      io.emit("parcelUpdated", {
        parcelId: parcel._id,
        status: parcel.status,
        lockerId: parcel.lockerId,
        compartmentId: parseInt(parcel.compartmentId) + 1,
        pickedUpAt: parcel.pickedUpAt,
        droppedAt: parcel.droppedAt,
      });
      return res.json({
        success: true,
        message: `Parcel picked up successfully. Compartment ${compartment.compartmentId} unlocked.`,
        compartmentId: parseInt(parcel.compartmentId) + 1,
        lockerId: locker._id,
        parcelStatus: "awaiting_pick",
      });
    }

    // If status is something else
    return res
      .status(400)
      .json({
        success: false,
        message: `Parcel is in status: ${parcel.status}`,
      });
  }
);

app.get("/", (req, res) => {
  res.render("terminal_landing");
});
app.get("/dropoff", (req, res) => {
  res.render("dropoff");
});

app.get("/pickup", (req, res) => {
  res.render("pickup");
});

app.get("/pickup-code", (req, res) => {
  res.render("pickup-code");
});

// helper

app.post(
  "/api/locker/unlock-code",
  express.json({ type: ["application/json", "text/plain", "*/json"] }),
  async (req, res) => {
    try {
      let { accessCode, lockerId } = req.body || {};
      accessCode = parseInt(accessCode);
      console.log("🔑 Unlock Request:", { accessCode, lockerId });

      if (!accessCode) {
        return res
          .status(400)
          .json({ success: false, message: "Access code is required." });
      }

      const parcel = await Parcel2.findOne({ accessCode });
      if (!parcel) {
        return res
          .status(404)
          .json({ success: false, message: "Parcel not found." });
      }

      if (parcel.status === "picked") {
        return res
          .status(400)
          .json({ success: false, message: "Parcel already picked up." });
      }

      // ============= DROP-OFF FLOW =============
      if (parcel.status === "awaiting_drop") {
        if (!lockerId) {
          return res
            .status(400)
            .json({
              success: false,
              message: "Locker ID is required for drop-off.",
            });
        }

        // If already assigned, enforce same locker
        if (parcel.lockerId && parcel.lockerId !== lockerId) {
          return res.status(400).json({
            success: false,
            message: `This parcel is assigned to locker ${parcel.lockerId}.`,
            lockerMismatch: true,
            expectedLocker: parcel.lockerId,
          });
        }

        const locker = await Locker.findOne({ lockerId });
        if (!locker) {
          return res
            .status(404)
            .json({ success: false, message: "Locker not found." });
        }

        // pick a free compartment matching size
        const compartment = locker.compartments.find(
          (c) => !c.isBooked && c.size === parcel.size
        );
        if (!compartment) {
          return res
            .status(400)
            .json({
              success: false,
              message: "No available compartments in this locker.",
            });
        }

        // map to controller address + index (0..11)
        let addr = 0x00;
        let lockNum = parseInt(compartment.compartmentId);
        if (lockNum > 11) {
          addr = 0x01;
          lockNum = lockNum - 12;
        }

        // 1) send unlock
        const sent = await sendUnlock(lockNum, addr);
        if (!sent) {
          console.warn(
            `❌ Failed to send unlock packet to locker ${compartment.compartmentId}`
          );
          return res
            .status(502)
            .json({ success: false, message: "Failed to send unlock packet." });
        }

        // 2) verify hardware actually unlocked
        await wait(500);
        const status = await checkLockerStatus(addr, lockNum, 2000);
        if (status !== "Unlocked") {
          return res.status(504).json({
            success: false,
            message: "Compartment did not unlock (timeout or still locked).",
            details: { addr, lockNum, reported: status || null },
          });
        }

        // 3) update DB ONLY NOW (door is unlocked/open)
        // it's unlocked now
        compartment.isBooked = true; // reserving for this parcel
        compartment.currentParcelId = parcel._id;
        await locker.save();

        // parcel now awaiting_pick (user will place item and close door)
        parcel.status = "awaiting_pick";
        parcel.lockerLat = locker.location.lat;
        parcel.lockerLng = locker.location.lng;
        parcel.lockerId = locker.lockerId; // assign
        parcel.compartmentId = compartment.compartmentId;
        parcel.UsercompartmentId = parseInt(compartment.compartmentId) + 1;
        parcel.droppedAt = new Date();
        await parcel.save();

        // notifications
        if (parcel.store_self) {
          await client.messages.create({
            to: `whatsapp:+91${parcel.senderPhone}`,
            from: "whatsapp:+15558076515",
            contentSid: "HXa7a69894f9567b90c1cacab6827ff46c",
            contentVariables: JSON.stringify({
              1: parcel.senderName,
              2: `mobile/incoming/${parcel._id}/qr`,
            }),
          });
        }
        await client.messages.create({
          to: `whatsapp:+91${parcel.receiverPhone}`,
          from: "whatsapp:+15558076515",
          contentSid: "HX4200777a18b1135e502d60b796efe670",
          contentVariables: JSON.stringify({
            1: parcel.receiverName,
            2: parcel.senderName,
            3: `mobile/incoming/${parcel._id}/qr`,
            4: `dir/?api=1&destination=${parcel.lockerLat},${parcel.lockerLng}`,
          }),
        });

        io.emit("parcelUpdated", {
          parcelId: parcel._id,
          status: parcel.status,
          lockerId: parcel.lockerId,
          compartmentId: parseInt(parcel.compartmentId) + 1,
          droppedAt: parcel.droppedAt,
        });

        return res.json({
          success: true,
          message: `Parcel dropped. Compartment ${compartment.compartmentId} is unlocked for loading.`,
          compartmentId: parseInt(parcel.compartmentId) + 1,
          lockerId: locker._id,
          status: parcel.status,
        });
      }

      // ============= PICKUP FLOW =============
      if (parcel.status === "awaiting_pick" || parcel.status === "in_locker") {
        const locker = await Locker.findOne({ lockerId: parcel.lockerId });
        if (!locker) {
          return res
            .status(404)
            .json({ success: false, message: "Locker not found." });
        }

        const compartment = locker.compartments.find(
          (c) => c.compartmentId === parcel.compartmentId
        );
        if (!compartment) {
          return res
            .status(404)
            .json({ success: false, message: "Compartment not found." });
        }



        // map to controller address + index (0..11)
        let addr1 = 0x00;
        let lockNum1 = parseInt(compartment.compartmentId);
        if (lockNum1 > 11) {
          addr1 = 0x01;
          lockNum1 = lockNum1 - 12;
        }

        // 1) send unlock
        const sent = await sendUnlock(lockNum1, addr1);
        if (!sent) {
          console.warn(
            `❌ Failed to send unlock packet to locker ${compartment.compartmentId}`
          );
          return res
            .status(502)
            .json({ success: false, message: "Failed to send unlock packet." });
        }

        // 2) verify unlocked
        await wait(500);
        const status = await checkLockerStatus(addr1, lockNum1, 2000);
        if (status !== "Unlocked") {
          return res.status(504).json({
            success: false,
            message: "Compartment did not unlock (timeout or still locked).",
            details: {
              addr: addr1,
              lockNum: lockNum1,
              reported: status || null,
            },
          });
        }

        // 3) update DB ONLY NOW (after verified unlocked)
       
        compartment.isBooked = false;
        compartment.currentParcelId = null;
        await locker.save();

        parcel.status = "picked";
        parcel.pickedUpAt = new Date();
        await parcel.save();

        await client.messages.create({
          to: `whatsapp:+91${parcel.senderPhone}`,
          from: "whatsapp:+15558076515",
          contentSid: "HX5d9cb78910c37088fb14e660af060c1b",
          contentVariables: JSON.stringify({
            1: "User",
            2: "you ",
          }),
        });

        io.emit("parcelUpdated", {
          parcelId: parcel._id,
          status: parcel.status,
          lockerId: parcel.lockerId,
          compartmentId: parseInt(parcel.compartmentId) + 1,
          pickedUpAt: parcel.pickedUpAt,
        });

        return res.json({
          success: true,
          message: `Parcel picked up. Compartment ${compartment.compartmentId} unlocked.`,
          compartmentId: parseInt(parcel.compartmentId) + 1,
          lockerId: locker._id,
          status: parcel.status,
        });
      }

      return res
        .status(400)
        .json({
          success: false,
          message: `Parcel in status: ${parcel.status}`,
        });
    } catch (err) {
      console.error("❌ Unlock API Error:", err);
      res.status(500).json({ success: false, message: "Server error." });
    }
  }
);

app.get("/qr/dropoff", async (req, res) => {
  const locker = await Locker.findOne({ lockerId: lockerID });
  res.render("newlocker1", {
    lockerId: locker.lockerId,
    compartments: locker.compartments,
  });
});

app.get("/qr/pickup", async (req, res) => {
  const locker = await Locker.findOne({ lockerId: lockerID });
  res.render("newlocker1", {
    lockerId: locker.lockerId,
    compartments: locker.compartments,
  });
});
async function checkLockerStatus(addr = 0x00, compartmentId = 0) {
  return new Promise((resolve) => {
    if (!isConnected || !client1) {
      console.warn("⚠️ No active BU connection");
      return resolve(null);
    }

    // Send GetStatus packet
    const packet = buildGetStatusPacket(addr);

    // Listen for 1 response only
    client1.once("data", (data) => {
      console.log(
        `📥 Received (checkLockerStatus): ${data.toString("hex").toUpperCase()}`
      );

      const statusObj = parseLockStatus(data);
      if (!statusObj) {
        return resolve(null);
      }

      const key = `Lock_${compartmentId}`;
      const lockerStatus = statusObj[key];

      resolve(lockerStatus); // "Locked" or "Unlocked"
    });

    // Write packet
    client1.write(packet, (err) => {
      if (err) {
        console.error(`❌ Write Error: ${err.message}`);
        return resolve(null);
      }
      console.log(
        "📤 Sent (checkLockerStatus):",
        packet.toString("hex").toUpperCase()
      );
    });
  });
}

app.get("/check/:addr/:id", async (req, res) => {
  const addr = parseInt(req.params.addr);
  const id = parseInt(req.params.id);

  const status = await checkLockerStatus(addr, id);
  if (status === null) {
    return res.status(500).json({ error: "Could not read status" });
  }

  res.json({ addr, compartment: id, status });
});








app.get("/terminal/phone", (req, res) => {
  res.render("terminal_phone");
});

const otpMeta = new Map(); // phone -> { resendAvailableAt, attempts, lockUntil }

// config
const RESEND_COOLDOWN_MS = 30 * 1000; // 30s between resends
const MAX_ATTEMPTS = 5; // attempts before temporary lock
const ATTEMPT_LOCK_MS = 5 * 60 * 1000; // 5 minutes lock after too many attempts

// helper to compute seconds left for resend
function secondsLeft(timestampMs) {
  if (!timestampMs) return 0;
  const s = Math.ceil(Math.max(0, (timestampMs - Date.now()) / 1000));
  return s;
}

// -----------------------------------------
// POST /terminal/send-otp
// -----------------------------------------
app.post("/send-otp/sms", async (req, res) => {
  try {
    const phone = (req.body.phone || "").trim();
    if (!phone) return res.status(400).send("phone required");
    // check Twilio client and verify service config
    if (!client || !VERIFY_SID) {
      console.warn(
        "Twilio verify client not configured — skipping SMS send (dev mode)."
      );
    }

    // check cooldown
    const meta = otpMeta.get(phone) || {};
    if (meta.resendAvailableAt && Date.now() < meta.resendAvailableAt) {
      const wait = secondsLeft(meta.resendAvailableAt);
      // Redirect to verify page with an error message (stays on the verify page)
      return res.redirect(
        `/terminal/verify?phone=${encodeURIComponent(
          phone
        )}&error=${encodeURIComponent(
          "Please wait " + wait + "s before requesting a new code"
        )}`
      );
    }

    // request Twilio Verify to send code (if configured)
    try {
      if (client && VERIFY_SID) {
        await client.verify.v2.services(VERIFY_SID).verifications.create({
          to: `+91${phone}`,
          channel: "sms",
        });
      } else {
        // dev fallback: log OTP send (Twilio not configured)
        console.log(
          `[dev] send-otp called for ${phone} (Twilio not configured)`
        );
      }
    } catch (twErr) {
      console.error("Twilio send-otp error:", twErr);
      return res.redirect(
        `/terminal/verify?phone=${encodeURIComponent(
          phone
        )}&error=${encodeURIComponent("Failed to send OTP. Try again.")}`
      );
    }

    // update metadata: reset attempts, set next allowed resend time
    otpMeta.set(phone, {
      resendAvailableAt: Date.now() + RESEND_COOLDOWN_MS,
      attempts: 0,
    });

    // Redirect to verify view (optionally provide a friendly message)
    return res.redirect(
      `/terminal/verify?phone=${encodeURIComponent(
        phone
      )}&message=${encodeURIComponent("OTP sent")}`
    );
  } catch (err) {
    console.error("send-otp error", err);
    return res.status(500).send("Server error");
  }
});

// -----------------------------------------
// GET /terminal/verify
// Render verify page and pass resendWait + optional messages
// -----------------------------------------
app.get("/terminal/verify", (req, res) => {
  const phone = (req.query.phone || "").trim();
  if (!phone) return res.status(400).send("Missing phone");

  const meta = otpMeta.get(phone) || {};
  const resendWait = secondsLeft(meta.resendAvailableAt);

  // message and error may come via query (redirect)
  const message = req.query.message || null;
  const error = req.query.error || null;

  return res.render("terminal_verify", {
    phone,
    message,
    error,
    resendWait,
  });
});

// -----------------------------------------
// POST /terminal/verify-otp
// Verify code with Twilio Verify and re-render page on failure
// -----------------------------------------
app.post("/terminal/verify-otp", async (req, res) => {
  try {
    const phone = (req.body.phone || "").trim();
    const code = (req.body.code || "").trim();

    if (!phone || !code) {
      return res.render("terminal_verify", {
        phone,
        error: "Missing phone or code",
        resendWait: 0,
      });
    }

    const meta = otpMeta.get(phone) || {};

    // check temporary lock
    if (meta.lockUntil && Date.now() < meta.lockUntil) {
      const wait = secondsLeft(meta.lockUntil);
      return res.render("terminal_verify", {
        phone,
        error: `Too many failed attempts. Try again in ${wait}s.`,
        resendWait: secondsLeft(meta.resendAvailableAt),
      });
    }

    // call Twilio verify check

    if (!client || !VERIFY_SID) {
      console.warn(
        "Twilio verify not configured — cannot validate OTP. (dev fallback)"
      );
      return res.render("terminal_verify", {
        phone,
        error: "Verification service not configured",
        resendWait: secondsLeft(meta.resendAvailableAt),
      });
    }

    let check;
    try {
      check = await client.verify.v2
        .services(VERIFY_SID)
        .verificationChecks.create({
          to: `+91${phone}`,
          code: code,
        });
    } catch (twErr) {
      console.error("Twilio verificationChecks error:", twErr);
      // don't reveal Twilio internals to user - show generic error
      return res.render("terminal_verify", {
        phone,
        error: "Failed to verify. Please try again.",
        resendWait: secondsLeft(meta.resendAvailableAt),
      });
    }

    if (!check || check.status !== "approved") {
      // wrong or expired OTP
      // increment attempts and optionally lock
      meta.attempts = (meta.attempts || 0) + 1;
      if (meta.attempts >= MAX_ATTEMPTS) {
        meta.lockUntil = Date.now() + ATTEMPT_LOCK_MS;
        // reset attempts (optional) and enforce cooldown
        meta.attempts = 0;
      }
      // save updated meta (and keep existing resend cooldown if present)
      otpMeta.set(phone, meta);

      const attemptsLeft = MAX_ATTEMPTS - (meta.attempts || 0);
      const userMsg =
        meta.lockUntil && Date.now() < meta.lockUntil
          ? `Too many failed attempts. Try again in ${secondsLeft(
              meta.lockUntil
            )}s.`
          : `Incorrect OTP. ${attemptsLeft} attempt(s) left.`;

      return res.render("terminal_verify", {
        phone,
        error: userMsg,
        resendWait: secondsLeft(meta.resendAvailableAt),
      });
    }

    // success: clear metadata and proceed
    otpMeta.delete(phone);

    // redirect to your next step (dropoff) — change as needed
    return res.redirect(`/site/dropoff?phone=${encodeURIComponent(phone)}`);
  } catch (err) {
    console.error("verify-otp error:", err);
    return res.status(500).send("Server error");
  }
});

app.post("/send-otp/whatsapp", async (req, res) => {
  try {
    const phone = (req.body.phone || "").trim();
    if (!phone) return res.status(400).send("phone required");
    // check Twilio client and verify service config
    if (!client || !WHATSAPP_VERIFY_SID) {
      console.warn(
        "Twilio verify client not configured — skipping SMS send (dev mode)."
      );
    }

    // check cooldown
    const meta = otpMeta.get(phone) || {};
    if (meta.resendAvailableAt && Date.now() < meta.resendAvailableAt) {
      const wait = secondsLeft(meta.resendAvailableAt);
      // Redirect to verify page with an error message (stays on the verify page)
      return res.redirect(
        `/terminal/verify?phone=${encodeURIComponent(
          phone
        )}&error=${encodeURIComponent(
          "Please wait " + wait + "s before requesting a new code"
        )}`
      );
    }

    // request Twilio Verify to send code (if configured)
    try {
      if (client && WHATSAPP_VERIFY_SID) {
        await client.verify.v2
          .services(WHATSAPP_VERIFY_SID)
          .verifications.create({
            to: `+91${phone}`,
            channel: "whatsapp",
          });
      } else {
        // dev fallback: log OTP send (Twilio not configured)
        console.log(
          `[dev] send-otp called for ${phone} (Twilio not configured)`
        );
      }
    } catch (twErr) {
      console.error("Twilio send-otp error:", twErr);
      return res.redirect(
        `/terminal/whatsapp/verify?phone=${encodeURIComponent(
          phone
        )}&error=${encodeURIComponent("Failed to send OTP. Try again.")}`
      );
    }

    // update metadata: reset attempts, set next allowed resend time
    otpMeta.set(phone, {
      resendAvailableAt: Date.now() + RESEND_COOLDOWN_MS,
      attempts: 0,
    });

    // Redirect to verify view (optionally provide a friendly message)
    return res.redirect(
      `/terminal/whatsapp/verify?phone=${encodeURIComponent(
        phone
      )}&message=${encodeURIComponent("OTP sent")}`
    );
  } catch (err) {
    console.error("send-otp error", err);
    return res.status(500).send("Server error");
  }
});

// -----------------------------------------
// GET /terminal/verify
// Render verify page and pass resendWait + optional messages
// -----------------------------------------
app.get("/terminal/whatsapp/verify", (req, res) => {
  const phone = (req.query.phone || "").trim();
  if (!phone) return res.status(400).send("Missing phone");

  const meta = otpMeta.get(phone) || {};
  const resendWait = secondsLeft(meta.resendAvailableAt);

  // message and error may come via query (redirect)
  const message = req.query.message || null;
  const error = req.query.error || null;

  return res.render("terminal_verify_whatsapp", {
    phone,
    message,
    error,
    resendWait,
  });
});

// -----------------------------------------
// POST /terminal/verify-otp
// Verify code with Twilio Verify and re-render page on failure
// -----------------------------------------
app.post("/terminal/whatsapp/verify-otp", async (req, res) => {
  try {
    const phone = (req.body.phone || "").trim();
    const code = (req.body.code || "").trim();

    if (!phone || !code) {
      return res.render("terminal_verify", {
        phone,
        error: "Missing phone or code",
        resendWait: 0,
      });
    }

    const meta = otpMeta.get(phone) || {};

    // check temporary lock
    if (meta.lockUntil && Date.now() < meta.lockUntil) {
      const wait = secondsLeft(meta.lockUntil);
      return res.render("terminal_verify", {
        phone,
        error: `Too many failed attempts. Try again in ${wait}s.`,
        resendWait: secondsLeft(meta.resendAvailableAt),
      });
    }

    // call Twilio verify check

    if (!client || !WHATSAPP_VERIFY_SID) {
      console.warn(
        "Twilio verify not configured — cannot validate OTP. (dev fallback)"
      );
      return res.render("terminal_verify", {
        phone,
        error: "Verification service not configured",
        resendWait: secondsLeft(meta.resendAvailableAt),
      });
    }

    let check;
    try {
      check = await client.verify.v2
        .services(WHATSAPP_VERIFY_SID)
        .verificationChecks.create({
          to: `+91${phone}`,
          code: code,
        });
    } catch (twErr) {
      console.error("Twilio verificationChecks error:", twErr);
      // don't reveal Twilio internals to user - show generic error
      return res.render("terminal_verify_whatsapp", {
        phone,
        error: "Failed to verify. Please try again.",
        resendWait: secondsLeft(meta.resendAvailableAt),
      });
    }

    if (!check || check.status !== "approved") {
      // wrong or expired OTP
      // increment attempts and optionally lock
      meta.attempts = (meta.attempts || 0) + 1;
      if (meta.attempts >= MAX_ATTEMPTS) {
        meta.lockUntil = Date.now() + ATTEMPT_LOCK_MS;
        // reset attempts (optional) and enforce cooldown
        meta.attempts = 0;
      }
      // save updated meta (and keep existing resend cooldown if present)
      otpMeta.set(phone, meta);

      const attemptsLeft = MAX_ATTEMPTS - (meta.attempts || 0);
      const userMsg =
        meta.lockUntil && Date.now() < meta.lockUntil
          ? `Too many failed attempts. Try again in ${secondsLeft(
              meta.lockUntil
            )}s.`
          : `Incorrect OTP. ${attemptsLeft} attempt(s) left.`;

      return res.render("terminal_verify_whatsapp", {
        phone,
        error: userMsg,
        resendWait: secondsLeft(meta.resendAvailableAt),
      });
    }

    // success: clear metadata and proceed
    otpMeta.delete(phone);

    // redirect to your next step (dropoff) — change as needed
    return res.redirect(`/site/dropoff?phone=${encodeURIComponent(phone)}`);
  } catch (err) {
    console.error("verify-otp error:", err);
    return res.status(500).send("Server error");
  }
});

app.get("/site/dropoff", async(req, res) => {
  const phone = req.query.phone || "";
  const locker = await Locker.findOne({ lockerId: lockerID });

    if (!locker) {
      return res.status(404).send("Locker not found");
    }

    // Tally totals and free (not booked) by size
    const sizes = ["small", "medium", "large"];
    const availability = { small: { total: 0, free: 0 }, medium: { total: 0, free: 0 }, large: { total: 0, free: 0 } };

    for (const c of locker.compartments) {
      if (!sizes.includes(c.size)) continue;
      availability[c.size].total += 1;
      if (!c.isBooked) availability[c.size].free += 1; // free if NOT booked
    }

    // (Optional) total rates you use on the page
    const PRICE = { small: 5, medium: 10, large: 20 };
  // Render the dropoff page and give it the verified phone to prefill the form
  res.render("site_dropoff", { phone,availability,
      PRICE });
});

app.post("/terminal/dropoff", async (req, res) => {
  try {
    const { size, hours, phone } = req.body;
    const PRICES = { small: 5, medium: 10, large: 20 };

    if (!size || !PRICES[size]) return res.status(400).send("Invalid size");
    const hrs = parseInt(hours, 10);
    if (!hrs || hrs < 1 || hrs > 72)
      return res.status(400).send("Invalid hours");

    if (!phone) return res.status(400).send("Phone required");

    const pricePerHour = PRICES[size];
    const total = pricePerHour * hrs;
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + hrs * 60 * 60 * 1000);
    const customId = `PCL-${Date.now()}-${Math.floor(
      1000 + Math.random() * 9000
    )}`;
    const terminal_store = true;
    const accessCode = Math.floor(100000 + Math.random() * 900000).toString();
    // Create Parcel object
    const parcelData = {
      senderPhone: phone,
      receiverPhone: phone, // change if receiver is different
      size,
      terminal_store,
      hours: String(hrs),
      accessCode: accessCode, // short unique access code
      customId: customId,
      cost: mongoose.Types.Decimal128.fromString(total.toString()),
      expiresAt,
      createdAt,
    };

    // Save parcel
    const parcel = new Parcel2(parcelData);
    await parcel.save();

    return res.redirect(`/terminal/parcel/${parcel._id}`);
  } catch (err) {
    console.error("dropoff error:", err);
    return res.status(500).send("Server error");
  }
});
app.get("/terminal/parcel/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).send("Invalid parcel id");

    const parcel = await Parcel2.findById(id).lean();
    if (!parcel) return res.status(404).send("Parcel not found");

    // Convert Decimal128 to number for the view (safe)
    let cost = 0;
    if (parcel.cost) {
      try {
        cost = Number(parcel.cost.toString());
      } catch (e) {
        cost = 0;
      }
    }

    res.render("terminal_parcel_details", {
      parcel,
      cost,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error("parcel details error:", err);
    return res.status(500).send("Server error");
  }
});

// CREATE ORDER
app.post("/terminal/razorpay/create-order", async (req, res) => {
  try {
    const { parcelId } = req.body;
    if (!parcelId || !mongoose.Types.ObjectId.isValid(parcelId))
      return res.status(400).json({ error: "Invalid parcelId" });

    if (!process.env.RAZORPAY_KEY_SECRET)
      return res.status(500).json({ error: "Server misconfiguration" });

    const parcel = await Parcel2.findById(parcelId);
    if (!parcel) return res.status(404).json({ error: "Parcel not found" });
    if (parcel.paymentStatus === "completed")
      return res.status(400).json({ error: "Already paid" });

    const amountINR = Number(parcel.cost ?? 0);
    const amountPaise = Math.round(amountINR * 100);
    if (!Number.isFinite(amountPaise) || amountPaise < 100)
      return res.status(400).json({ error: "Invalid amount (min ₹1)" });

    const rawPhone = String(parcel.phone || parcel.receiverPhone || "").replace(/\D/g, "");
    if (!/^\d{10}$/.test(rawPhone))
      return res.status(400).json({ error: "No valid 10-digit phone on parcel" });
    const contact = `+91${rawPhone}`;

    // Reuse existing order if still pending (helps idempotency)
    if (parcel.razorpayOrderId && parcel.paymentStatus === "pending") {
      return res.json({ id: parcel.razorpayOrderId, currency: "INR", amount: amountPaise, contact });
    }

    const options = {
      amount: amountPaise,
      currency: "INR",
      receipt: `rcpt_${parcel._id}`,
      notes: { parcelId: parcel._id.toString(), customId: parcel.customId || "" },
    };

    const order = await razorpay.orders.create(options);

    parcel.razorpayOrderId = order.id;
    parcel.paymentStatus = "pending";
    await parcel.save();

    return res.json({ id: order.id, currency: order.currency, amount: order.amount, contact });
  } catch (err) {
    console.error("create-order error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// VERIFY
app.post("/terminal/razorpay/verify", async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, parcelId } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !parcelId)
      return res.status(400).json({ error: "Missing parameters" });

    if (!process.env.RAZORPAY_KEY_SECRET)
      return res.status(500).json({ error: "Server misconfiguration" });

    const parcel = await Parcel2.findById(parcelId);
    if (!parcel) return res.status(404).json({ error: "Parcel not found" });
    if (parcel.paymentStatus === "completed")
      return res.json({ success: true, parcelId: parcel._id }); // idempotent success

    if (!parcel.razorpayOrderId || parcel.razorpayOrderId !== razorpay_order_id)
      return res.status(400).json({ error: "Order does not match parcel" });

    const generated_signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");
    if (generated_signature !== razorpay_signature)
      return res.status(400).json({ error: "Invalid signature" });

    // (Optional) confirm payment state with Razorpay
    // const payment = await razorpay.payments.fetch(razorpay_payment_id);
    // if (payment.status !== "captured" && payment.status !== "authorized")
    //   return res.status(400).json({ error: `Unexpected payment status: ${payment.status}` });

    const updated = await Parcel2.findOneAndUpdate(
      { _id: parcelId, paymentStatus: { $ne: "completed" } },
      {
        $set: {
          razorpayOrderId: razorpay_order_id,
          razorpayPaymentId: razorpay_payment_id,
          razorpaySignature: razorpay_signature,
          paymentStatus: "completed",
          paidAt: new Date(),
        },
      },
      { new: true }
    );

    return res.json({ success: true, parcelId: (updated || parcel)._id });
  } catch (err) {
    console.error("verify error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});


// GET /api/lockers/all-locked
// Optional query: ?addrs=0,1  (comma-separated decimal or hex like "0x00,0x01")
app.get("/api/lockers/all-locked", async (req, res) => {
  try {
    // decide which addresses to poll
    const addrs =
      (req.query.addrs
        ? String(req.query.addrs).split(",").map(s => {
            s = s.trim();
            return s.startsWith("0x") ? parseInt(s, 16) : parseInt(s, 10);
          })
        : [0x00] // default: two BUs
      ).filter(n => Number.isInteger(n) && n >= 0);

    if (!addrs.length) {
      return res.status(400).json({ success: false, message: "No valid addresses provided." });
    }

    const perAddr = {};
    const unlockedList = [];
    let anyUnlocked = false;

    for (const addr of addrs) {
      // ask this BU for status
      const data = await sendPacket(buildGetStatusPacket(addr));

      if (!data) {
        // couldn't get a frame — be conservative
        perAddr[addr] = { ok: false, error: "no_response" };
        anyUnlocked = true;
        continue;
      }

      const status = parseLockStatus(data); // => { Lock_0: "Locked"/"Unlocked", ... }
      if (!status) {
        perAddr[addr] = { ok: false, error: "parse_failed", raw: data.toString("hex") };
        anyUnlocked = true;
        continue;
      }

      // collect results for 0..11
      const locks = {};
      for (let i = 0; i < 5; i++) {
        const s = status[`Lock_${i}`];
        locks[i] = s;
        if (s === "Unlocked") {
          anyUnlocked = true;
          unlockedList.push({ addr, index: i });
        }
      }

      perAddr[addr] = { ok: true, status: locks };
    }

    return res.json({
      success: true,
      allLocked: !anyUnlocked,
      checkedAt: new Date().toISOString(),
      perAddr,
      unlockedList
    });
  } catch (err) {
    console.error("all-locked API error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

async function unlockWithRetry(lockNum, addr, { attempts = 4, firstDelayMs = 400, stepMs = 250 } = {}) {
  for (let i = 1; i <= attempts; i++) {
    const sent = await sendUnlock(lockNum, addr);
    if (!sent) {
      // write failed; try again after a short wait
      await wait(firstDelayMs + (i - 1) * stepMs);
      continue;
    }
    // give hardware a moment, then verify
    await wait(firstDelayMs + (i - 1) * stepMs);
    const status = await checkLockerStatus(addr, lockNum, 2000);
    if (status === "Unlocked") {
      return true;
    }
  }
  return false;
}
async function accessHandler(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).send("Invalid parcel id");

    const parcel = await Parcel2.findById(id);
    if (!parcel) return res.status(404).send("Parcel not found");

    // determine locker
    const lockerId = lockerID || req.body.lockerId || req.query.lockerId;
    if (!lockerId) {
      return res.status(400).send("Locker ID is required.");
    }

    const locker = await Locker.findOne({ lockerId });
    if (!locker) return res.status(404).send("Locker not found.");

    // pick or reuse a compartment
    let compartment =
      locker.compartments.find(c => c.compartmentId === parcel.compartmentId) ||
      locker.compartments.find(c => !c.isBooked && c.size === parcel.size);

    if (!compartment) {
      return res.status(400).send("No available compartments in this locker.");
    }

    // map to (addr, lock num)
    let addr = 0x00;
    let lockNum = parseInt(compartment.compartmentId, 10);
    if (lockNum > 11) { addr = 0x01; lockNum = lockNum - 12; }

    // try unlock
    const unlocked = await unlockWithRetry(lockNum, addr, { attempts: 5, firstDelayMs: 450, stepMs: 250 });

    if (!unlocked) {
      // Render retry page with a button that POSTs to the same endpoint
      return res.render("terminal_unlock_retry", {
        parcelId: parcel._id,
        lockerId,
        message: "The locker did not open automatically.",
        hint: "Please try again."
      });
    }

    // ✅ only update DB after verified unlocked              // door is open
    compartment.isBooked = true;                // reserved for this parcel
    compartment.currentParcelId = parcel._id;
    await locker.save();

    parcel.status = "awaiting_pick";
    parcel.lockerLat = locker.location.lat;
    parcel.lockerLng = locker.location.lng;
    parcel.lockerId = lockerId;
    parcel.compartmentId = compartment.compartmentId;
    parcel.UsercompartmentId = parseInt(compartment.compartmentId, 10) + 1;
    parcel.droppedAt = new Date();

    const qrImage = await QRCode.toDataURL(parcel.accessCode);
    await parcel.save();
    await client.messages.create({
    to: `whatsapp:+91${parcel.senderPhone}`,
    from: 'whatsapp:+15558076515',
    contentSid: 'HXe73f967b34f11b7e3c9a7bbba9b746f6', 
    contentVariables: JSON.stringify({
      2: `${id}/qr`, 
})
}).then(message => console.log('✅ WhatsApp Message Sent:', message.sid))
.catch(error => console.error('❌ WhatsApp Message Error:', error));
    if (parcel.paymentStatus !== "completed") {
      return res.status(403).send("Payment required to view access code");
    }

    return res.render("terminal_parcel_access", {
      accessCode: parcel.accessCode,
      customId: parcel.customId,
      qrImage,
      parcelId: parcel._id
    });
  } catch (err) {
    console.error("parcel access error:", err);
    return res.status(500).send("Server error");
  }
}

// Same endpoint supports both GET and POST
app.all("/terminal/parcel/:id/access", express.urlencoded({ extended: true }), express.json(), accessHandler);

app.get("/mobile/incoming/:id/qr", async (req, res) => {
  const parcel = await Parcel2.findById(req.params.id).lean();
  const parcelLocker = parcel.lockerId || "";
  const accessCode = parcel.accessCode;
  let qrImage;


  if(!parcel) return res.status(404).send("Parcel not found");
  if (!parcel.qrImage)
    return res.status(400).send("No QR code saved for this parcel");
  res.render("qrPage", { parcel,qrImage });
});


/////UNLOCK CRON JOB


cron.schedule("*/2 * * * * *", async () => {

  try {
    const locker = await Locker.findOne({ lockerId: "L00002" });
    if (!locker) return console.log("Locker not found");

    for (const compartment of locker.compartments) {
      if (!compartment.isLocked) {
        console.log(`[CRON] Unlocking ${locker.lockerId} compartment ${compartment.compartmentId}`);

        const rawNum = parseInt(compartment.compartmentId, 10);
        if (isNaN(rawNum)) continue;

        const addr = 0x00;
        const lockNum = rawNum % 12;

        const sent = await sendUnlock(lockNum, addr);
        if (!sent) continue;

        await wait(500);
        const status = await checkLockerStatus(addr, lockNum, 2000);

        if (status === "Unlocked") {
          await Locker.updateOne(
            { lockerId: "L00002", "compartments.compartmentId": compartment.compartmentId },
            { $set: { "compartments.$.isLocked": true } }
          );
          console.log(`[CRON] ✅ Successfully unlocked compartment ${compartment.compartmentId}`);
        }
      }
    }
  } catch (err) {
    console.error("[CRON] Error:", err);
  }
});



app.listen(3000, () => console.log("Server listening on :3000"));
