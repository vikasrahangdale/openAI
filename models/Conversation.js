const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  messageCount: {
    type: Number,
    default: 0
  },
  type: {
    type: String,
    enum: ['chat', 'supplier' ,"image", "pdf", "requirements"],
    default: 'chat'
  },
  lastMessage: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

// ✅ Static method to update conversation when new chat is saved
conversationSchema.statics.updateOnNewChat = async function(conversationId, userMessage) {
  try {
    const updateData = {
      $inc: { messageCount: 1 },
      lastMessage: userMessage.substring(0, 100),
      updatedAt: new Date()
    };
    
    await this.findByIdAndUpdate(conversationId, updateData);
    return true;
  } catch (error) {
    console.error('Conversation update error:', error);
    return false;
  }
};

module.exports = mongoose.model('Conversation', conversationSchema);