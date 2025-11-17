const Email = require("../models/Email");

// Add single email
async function addEmail(req, res) {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "email is required" });
    }

    const doc = await Email.create({ email });
    res.json({ message: "Email added", data: doc });
  } catch (err) {
    console.error("❌ addEmail error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
}

// Add multiple emails at once
async function addManyEmails(req, res) {
  try {
    const { emails } = req.body; // [ "a@a.com", "b@b.com" ]
    if (!Array.isArray(emails) || emails.length === 0) {
      return res
        .status(400)
        .json({ message: "emails array is required" });
    }

    const docs = await Email.insertMany(
      emails.map((e) => ({ email: e })),
      { ordered: false }
    );

    res.json({ message: "Emails added", count: docs.length });
  } catch (err) {
    console.error("❌ addManyEmails error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
}

// List emails (for debugging / checking)
async function getAllEmails(req, res) {
  try {
    const list = await Email.find().sort({ createdAt: -1 });
    res.json(list);
  } catch (err) {
    console.error("❌ getAllEmails error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
}

module.exports = {
  addEmail,
  addManyEmails,
  getAllEmails,
};
