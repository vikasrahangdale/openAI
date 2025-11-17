const express = require("express");
const {
  addEmail,
  addManyEmails,
  getAllEmails,
} = require("../controllers/emailController");

const router = express.Router();

router.post("/", addEmail);

router.post("/bulk", addManyEmails);

router.get("/", getAllEmails);

module.exports = router;
