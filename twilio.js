// Download the helper library from https://www.twilio.com/docs/node/install
const twilio = require("twilio"); // Or, for ESM: import twilio from "twilio";

// Find your Account SID and Auth Token at twilio.com/console
// and set the environment variables. See http://twil.io/secure
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

async function createVerification() {
  const verification = await client.verify.v2
    .services("VA99c5b9543f1d88b7abf09fa1a375a5c2")
    .verifications.create({
      channel: "sms",
      templateSid: "HJXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      to: "+15017122661",
    });

  console.log(verification.status);
}

createVerification();