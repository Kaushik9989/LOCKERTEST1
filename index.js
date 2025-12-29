const os = require('os');
const express = require("express");
const mongoose = require("mongoose");
mongoose.set("bufferCommands", false);
mongoose.set("bufferTimeoutMS", 0);
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
const Terminal = require("./models/terminal.js");   
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
const TERMINAL_ID = "L00002";
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
const {sendSMS} = require("./smartping.js");
const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
const VERIFY_SID = TWILIO_VERIFY_SERVICE_SID;
const WHATSAPP_VERIFY_SID = TWILIO_WHATSAPP_VERIFY_SID;

const PRICES = { small: 5, medium: 10, large: 20 };

app.engine("ejs", ejsMate); // Set ejs-mate as the EJS engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(cors());
app.use(express.json());
app.use(require("express-session")({
  secret: "kiosk-secret",
  resave: false,
  saveUninitialized: true
}));

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
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
// ---------------------------------------------
// Internet Check Function
// ---------------------------------------------
function checkInternet(timeoutMs = 3000) {
  return new Promise((resolve) => {
    const req = https.get("https://clients3.google.com/generate_204", (res) => {
      resolve(res.statusCode === 204); // 204 → TRUE internet
      req.destroy();
    });

    req.on("error", () => resolve(false));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(false);
    });
  });
} 

// ---------------------------------------------
// Infinite Wait Loop for Internet
// ---------------------------------------------
async function waitForInternetForever() {
  console.log("📡 Checking for internet...");

  while (true) {
    const ok = await checkInternet();

    if (ok) {
      console.log("🌍 Internet connected!");
      return; // Move ahead ONLY now
    }

    console.log("❌ No internet. Retrying in 5 seconds...");
    await sleep(5000); // Infinite loop until internet is back
  }
}

// ---------------------------------------------
// Mongo Connection After Internet
// ---------------------------------------------
// ---------------------------------------------
// Mongo Connection After Internet
// ---------------------------------------------
async function connectMongo(uri) {
  if (!uri) {
    console.error("❌ MONGO_URI is not set. Aborting.");
    process.exit(1);
  }

  while (true) {
    try {
      console.log("🔌 [Mongo] Trying to connect...");
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
      console.log("✅ MongoDB connected");
      return;
    } catch (err) {
      console.error("❌ MongoDB error:", err.message);
      console.log("Retrying in 5 seconds...");
      await sleep(5000);
    }
  }
}

// ---------------------------------------------
// Start Application
// ---------------------------------------------
(async () => {
  await waitForInternetForever();   // <-- BLOCK here until internet is available
  await connectMongo(process.env.MONGO_URI); // Connect only after internet is stable

  // Start your server here
  // require("./server.js");
  console.log("🚀 App fully started!");
})();

// // --- Step 2: Connect Mongo ---
// async function connectMongo() {
//   try {
//     await mongoose.connect(process.env.MONGO_URI, {
//       serverSelectionTimeoutMS: 10000, // wait max 5s
//     });
//     console.log("✅ MongoDB connected");
//     // require("./server.js"); // start express
//   } catch (err) {
//     console.error("❌ MongoDB connection error:", err.message);
//     console.log("🔁 Exiting, will restart when PM2 restarts the process...");
//     process.exit(1); // let PM2/system restart
//   }
// }

// function waitForInternet(retries = 20) {
//   checkInternet((connected) => {
//     if (connected) {
//       console.log("🌍 Internet detected, trying MongoDB...");
//       connectMongo();
//     } else {
//       if (retries <= 0) {
//         console.error("❌ Internet not available after retries, exiting.");
//         process.exit(1);
//       }
//       console.log("❌ No internet yet, retrying in 5s...");
//       setTimeout(() => waitForInternet(retries - 1), 5000);
//     }
//   });
// }

// // --- Start process ---
// waitForInternet();

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

async function startBuAndPolling() {
  await connectToBU();

  // Start polling lockers for live UI updates
  startPolling(0x00, 500, io);
  startPolling(0x01, 500, io);
  startPollingMultiple([0x00, 0x01], 500, io);
}







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
const now = new Date();

// 1️⃣ First, reclaim overstayed compartments of required size
for (const c of locker.compartments) {
  if (
    c.size !== parcel.size ||
    !c.isBooked ||
    !c.isOverstay ||
    !c.currentParcelId
  ) continue;

  const oldParcel = await Parcel2.findOne({
    customId: c.currentParcelId
  });

  if (!oldParcel) {
    // Corrupt state → just free it
    c.isBooked = false;
    c.isOverstay = false;
    c.currentParcelId = null;
    continue;
  }

  // 📢 Notify old parcel user
  try {
    await client.messages.create({
      to: `whatsapp:+91${oldParcel.receiverPhone}`,
      from: "whatsapp:+15558076515",
      contentSid: "HXaf300dc862c5bf433a99649bf553a34e",
      contentVariables: JSON.stringify({
        2: oldParcel.customId
      })
    });
  } catch (err) {
    console.error("❌ Overstay notify failed:", err.message);
  }

  // 📦 Mark old parcel as unavailable
  oldParcel.status = "expired";
  await oldParcel.save();

  // 🧹 Free the compartment
  c.isBooked = false;
  c.isOverstay = false;
  c.currentParcelId = null;
}

// 2️⃣ Now find a free compartment
compartment = locker.compartments.find(
  (c) => !c.isBooked && c.size === parcel.size
);

if (!compartment) {
  return res.status(400).json({
    success: false,
    message: "No available compartments in this locker.",
  });
}

// 3️⃣ Persist locker changes
await locker.save();


      let addr = 0x00;
      let lockNum = parseInt(compartment.compartmentId);

      if (lockNum > 11) {
        addr = 0x01; // second BU
        lockNum = lockNum - 12; // reset to 0–11 range
      }

      // const sent = await sendUnlock(lockNum, addr);
      // if (!sent) {
      //   console.warn(
      //     `❌ Failed to send unlock packet to locker ${compartment.compartmentId}`
      //   );
      //   return res
      //     .status(502)
      //     .json({ success: false, message: "Failed to send unlock packet." });
      // }

      // //2) Verify unlocked
      // await wait(500);
      // const status = await checkLockerStatus(addr, lockNum, 2000);
      // if (status !== "Unlocked") {
      //   return res.status(504).json({
      //     success: false,
      //     message: "Compartment did not unlock (timeout or still locked).",
      //     details: { addr, lockNum, reported: status || null },
      //   });
      // }

      // Lock the compartment
      compartment.isBooked = true;
      compartment.currentParcelId = parcel.customId;
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
            2: `mobile/incoming/${parcel.customId}/qr`,
          }),
        });
    const smsText2 = `Item successfully dropped at Locker ${locker.lockerId}. Pickup code: ${parcel.accessCode}. Share this securely. Receiver can also access via ${`https://demo.droppoint.in/${parcel.customId}/qr`} - DROPPOINT`;
    const sendResult2 = sendSMS(`91${parcel.senderPhone}`,smsText2);
    console.log(sendResult2);
      } else {
        await client.messages.create({
          to: `whatsapp:+91${parcel.receiverPhone}`,
          from: "whatsapp:+15558076515",
          contentSid: "HX4200777a18b1135e502d60b796efe670", // Approved Template SID
          contentVariables: JSON.stringify({
            1: parcel.receiverName,
            2: parcel.senderName,
            3: `mobile/incoming/${parcel.customId}/qr`,
            4: `dir/?api=1&destination=${parcel.lockerLat},${parcel.lockerLng}`,
          }),
        });
        
      }
         const smsText3 = `Item successfully dropped at Locker ${locker.lockerId}. Pickup code: ${parcel.accessCode}. Share this securely. Receiver can also access via ${`https://demo.droppoint.in/qr?parcelid=${parcel.customId}`} - DROPPOINT`;
          
        const sendResult3 = sendSMS(`91${parcel.senderPhone}`,smsText3);
        console.log(sendResult3);
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

    if (parcel.status === "awaiting_pick" || parcel.status === "in_locker" || parcel.status === "overstay") {
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
    

      if (["picked", "closed_no_charge"].includes(parcel.status)) {
        return res.json({
          success: false,
          message: "Parcel service already closed"
        });
      }

      // Find locker and compartment
      const locker = await Locker.findOne({ lockerId: parcel.lockerId });

      if (!locker) {
        return res
          .json({ success: false, message: "Locker not found." });
      }

      const compartment = locker.compartments.find(
        (c) => c.compartmentId === parcel.compartmentId
      );
      if (!compartment) {
        return res.json({ success: false, message: "Compartment not found." });
      }

            if (
        !compartment ||
        compartment.currentParcelId?.toString() !== parcel.customId.toString()
      ) {
        await Parcel2.updateOne(
          { _id: parcel._id },
          {
            $set: {
              status: "closed_no_charge",
              closureReason: "reassigned_no_charge",
              "billing.isChargeable": false,
              "billing.amountAccrued": 0
            }
          }
        );

        return res.json({
          success: false,
          message: "Parcel no longer available. Locker was reassigned."
        });
      }

      const now = new Date();

       if (parcel.expiresAt < now && parcel.status !== "overstay"){
        await Parcel2.updateOne(
          { _id: parcel._id },
          {
            $set: {
              status: "overstay",
              "billing.isChargeable": true
            }
          }
        );
        parcel.status = "overstay";
      }

        if (parcel.status === "overstay") {
        let amount = parcel.billing.amountAccrued;
        if(parcel.billing.amountAccured == 0){
          const diffMs = now - parcel.expiresAt;
        const hours = Math.ceil(diffMs / (1000 * 60 * 60));
        const rate = RATE_BY_SIZE[parcel.size] || 0;
        amount = hours * rate;

        await Parcel2.updateOne(
          { _id: parcel._id },
          { $set: { "billing.amountAccrued": amount } }
        );
        }
        

        if (amount > 0 ) {
          if (!parcel.razorpayOrderId) {
            const order = await razorpay.orders.create({
              amount: amount * 100,
              currency: "INR",
              receipt: `parcel_${parcel.customId}`
            });

            await Parcel2.updateOne(
              { _id: parcel._id },
              {
                $set: {
                  razorpayOrderId: order.id,
                  cost: amount,
                  paymentStatus: "pending"
                }
              }
            );
          }

          return res.json({
            success: false,
            paymentRequired: true,
            message: `Please pay ₹${amount} to unlock`,
            paymentPage: `/pay/${parcel.customId}`,
            amount
          });
        }
      }


      let addr1 = 0x00;
      let lockNum1 = parseInt(compartment.compartmentId);

      if (lockNum1 > 11) {
        addr1 = 0x01; // second BU
        lockNum1 = lockNum1 - 12; // reset to 0–11 range
      }
      const sent = await sendUnlock(lockNum1, addr1);
      // if (!sent) {
      //   console.warn(
      //     `❌ Failed to send unlock packet to locker ${compartment.compartmentId}`
      //   );
      //   return res
      //     .status(502)
      //     .json({ success: false, message: "Failed to send unlock packet." });
      // }

      // // 2) Verify unlocked
      // await wait(500);
      // const status = await checkLockerStatus(addr1, lockNum1, 2000);
      // if (status !== "Unlocked") {
      //   return res.status(504).json({
      //     success: false,
      //     message: "Compartment did not unlock (timeout or still locked).",
      //     details: { addr: addr1, lockNum: lockNum1, reported: status || null },
      //   });
      // }

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
      compartment.isOverstay = false;
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

app.get("/", async(req, res) => {
   const locker = await Locker.findOne({ lockerId: lockerID });
  res.render("terminal_landing",{
    lockerId: locker.lockerId,
    compartments: locker.compartments,
  });
});
app.get("/dropoff", (req, res) => {
  res.render("dropoff");
});

app.get("/pickup", (req, res) => {
  res.render("pickup");
});

app.get("/pickup-code", (req, res) => {
  res.render("pickup-code", {
    pickup : true
  });
});
app.get("/drop-code", (req, res) => {
  res.render("pickup-code", {
    pickup : false
  });
});

app.get("/delivery-code", (req, res) => {
  res.render("pickup-code", {
    pickup : false
  });
});
// helper
const RATE_BY_SIZE = {
  small: 5,
  medium: 10,
  large: 20
};

function calculateOverdueHours(expiresAt) {
  const now = Date.now();
  const expiry = new Date(expiresAt).getTime();
  if (now <= expiry) return 0;
  return Math.ceil((now - expiry) / (1000 * 60 * 60));
}


    //  // ============= DROP-OFF FLOW =============
    //   if (parcel.status === "awaiting_drop") {
    //     if (!lockerId) {
    //       return res
    //         .status(400)
    //         .json({
    //           success: false,
    //           message: "Locker ID is required for drop-off.",
    //         });
    //     }

    //     // If already assigned, enforce same locker
    //     if (parcel.lockerId && parcel.lockerId !== lockerId) {
    //       return res.status(400).json({
    //         success: false,
    //         message: `This parcel is assigned to locker ${parcel.lockerId}.`,
    //         lockerMismatch: true,
    //         expectedLocker: parcel.lockerId,
    //       });
    //     }

    //     const locker = await Locker.findOne({ lockerId });
    //     if (!locker) {
    //       return res
    //         .status(404)
    //         .json({ success: false, message: "Locker not found." });
    //     }

    //     // pick a free compartment matching size
    //     const compartment = locker.compartments.find(
    //       (c) => !c.isBooked && c.size === parcel.size
    //     );
    //     if (!compartment) {
    //       return res
    //         .status(400)
    //         .json({
    //           success: false,
    //           message: "No available compartments in this locker.",
    //         });
    //     }

        
    //     // map to controller address + index (0..11)
    //     let addr = 0x00;
    //     let lockNum = parseInt(compartment.compartmentId);
    //     if (lockNum > 11) {
    //       addr = 0x01;
    //       lockNum = lockNum - 12;
    //     }

    //     // 1) send unlock
    //     const sent = await sendUnlock(lockNum, addr);
    //     if (!sent) {
    //       console.warn(
    //         `❌ Failed to send unlock packet to locker ${compartment.compartmentId}`
    //       );
    //       return res
    //         .status(502)
    //         .json({ success: false, message: "Failed to send unlock packet." });
    //     }

    //     // 2) verify hardware actually unlocked
    //     await wait(500);
    //     const status = await checkLockerStatus(addr, lockNum, 2000);
    //     if (status !== "Unlocked") {
    //       return res.status(504).json({
    //         success: false,
    //         message: "Compartment did not unlock (timeout or still locked).",
    //         details: { addr, lockNum, reported: status || null },
    //       });
    //     }

    //     // 3) update DB ONLY NOW (door is unlocked/open)
    //     // it's unlocked now
    //     compartment.isBooked = true; // reserving for this parcel
    //     compartment.currentParcelId = parcel._id;
    //     await locker.save();

    //     // parcel now awaiting_pick (user will place item and close door)
    //     parcel.status = "awaiting_pick";
    //     parcel.lockerLat = locker.location.lat;
    //     parcel.lockerLng = locker.location.lng;
    //     parcel.lockerId = locker.lockerId; // assign
    //     parcel.compartmentId = compartment.compartmentId;
    //     parcel.UsercompartmentId = parseInt(compartment.compartmentId) + 1;
    //     parcel.droppedAt = new Date();
    //     await parcel.save();

    //     // notifications
    //     if (parcel.store_self) {
    //       await client.messages.create({
    //         to: `whatsapp:+91${parcel.senderPhone}`,
    //         from: "whatsapp:+15558076515",
    //         contentSid: "HXa7a69894f9567b90c1cacab6827ff46c",
    //         contentVariables: JSON.stringify({
    //           1: parcel.senderName,
    //           2: `mobile/incoming/${parcel._id}/qr`,
    //         }),
    //       });
    //       const smsText1 = `Item successfully dropped at Locker ${locker.lockerId}. Pickup code: ${parcel.accessCode}. Share this securely. Receiver can also access via ${`https://demo.droppoint.in/qr?parcelid=${parcel.customId}`} - DROPPOINT`;
    //       const sendResult1 = sendSMS(`91${parcel.senderPhone}`,smsText1);
    //       console.log(sendResult1);
    //     }
    //     await client.messages.create({
    //       to: `whatsapp:+91${parcel.receiverPhone}`,
    //       from: "whatsapp:+15558076515",
    //       contentVariables: JSON.stringify({
    //         1: parcel.receiverName,
    //         2: parcel.senderName,
    //         3: `mobile/incoming/${parcel._id}/qr`,
    //         4: `dir/?api=1&destination=${parcel.lockerLat},${parcel.lockerLng}`,
    //       }),
    //     });

    //     io.emit("parcelUpdated", {
    //       parcelId: parcel._id,
    //       status: parcel.status,
    //       lockerId: parcel.lockerId,
    //       compartmentId: parseInt(parcel.compartmentId) + 1,
    //       droppedAt: parcel.droppedAt,
    //     });

    //     return res.json({
    //       success: true,
    //       message: `Parcel dropped. Compartment ${compartment.compartmentId} is unlocked for loading.`,
    //       compartmentId: parseInt(parcel.compartmentId) + 1,
    //       lockerId: locker._id,
    //       status: parcel.status,
    //     });
    //   }




function calculateOverstayCharge(parcel) {
  if (!parcel.billing?.isChargeable) return 0;

  const now = new Date();
  const last = parcel.billing.lastCalculatedAt || parcel.service.overstayStartedAt;
  if (!last) return 0;

  const diffMs = now - last;
  if (diffMs <= 0) return 0;

  const hours = Math.ceil(diffMs / (1000 * 60 * 60));
  const amount = hours * parcel.billing.ratePerHour;

  parcel.billing.amountAccrued += amount;
  parcel.billing.lastCalculatedAt = now;

  return parcel.billing.amountAccrued;
}









app.post("/api/locker/unlock-code", express.json(), async (req, res) => {
  try {
    const { accessCode } = req.body;

    if (!accessCode || accessCode.length !== 6) {
      return res.status(400).json({
        success: false,
        message: "Invalid code"
      });
    }

    const now = new Date();

    // =====================================================
    // 1️⃣ FIRST: CHECK DROP OTP
    // =====================================================
const lockerWithOtp = await Locker.findOne({
  $or: [
    { "compartments.bookingInfo.dropOtp": accessCode },
    { "compartments.bookingInfo.pickupOtp": accessCode }
  ]
});
if (lockerWithOtp) {
      const compartment = lockerWithOtp.compartments.find(
        c => c.bookingInfo?.dropOtp === accessCode || c.bookingInfo?.pickupOtp === accessCode 
      );

      if (!compartment) {
        return res.status(400).json({
          success: false,
          message: "Invalid drop code"
        });
      }

      // 🔓 Unlock hardware
      let addr = 0x00;
      let lockNum = parseInt(compartment.compartmentId);

      if (lockNum > 11) {
        addr = 0x01;
        lockNum -= 12;
      }

      // const sent = await sendUnlock(lockNum, addr);
      // if (!sent) {
      //   return res.status(502).json({
      //     success: false,
      //     message: "Locker not responding"
      //   });
      // }
      // Generate pickup OTP
      if(compartment.bookingInfo.dropOtp === accessCode){
         sendSMS(
        `91${compartment.bookingInfo.recieverPhone}`,
      `Dear ${compartment.bookingInfo.recieverName}, please share this code with your delivery partner to drop your parcel. Drop code : ${compartment.bookingInfo.dropOtp}. -DROPPOINT`
      );

      const pickupOtp = generatenewOtp();
      compartment.bookingInfo.pickupOtp = pickupOtp;
      compartment.bookingInfo.dropOtp = null;
      compartment.bookingInfo.dropOtpUsed = true;

      await lockerWithOtp.save();
        sendSMS(
        `91${compartment.bookingInfo.recieverPhone}`,
      `Dear ${compartment.bookingInfo.recieverName}, your parcel has been dropped securely at the locker. Please pick it up using this code : ${compartment.bookingInfo.pickupOtp}. -DROPPOINT`
      );
            return res.json({
        success: true,
        type: "drop",
        message: "Locker opened for drop"
      });
    }
    else if (compartment.bookingInfo.pickupOtp === accessCode) {

  // ✅ CLEAR BOOKING
  compartment.bookingInfo.pickupOtp = null;
  compartment.bookingInfo.dropOtp = null;
  compartment.bookingInfo.dropOtpUsed = false;
  compartment.bookingInfo.recieverName = null;
  compartment.bookingInfo.recieverPhone = null;

  compartment.isBooked = false;
  compartment.currentParcelId = null;

  // 🔥 IMPORTANT: tell mongoose this changed
  lockerWithOtp.markModified("compartments");
  await lockerWithOtp.save();

  return res.json({
    success: true,
    type: "pickup",
    message: "Parcel picked up successfully"
  });
}

}





    // =====================================================
    // 2️⃣ ELSE → CHECK PICKUP ACCESS CODE
    // =====================================================
    const parcel = await Parcel2.findOne({ accessCode });

    if (!parcel) {
      return res.status(404).json({
        success: false,
        message: "Invalid code"
      });
    }

    if (["picked", "closed_no_charge"].includes(parcel.status)) {
      return res.status(400).json({
        success: false,
        message: "Parcel already closed"
      });
    }

    const locker = await Locker.findOne({ lockerId: parcel.lockerId });
    if (!locker) {
      return res.status(404).json({
        success: false,
        message: "Locker not found"
      });
    }

    const compartment = locker.compartments.find(
      c => c.compartmentId === parcel.compartmentId
    );

    if (
      !compartment ||
      compartment.currentParcelId?.toString() !== parcel.customId.toString()
    ) {
      await Parcel2.updateOne(
        { _id: parcel._id },
        {
          $set: {
            status: "closed_no_charge",
            "billing.isChargeable": false
          }
        }
      );

      return res.status(410).json({
        success: false,
        message: "Parcel reassigned"
      });
    }

    // ⏱ Overstay logic
    if (parcel.expiresAt < now && parcel.status !== "overstay") {
      parcel.status = "overstay";
      parcel.billing.isChargeable = true;
      await parcel.save();
    }

    if (parcel.status === "overstay") {
      let amount = parcel.billing.amountAccrued || 0;

      if (!amount) {
        const diff = now - parcel.expiresAt;
        const hours = Math.ceil(diff / (1000 * 60 * 60));
        const rate = RATE_BY_SIZE[parcel.size];
        amount = hours * rate;

        await Parcel2.updateOne(
          { _id: parcel._id },
          { $set: { "billing.amountAccrued": amount } }
        );
      }

      return res.status(402).json({
        success: false,
        paymentRequired: true,
        amount,
        paymentPage: `/pay/${parcel.customId}`
      });
    }

    // 🔓 Unlock locker
    let addr = 0x00;
    let lockNum = parseInt(compartment.compartmentId);

    if (lockNum > 11) {
      addr = 0x01;
      lockNum -= 12;
    }

    // const sent = await sendUnlock(lockNum, addr);
    // if (!sent) {
    //   return res.status(502).json({
    //     success: false,
    //     message: "Unlock failed"
    //   });
    // }

    compartment.isBooked = false;
    compartment.currentParcelId = null;
    await locker.save();

    await Parcel2.updateOne(
      { _id: parcel._id },
      {
        $set: {
          status: "picked",
          pickedUpAt: new Date(),
          "billing.isChargeable": false
        }
      }
    );

    return res.json({
      success: true,
      type: "pickup",
      message: "Locker unlocked successfully"
    });

  } catch (err) {
    console.error("UNLOCK ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});


////  PAY FOR OVERSTAY

app.get("/pay/:parcelId", async (req, res) => {
  try {
    const { parcelId } = req.params;

    // 🔍 Find parcel (using customId as you want)
    const parcel = await Parcel2.findOne({ customId: parcelId });
    if (!parcel) {
      return res.status(404).send("Parcel not found");
    }

    // 🎯 Render payment page
    res.render("pay", {
      parcel,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID,
      amount : parcel.billing.amountAccrued
    });

  } catch (err) {
    console.error("Payment page error:", err);
    res.status(500).send("ERROR OCCURRED. PLEASE TRY LATER");
  }
});



app.post("/api/payment/create-order", async (req, res) => {
  try {
    const { parcelId } = req.body;

    const parcel = await Parcel2.findOne({ customId: parcelId });
    if (!parcel) {
      return res.json({ success: false, message: "Parcel not found" });
    }

    const amount = Math.round(parcel.billing.amountAccrued * 100); // paise

    const order = await razorpay.orders.create({
      amount,
      currency: "INR",
      receipt: parcel.customId,
      notes: {
        parcelId: parcel.customId
      }
    });

    // Save orderId for verification
    parcel.billing.razorpayOrderId = order.id;
    await parcel.save();

    res.json({
      success: true,
      orderId: order.id,
      amount
    });
  } catch (err) {
    console.error("Create order error:", err);
    res.status(500).json({ success: false });
  }
});



app.post("/api/payment/verify", async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      parcelId
    } = req.body;

    const parcel = await Parcel2.findOne({ customId: parcelId });
    if (!parcel) {
      return res.json({ success: false });
    }

    // 🔐 Verify signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.json({ success: false });
    }

    // ✅ Mark payment success
   
  

   const locker = await Locker.findOne({ lockerId: parcel.lockerId });

       const compartment = locker.compartments.find(c => c.compartmentId === parcel.compartmentId);
      let addr = 0x00;
      let lockNum = parseInt(compartment.compartmentId);
      if (lockNum > 11) {
        addr = 0x01;
        lockNum -= 12;
      }

      const sent = await sendUnlock(lockNum, addr);
      if (!sent) {
        return res.status(502).json({ success: false, message: "Unlock failed" });
      }

      await wait(500);
      const hwStatus = await checkLockerStatus(addr, lockNum, 2000);
      if (hwStatus !== "Unlocked") {
        return res.status(504).json({ success: false, message: "Unlock timeout" });
      }
      compartment.isBooked = false;
      compartment.currentParcelId = null;
      await locker.save();
  parcel.status = "picked_with_overstay";
    await parcel.save();

    res.json({
      success: true,
      redirect: "/",
    });
  } catch (err) {
    console.error("Verify error:", err);
    res.status(500).json({ success: false });
  }
});








app.post("/api/payment/razorpay/webhook", express.json(), async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

  const crypto = require("crypto");
  const shasum = crypto.createHmac("sha256", secret);
  shasum.update(JSON.stringify(req.body));
  const digest = shasum.digest("hex");

  if (digest !== req.headers["x-razorpay-signature"]) {
    return res.status(400).send("Invalid signature");
  }

  const event = req.body;

  if (event.event === "payment.captured") {
    const orderId = event.payload.payment.entity.order_id;

    const parcel = await Parcel2.findOne({ "payment.orderId": orderId });
    if (parcel) {
      parcel.payment.paid = true;
      parcel.payment.paidAt = new Date();
      await parcel.save();
    }
  }

  res.json({ status: "ok" });
});

app.get("/pay/:parcelId", async (req, res) => {
  const parcel = await Parcel2.findById(req.params.parcelId);
  if (!parcel) return res.status(404).send("Invalid parcel");

  res.render("payment", {
    parcelId: parcel._id,
    orderId: parcel.razorpayOrderId,
    amount: parcel.cost,
    key: process.env.RAZORPAY_KEY_ID
  });
});


app.post("/api/payment/verify", express.json(), async (req, res) => {
  const {
    parcelId,
    razorpay_payment_id,
    razorpay_order_id,
    razorpay_signature
  } = req.body;

  const parcel = await Parcel2.findById(parcelId);
  if (!parcel) return res.status(404).json({ success: false });

  const body = razorpay_order_id + "|" + razorpay_payment_id;
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest("hex");

  if (expected !== razorpay_signature) {
    return res.status(400).json({ success: false });
  }
 const locker = await Locker.findOne({ lockerId: parcel.lockerId });
      const compartment = locker.compartments.find(
        c => c.compartmentId === parcel.compartmentId
      );

   let addr = 0x00;
      let lockNum = parseInt(compartment.compartmentId);
      if (lockNum > 11) {
        addr = 0x01;
        lockNum -= 12;
      }

      const sent = await sendUnlock(lockNum, addr);
      if (!sent) {
        return res.status(502).json({ success: false, message: "Unlock failed" });
      }

            await wait(500);
      const hwStatus = await checkLockerStatus(addr, lockNum, 2000);
      if (hwStatus !== "Unlocked") {
        return res.json({ success: false, message: "Unlock timeout" });
      }




  parcel.paymentStatus = "completed";
  parcel.razorpayPaymentId = razorpay_payment_id;
  await parcel.save();

    compartment.isBooked = false;
    compartment.currentParcelId = null;
    await locker.save();

  res.json({ success: true });
});




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
const MAX_ATTEMPTS = 10; // attempts before temporary lock
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
     if (!c.isBooked || (c.isBooked && c.isOverstay)) {
  availability[c.size].free += 1;
}
 // free if NOT booked
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

    if (!PRICES[size]) return res.status(400).send("Invalid size");

    const hrs = Number(hours);
    if (!Number.isInteger(hrs) || hrs < 1 || hrs > 72)
      return res.status(400).send("Invalid hours");

    if (!/^[6-9]\d{9}$/.test(phone))
      return res.status(400).send("Invalid phone number");

    const total = PRICES[size] * hrs;
  //   const upiQrString =
  // `upi://pay?pa=dropp44856.ibz@icici&pn=DropPoint&am=${total}&cu=INR&tn=Locker%20Drop`;

    // Generate unique customId
    let customId;
    do {
      customId = "P" + Math.random().toString(36).substring(2, 9).toUpperCase();
    } while (await Parcel2.exists({ customId }));

    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + hrs * 3600000);

    const parcel = await Parcel2.create({
      senderPhone: phone,
      receiverPhone: phone,
      size,
      hours: hrs,
      terminal_store: true,
      accessCode: Math.floor(100000 + Math.random() * 900000).toString(),
      customId,
      cost: total,
      createdAt,
      expiresAt,
      status: "awaiting_payment"
    });

    const order = await razorpay.orders.create({
      amount: total * 100,
      currency: "INR",
      receipt: parcel.customId,
      notes: {
        parcelId: parcel._id.toString(),
        phone
      }
    });

    parcel.razorpayOrderId = order.id;
    await parcel.save();

   res.render("payment1", {
  parcel,
  order,
  razorpayKeyId: process.env.RAZORPAY_KEY_ID,
  amount: total * 100,
 // ✅ IMPORTANT
});


  } catch (err) {
    console.error("dropoff error:", err);
    res.status(500).send("Server error");
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
app.post("/terminal/payment/verify", async (req, res) => {
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


  const now = new Date();

// 🔍 Scan booked compartments for overstayed parcels
for (const c of locker.compartments) {
  if (!c.isBooked || !c.currentParcelId) continue;

  const oldParcel = await Parcel2.findOne({ customId: c.currentParcelId });

  if (!oldParcel) {
    // Corrupt state → free it
    c.isBooked = false;
    c.currentParcelId = null;
    continue;
  }

  // ⏰ OVERSTAY DETECTED
  if (oldParcel.expiresAt && oldParcel.expiresAt < now) {
    console.log(`⚠️ Overstayed parcel found: ${oldParcel.customId}`);

    // 📢 Notify receiver
    try {
      await client.messages.create({
        to: `whatsapp:+91${oldParcel.receiverPhone}`,
        from: 'whatsapp:+15558076515',
        contentSid: 'HXaf300dc862c5bf433a99649bf553a34e',
        contentVariables: JSON.stringify({
          2: oldParcel.customId
        })
      });
    } catch (err) {
      console.error("❌ Overstay WhatsApp failed:", err.message);
    }

    // 📦 Update old parcel
    oldParcel.status = "expired";
    await oldParcel.save();

    // 🧹 FREE THE COMPARTMENT
    c.isBooked = false;
    c.currentParcelId = null;
  }
}

    // pick or reuse a compartment
    let compartment =
      locker.compartments.find(c => c.compartmentId === parcel.compartmentId) ||
      locker.compartments.find(c => !c.isBooked && c.size === parcel.size);

    if (!compartment) {
      return res.status(400).send("No available compartments in this locker.");
    }
    console.log(compartment.compartmentId);
    // map to (addr, lock num)
    let addr = 0x00;
    let lockNum = parseInt(compartment.compartmentId, 10);
    if (lockNum > 11) { addr = 0x01; lockNum = lockNum - 12; }
    console.log(lockNum);
    // try unlock
    // const unlocked = await unlockWithRetry(lockNum, addr, { attempts: 5, firstDelayMs: 450, stepMs: 250 });

    // if (!unlocked) {
    //   // Render retry page with a button that POSTs to the same endpoint
    //   return res.render("terminal_unlock_retry", {
    //     parcelId: parcel._id,
    //     lockerId,
    //     message: "The locker did not open automatically.",
    //     hint: "Please try again."
    //   });
    // }

    // ✅ only update DB after verified unlocked              // door is open
    compartment.isBooked = true;                // reserved for this parcel
    
    
    let customId;
    let exists = true;

    while (exists) {
    customId = "P" + Math.random().toString(36).substring(2, 7).toUpperCase();
    exists = await Parcel2.exists({ customId });
  }


    parcel.customId = customId;
    parcel.billing.ratePerHour = parcel.cost.toString();
    parcel.status = "awaiting_pick";
    parcel.lockerLat = locker.location.lat;
    parcel.lockerLng = locker.location.lng;
    parcel.lockerId = lockerId;
    parcel.compartmentId = compartment.compartmentId;
    parcel.UsercompartmentId = parseInt(compartment.compartmentId, 10) + 1;
    parcel.droppedAt = new Date();
compartment.currentParcelId = parcel.customId;
await locker.save();
    const qrImage = await QRCode.toDataURL(parcel.accessCode);
    await parcel.save();
    await client.messages.create({
    to: `whatsapp:+91${parcel.senderPhone}`,
    from: 'whatsapp:+15558076515',
    contentSid: 'HXe73f967b34f11b7e3c9a7bbba9b746f6', 
    contentVariables: JSON.stringify({
      2: `${parcel.customId}/qr`, 
})
}).then(message => console.log('✅ WhatsApp Message Sent:', message.sid))
.catch(error => console.error('❌ WhatsApp Message Error:', error));
    const smsText1 = `Your Drop Point Locker Access Code is ${parcel.accessCode}. Please don't share this with anyone. -DROPPOINT`;
    const sendResult1 = sendSMS(`91${parcel.senderPhone}`,smsText1);
    console.log(sendResult1);
    
    
    if (parcel.paymentStatus !== "completed") {
      return res.status(403).send("Payment required to view access code");
    }

    return res.render("terminal_parcel_access", {
      accessCode: parcel.accessCode,
      customId: parcel.customId,
      qrImage,
      parcelId: parcel.customId
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

function startUnlockCron() {
  cron.schedule("*/2 * * * * *", async () => {
    try {
      const locker = await Locker.findOne({ lockerId: "L00002" });
      if (!locker) return console.log("Locker not found");

      for (const compartment of locker.compartments) {
        if (!compartment.isLocked) {
          console.log(
            `[CRON] Unlocking ${locker.lockerId} compartment ${compartment.compartmentId}`
          );

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
              {
                lockerId: "L00002",
                "compartments.compartmentId": compartment.compartmentId,
              },
              { $set: { "compartments.$.isLocked": true } }
            );
            console.log(
              `[CRON] ✅ Successfully unlocked compartment ${compartment.compartmentId}`
            );
          }
        }
      }
    } catch (err) {
      console.error("[CRON] Error:", err);
    }
  });
}




//// HEARTBEAT




// cron.schedule('*/3 * * * * *', async () => {
//   const now = new Date();

//   try {
//     await Terminal.findOneAndUpdate(
//       { terminalId: process.env.TERMINAL_ID },
//       {
//         $set: {
//           lastSeen: now,
//           'status.online': true,
//           'status.updatedBy': 'server-cron',
//           'status.localTime': now
//         }
//       },
//       { upsert: true }
//     );

//     // console.log(`[CRON] heartbeat updated for ${TERMINAL_ID}`);
//   } catch (err) {
//     console.error('[CRON] DB update failed:', err);
//   }
// });



// server/terminal-cron.js
const si = require('systeminformation');


const SCHEDULE = process.env.CRONTAB || '*/3 * * * * *'; // every 10s
const HISTORY_LIMIT = Number(process.env.HISTORY_LIMIT || 100);



function safeNumber(n) {
  return typeof n === 'number' ? n : undefined;
}


function startTerminalHealthCron() {
  cron.schedule(
    SCHEDULE,
    async () => {
      if (mongoose.connection.readyState !== 1) {
        console.log("[terminal-cron] Skipping run: Mongo not connected yet.");
        return;
      }

      const now = new Date();

      try {
        await Terminal.findOneAndUpdate(
          { terminalId: TERMINAL_ID },
          {
            $set: {
              lastSeen: now,
              "status.localTime": now,
              "status.updatedBy": "terminal-cron"
            }
          },
          { upsert: true }
        );
      } catch (err) {
        console.error("[terminal-cron] error updating timestamps", err);
      }
    },
    { scheduled: true }
  );

  console.log(
    `[terminal-cron] started for ${TERMINAL_ID} schedule=${SCHEDULE}`
  );
}

app.get("/terminal/drop-otp", async(req,res)=>{
  res.render("drop-otp",{
    error: null,
    success: null
  });
})

function generatenewOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}





app.post("/terminal/drop-otp/verify", async (req, res) => {
  try {
    const { otp } = req.body;
    console.log(otp);
    console.log(typeof(otp));
    if (otp.length !== 6) {
      return res.render("drop-otp", {
        success: null,
        error: "Invalid drop code. Please enter 6 digits."
      });
    }

    // 🔍 Find locker containing this OTP
   const locker = await Locker.findOne({ lockerId: "L00002" });


    if (!locker) {
      return res.render("drop-otp", {
        success: null,
        error: "Locker not found."
      });
    }

    // 🔍 Find matching compartment
const compartment = locker.compartments.find(c =>
  c.bookingInfo &&
  typeof c.bookingInfo.dropOtp === "string" &&
  c.bookingInfo.dropOtp === otp
);

    if (!compartment) {
      return res.render("drop-otp", {
        success: null,
        error: "Incorrect drop code. Please try again."
      });
    }
    //⏱ Expiry check
    // if (
    //   !compartment.bookingInfo.dropOtpExpiresAt ||
    //   new Date() > compartment.bookingInfo.dropOtpExpiresAt
    // ) {
    //   return res.status(401).json({
    //     ok: false,
    //     message: "OTP expired"
    //   });
    // }

    // 🔐 One-time check
    // if (compartment.bookingInfo.dropOtpUsed) {
    //   return res.status(401).json({
    //     ok: false,
    //     message: "OTP already used"
    //   });
    // }
      let addr1 = 0x00;
      let lockNum1 = parseInt(compartment.compartmentId);

      if (lockNum1 > 11) {
        addr1 = 0x01; // second BU
        lockNum1 = lockNum1 - 12; // reset to 0–11 range
      }
      const sent = await sendUnlock(lockNum1, addr1);
    if (!sent) {
      return res.render("drop-otp", {
        success: null,
        error: "Locker not responding. Please try again."
      });
    }

    const newOtp =  generatenewOtp();
    console.log(newOtp);
    compartment.bookingInfo.pickupOtp = newOtp;
    compartment.bookingInfo.dropOtp = null;
    // ✅ MARK OTP AS USED
    compartment.bookingInfo.dropOtpUsed = true;

    // 🔓 UNLOCK COMPARTMENT
    compartment.isLocked = false;

    await locker.save();

const smsText4 = `Dear ${compartment.bookingInfo.recieverName}, your parcel has been dropped securely at the locker. Please pick it up using this code : ${compartment.bookingInfo.pickupOtp}. -DROPPOINT`;
    const sendResult4 = sendSMS(`91${compartment.bookingInfo.recieverPhone}`,smsText4);
    console.log(sendResult4);
    
    



return res.render("drop-otp", {
  error : null,
  success: "Locker opened successfully"
});


  } catch (err) {
    console.error("Drop OTP verify error:", err);
    return res.render("drop-otp", {
      success: null,
      error: "Something went wrong. Please try again."
    })
  };
});
app.get("/customer/pickup",async(req,res)=>{
  res.render("pickup-customer",{
    success : null,
    error : null
  });
})







app.post("/terminal/pick-otp/verify", async (req, res) => {
  try {
    const { otp } = req.body;

    if (otp.length !== 6) {
      return res.render("pickup-customer", {
        success: null,
        error: "Invalid drop code. Please enter 6 digits."
      });
    }


    // 🔍 Find locker (you can make this dynamic later)
    const locker = await Locker.findOne({ lockerId: "L00002" });

  if (!locker) {
      return res.render("pickup-customer", {
        success: null,
        error: "Locker not found."
      });
    }

    // 🔍 Find matching compartment by PICKUP OTP
    const compartment = locker.compartments.find(c =>
      c.bookingInfo &&
      c.bookingInfo.pickupOtp === otp
    );

    if (!compartment) {
      return res.render("pickup-customer", {
        success: null,
        error: "Incorrect drop code. Please try again."
      });
    }

    // ⏱ Expiry check (optional but recommended)
    // if (
    //   compartment.bookingInfo.pickOtpExpiresAt &&
    //   new Date() > compartment.bookingInfo.pickOtpExpiresAt
    // ) {
    //   return res.status(401).json({
    //     ok: false,
    //     message: "OTP expired"
    //   });
    // }

    // // 🔐 One-time check
    if (compartment.bookingInfo.pickOtpUsed) {
      return res.status(401).json({
        ok: false,
        message: "OTP already used"
      });
    }

    // 🔓 HARDWARE UNLOCK LOGIC
    let addr1 = 0x00;
    let lockNum1 = parseInt(compartment.compartmentId);

    if (lockNum1 > 11) {
      addr1 = 0x01;       // second BU
      lockNum1 -= 12;     // normalize to 0–11
    }

    const sent = await sendUnlock(lockNum1, addr1);

    if (!sent) {
      return res.render("pickup-customer", {
        success: null,
        error: "Locker not responding. Please try again."
      });
    }

    // ✅ MARK OTP USED (for safety)
    compartment.bookingInfo.pickOtpUsed = true;

    // 🔥 CLEAR BOOKING INFO AFTER SUCCESSFUL PICKUP
    compartment.bookingInfo = {
      userId: null,
      bookingTime: null,
      otp: null,
      receiverName: null,
      receiverPhone: null,
      pickupOtp: null,
      dropOtpExpiresAt: null,
      dropOtpUsed: false,
    recieverName : null ,
    recieverPhone : null
    };

    // 🔄 RESET COMPARTMENT STATE
    compartment.isBooked = false;
    compartment.isLocked = false;
    compartment.currentParcelId = null;
    compartment.qrCode = null;

    await locker.save();

return res.render("pickup-customer", {
  error : null,
  success: "Locker opened successfully"
});

  } catch (err) {
    console.error("pickup OTP verify error:", err);
    return res.render("pickup-customer", {
      success: null,
      error: "Something went wrong. Please try again."
    })
  };
});




///// OTP share this otp only if youre expecting a parcel

////// DELIVERY GUY ON DEMAND OTP


/* ============================
   PAGE RENDERS
============================ */

app.get("/kiosk/phone", (req, res) => {
  res.render("kiosk/phone");
});

app.get("/kiosk/otp", (req, res) => {
  if (!req.session.pickupOtpSession) return res.redirect("/kiosk/phone");
  res.render("kiosk/otp", { phone: req.session.pickupOtpSession.phone });
});



app.get("/kiosk/unlocking", (req, res) => {
  res.render("kiosk/unlocking");
});

/* ============================
   API: SEND OTP
============================ */
app.post("/api/kiosk/send-otp", (req, res) => {
  const { phone } = req.body;

  if (!phone || phone.length !== 10) {
    return res.status(400).json({ success: false });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  req.session.pickupOtpSession = {
    phone,
    otp,
    expiresAt: Date.now() + 5 * 60 * 1000
  };

  console.log(otp, "Share this otp only if you are expecting a parcel"); // replace with SMS

  res.json({ success: true });
});

/* ============================
   API: VERIFY OTP
============================ */
app.post("/api/kiosk/verify-otp", (req, res) => {
  const { otp } = req.body;
  const session = req.session.pickupOtpSession;

  if (
    !session ||
    session.expiresAt < Date.now() ||
    session.otp !== otp
  ) {
    return res.status(400).json({ success: false });
  }

  req.session.courierVerified = {
    phone: session.phone,
    verifiedAt: Date.now()
  };

  delete req.session.pickupOtpSession;
  res.json({ success: true });
});

/* ============================
   API: AVAILABLE SIZES
============================ */
app.get("/kiosk/size", async (req, res) => {
  if (!req.session.courierVerified) {
    return res.status(401).json({});
  }

  const locker = await Locker.findOne({
   lockerId : lockerID
  });

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
  res.render("kiosk/size", {availability,
      PRICE });
});









/* ============================
   API: UNLOCK BY SIZE
============================ */
app.post("/api/kiosk/unlock", async (req, res) => {
  const { size } = req.body;
  const courier = req.session.courierVerified;

  if (!courier) return res.status(401).json({ success: false });

  const locker = await Locker.findOne({
    lockerId : "L00004"
  });
  console.log(locker);
  if (!locker) {
    return res.status(400).json({ success: false });
  }

  const compartment = locker.compartments.find(
    c => !c.isBooked && c.size === size
  );
  console.log(compartment.compartmentId);
  compartment.isBooked = true;
  compartment.isLocked = false;
  compartment.bookingInfo.pickupOtp =
    Math.floor(100000 + Math.random() * 900000).toString();
  compartment.bookingInfo.pickupOtpUsed = false;
  compartment.bookingInfo.recieverPhone = courier.phone;
  compartment.bookingInfo.bookingTime = new Date();

  await locker.save();

  await unlockHardware(locker.lockerId, compartment.compartmentId);

  req.session.destroy();

  res.json({
    success: true,
    lockerId: locker.lockerId,
    compartmentId: compartment.compartmentId
  });
});

/* ============================
   HARDWARE STUB
============================ */
async function unlockHardware(lockerId, compartmentId) {
  console.log(`🔓 Unlocking ${lockerId} → ${compartmentId}`);
  // your TCP / relay logic here
}










async function bootstrap() {
  console.log("🚀 Starting terminal server...");

  // 1) wait until internet is actually available
  await waitForInternetForever();

  // 2) connect Mongo (infinite retry)
  await connectMongo(process.env.MONGO_URI);

  // 3) start BU + polling
  await startBuAndPolling();

  // 4) start cron jobs that touch Mongo / BU
  startUnlockCron();
  startTerminalHealthCron();

  // 5) finally start HTTP + Socket.IO
  server.listen(3000, () => {
    console.log("Server listening on :3000");
  });

  console.log("🌟 System ready.");
}

bootstrap().catch((err) => {
  console.error("❌ Fatal bootstrap error:", err);
  process.exit(1);
});
















