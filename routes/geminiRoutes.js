// const express = require("express");
// const router = express.Router();
// const geminiService = require("../utils/gemini");
// const Chat = require("../models/Chat");
// const Conversation = require("../models/Conversation");
// const auth = require("../middleware/auth");

// // ✅ GET ALL CONVERSATIONS (Both chat and supplier)
// router.get("/conversations", auth, async (req, res) => {
//   try {
//     const conversations = await Conversation.find({ userId: req.user._id })
//       .sort({ updatedAt: -1 });
    
//     res.json({
//       success: true,
//       data: { conversations }
//     });
//   } catch (error) {
//     console.error("❌ Get Conversations Error:", error);
//     res.status(500).json({ success: false, error: "Failed to load conversations" });
//   }
// });

// // ✅ GET MESSAGES FOR CONVERSATION
// router.get("/conversations/:id/messages", auth, async (req, res) => {
//   try {
//     const messages = await Chat.find({ 
//       conversationId: req.params.id,
//       userId: req.user._id 
//     }).sort({ createdAt: 1 });
    
//     res.json({
//       success: true,
//       data: { messages }
//     });
//   } catch (error) {
//     console.error("❌ Get Messages Error:", error);
//     res.status(500).json({ success: false, error: "Failed to load messages" });
//   }
// });

// router.post("/conversations", auth, async (req, res) => {
//   try {
//     const { title = "New Chat", type = "chat" } = req.body;
    
//     const conversation = await Conversation.create({
//       title,
//       userId: req.user._id,
//       type
//     });
    
//     res.json({
//       success: true,
//       data: { conversation }
//     });
//   } catch (error) {
//     console.error("❌ Create Conversation Error:", error);
//     res.status(500).json({ success: false, error: "Failed to create conversation" });
//   }
// });

// // ✅ CHAT WITH GEMINI + SAVE TO DB
// router.post("/chat", auth, async (req, res) => {
//   try {
//     const { message, conversationId } = req.body;
//     const userId = req.user._id;

//     if (!message) {
//       return res.status(400).json({ success: false, error: "Message is required" });
//     }

//     let conversation;
    
//     // If conversationId provided, use it, otherwise create new
//     if (conversationId) {
//       conversation = await Conversation.findById(conversationId);
//       if (!conversation) {
//         return res.status(404).json({ success: false, error: "Conversation not found" });
//       }
//     } else {
//       // Create new conversation
//       conversation = await Conversation.create({
//         title: message.substring(0, 30) + (message.length > 30 ? "..." : ""),
//         userId: userId,
//         type: 'chat',
//         lastMessage: message
//       });
//     }

//     // 🧠 Ask Gemini model
//     const response = await geminiService.sendMessage(
//       conversation._id.toString(),
//       message,
//       [] // history
//     );

//     // ✅ Save to database with userId
//     await Chat.create({
//       conversationId: conversation._id,
//       userId,
//       userMessage: message,
//       aiResponse: response.message || "No reply"
//     });

//     // Update conversation
//     await Conversation.findByIdAndUpdate(conversation._id, { 
//       $inc: { messageCount: 2 },
//       lastMessage: message,
//       updatedAt: new Date()
//     });

//     return res.json({
//       success: true,
//       message: response.message || "No response received",
//       conversationId: conversation._id
//     });

//   } catch (error) {
//     console.error("❌ Gemini Route Error:", error);
//     return res.status(500).json({ success: false, error: "Something went wrong" });
//   }
// });

// module.exports = router;