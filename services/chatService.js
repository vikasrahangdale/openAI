// services/chatService.js
const Conversation = require('../models/Conversation');
const Chat = require('../models/Chat');

class ChatService {
  static async saveChatWithConversationUpdate(chatData) {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      // 1. Pehle chat save karein
      const newChat = new Chat(chatData);
      const savedChat = await newChat.save({ session });
      
      // 2. Phir conversation update karein
      const updateData = {
        $inc: { messageCount: 1 },
        lastMessage: chatData.userMessage.substring(0, 100)
      };
      
      await Conversation.findByIdAndUpdate(
        chatData.conversationId, 
        updateData, 
        { session }
      );
      
      await session.commitTransaction();
      return savedChat;
      
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }
}

module.exports = ChatService;