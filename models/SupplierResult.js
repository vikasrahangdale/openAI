// models/SupplierResult.js
const mongoose = require("mongoose");

const supplierSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  prompt: { type: String, required: true },

  suppliers: [
    {
      supplier: String,
      domain: String,
      emails: [
        {
          value: String,
          source: String,
        }
      ],
      phones: [
        {
          value: String,
          source: String,
        }
      ],
      whatsapps: [
        {
          value: String,
          source: String,
        }
      ],
      address: String,
      rating: Number,
      why: String
    }
  ],

  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("SupplierResult", supplierSchema);
