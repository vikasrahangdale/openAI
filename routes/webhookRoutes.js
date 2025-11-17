const express = require("express");
const {
  handleBrevoWebhook,
} = require("../controllers/webhookController");

const router = express.Router();

router.post("/brevo", handleBrevoWebhook);

module.exports = router;
