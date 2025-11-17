const mongoose = require("mongoose");
const Conversation = require("./Conversation");

const chatSchema = new mongoose.Schema(
  {
    conversationId: { 
      type: mongoose.Schema.Types.ObjectId, // ✅ Changed from String to ObjectId
      ref: "Conversation", 
      required: true 
    },
    userId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User", 
      required: true 
    },
    userMessage: { 
      type: String, 
      required: true 
    },
    aiResponse: { 
      type: String, 
      required: true 
    }
  },
  { timestamps: true }
);

// ✅ Pre-save hook to update conversation automatically
chatSchema.pre('save', async function(next) {
  try {
    if (this.isNew) { // Only for new chats
      await Conversation.updateOnNewChat(this.conversationId, this.userMessage);
    }
    next();
  } catch (error) {
    console.error('Chat pre-save error:', error);
    next(error);
  }
});

module.exports = mongoose.model("Chat", chatSchema);