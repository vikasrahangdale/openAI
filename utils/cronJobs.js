const cron = require("node-cron");
const Email = require("../models/Email");
const {
  sendRequestEmail,
  sendProductDetails,
} = require("./emailService");

function initCronJobs() {
  console.log("⏱ Cron jobs initialized");

  // 1) Har 5 minute me: pending emails ko request mail bhejo
  cron.schedule("*/5 * * * *", async () => {
    console.log("⏱ Cron: Sending request emails...");
    try {
      const emails = await Email.find({ status: "pending" }).limit(20);

      for (let e of emails) {
        try {
          console.log("📧 Sending request to:", e.email);
          await sendRequestEmail(e.email);
        } catch (err) {
          console.error("❌ Error sending request email:", e.email, err.message);
        }
      }
    } catch (err) {
      console.error("❌ Cron request emails error:", err.message);
    }
  });

  // 2) Har 5 minute me: yes_received ko product details bhejo
  cron.schedule("*/5 * * * *", async () => {
    console.log("⏱ Cron: Sending product details emails...");
    try {
      const yesList = await Email.find({ status: "yes_received" });

      for (let u of yesList) {
        try {
          console.log("📦 Sending product details to:", u.email);
          await sendProductDetails(u.email);
        } catch (err) {
          console.error("❌ Error sending product email:", u.email, err.message);
        }
      }
    } catch (err) {
      console.error("❌ Cron product details error:", err.message);
    }
  });
}

module.exports = initCronJobs;
