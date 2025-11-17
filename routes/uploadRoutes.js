const express = require("express");
const multer = require("multer");
const auth = require("../middleware/auth");
const Conversation = require("../models/Conversation");
const Chat = require("../models/Chat");
const geminiService = require("../utils/gemini");
const fs = require("fs");
const path = require("path");

const router = express.Router();

// Multer configuration
const upload = multer({ 
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    // Accept PDF and text files
    if (file.mimetype === 'application/pdf' || file.mimetype === 'text/plain') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and text files are allowed'), false);
    }
  }
});

router.post("/", auth, upload.single("file"), async (req, res) => {
  try {
    const userId = req.user._id;
    const file = req.file;

    console.log("📤 File upload request received:", {
      fileName: file?.originalname,
      mimeType: file?.mimetype,
      size: file?.size,
      bufferLength: file?.buffer?.length
    });

    if (!file) {
      return res.status(400).json({ error: "File is required" });
    }

    if (!file.buffer || file.buffer.length === 0) {
      return res.status(400).json({ error: "File buffer is empty" });
    }

    // CREATE conversation
    const conversation = await Conversation.create({
      title: `Requirements: ${file.originalname}`,
      userId,
      type: "requirements",
      lastMessage: `Uploaded: ${file.originalname}`,
    });

    console.log("🔄 Extracting requirements with Gemini...");

    // REQUIREMENT extract from Gemini
    const aiResponse = await geminiService.extractRequirements(
      file.buffer,
      file.mimetype,
      file.originalname
    );

    console.log("✅ Requirements extraction completed");
    console.log("📊 AI Response Type:", typeof aiResponse);
    console.log("📊 AI Response Length:", aiResponse.length);

    // Check if we got a real response or error
    if (aiResponse.includes("Error") || aiResponse.includes("No text found")) {
      console.error("❌ Gemini returned error:", aiResponse);
    }

    // Save chat
    await Chat.create({
      conversationId: conversation._id,
      userId,
      userMessage: `[FILE UPLOADED] ${file.originalname}`,
      aiResponse,
      fileName: file.originalname,
      fileType: file.mimetype,
    });

    return res.json({
      success: true,
      conversationId: conversation._id.toString(),
      aiResponse,
      message: "File processed successfully"
    });

  } catch (err) {
    console.error("❌ Upload error:", err);
    return res.status(500).json({ 
      error: "Upload failed", 
      details: err.message 
    });
  }
});

// YES → Generate PDF
router.post("/generate-pdf", auth, async (req, res) => {
  try {
    const { requirements, conversationId } = req.body;

    console.log("📄 PDF generation request received");

    if (!requirements) {
      return res.status(400).json({ error: "Requirements content is required" });
    }

    // Create uploads directory if it doesn't exist
    const pdfDir = path.join(__dirname, '../uploads/pdf');
    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }

    const fileName = `requirements-${Date.now()}.pdf`;
    const outputPath = path.join(pdfDir, fileName);

    console.log("🔄 Generating PDF...");

    await geminiService.createRequirementsPDF(requirements, outputPath);

    // Update conversation with PDF info if conversationId provided
    if (conversationId) {
      await Chat.create({
        conversationId,
        userId: req.user._id,
        userMessage: "[PDF REQUEST] Generate PDF report",
        aiResponse: `PDF generated: ${fileName}`,
        fileName: fileName,
        fileType: 'application/pdf',
      });
    }

    const pdfUrl = `/uploads/pdf/${fileName}`;

    res.json({
      success: true,
      pdfUrl,
      fileName,
      message: "PDF generated successfully"
    });

  } catch (err) {
    console.error("❌ PDF generation error:", err);
    res.status(500).json({ 
      error: "PDF generation failed", 
      details: err.message 
    });
  }
});

// Serve PDF files statically (add this to your main app.js)
// app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

module.exports = router;