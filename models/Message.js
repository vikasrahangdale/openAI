// models/Message.js
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
  content: { type: String, required: true }, // Gemini API response or user message
  role: { type: String, enum: ['user', 'assistant'], required: true }, // assistant = Gemini
  timestamp: { type: Date, default: Date.now },
  tokens: { type: Number, default: 0 } // optional: track tokens used by Gemini
}, { timestamps: true });

// Faster queries
messageSchema.index({ conversationId: 1, createdAt: 1 });

module.exports = mongoose.model('Message', messageSchema);