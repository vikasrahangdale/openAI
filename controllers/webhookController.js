const Email = require("../models/Email");

// Brevo webhook handler
async function handleBrevoWebhook(req, res) {
  try {
    const body = req.body;

    // Brevo reply event payload tumhe console.log karke dekhna hoga
    console.log("📨 Webhook payload:", JSON.stringify(body));

    // Example generic handling:
    const email =
      body.email ||
      body.recipient ||
      (body["email"] && body["email"].toLowerCase());
    const text = (body.text || body.message || "").toLowerCase();

    if (!email) {
      console.warn("⚠ No email in webhook payload");
      return res.status(200).send("No email found");
    }

    if (text.includes("yes")) {
      console.log("✅ YES detected for:", email);
      await Email.updateOne(
        { email },
        { status: "yes_received" }
      );
    } else {
      console.log("ℹ Non-YES reply from:", email);
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error("❌ Webhook error:", err.message);
    res.status(500).send("Error");
  }
}

module.exports = {
  handleBrevoWebhook,
};
