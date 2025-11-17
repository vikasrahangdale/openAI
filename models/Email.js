const mongoose = require("mongoose");

const emailSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "request_sent", "yes_received", "details_sent"],
      default: "pending",
    },
    lastMailTime: {
      type: Date,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Email", emailSchema);
