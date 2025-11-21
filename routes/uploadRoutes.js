const express = require("express");
const multer = require("multer");
const auth = require("../middleware/auth");
const Conversation = require("../models/Conversation");
const Chat = require("../models/Chat");
const geminiService = require("../utils/gemini");
const fs = require("fs");
const path = require("path");
const PDFDocument = require('pdfkit');

const router = express.Router();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer configuration with disk storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    // Unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf', 
      'text/plain', 
      'image/png', 
      'image/jpeg', 
      'image/jpg'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, text, and image files are allowed'), false);
    }
  }
});

// File upload and processing
router.post("/process-file", auth, upload.single("file"), async (req, res) => {
  try {
    const { conversationId, message } = req.body;
    const userId = req.user._id;
    const file = req.file;

    console.log("📁 File upload request received");

    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    if (!conversationId) {
      return res.status(400).json({ error: "Conversation ID is required" });
    }

    // Verify conversation exists and belongs to user
    const conversation = await Conversation.findOne({ 
      _id: conversationId, 
      userId 
    });

    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    console.log("🔄 Processing file with Gemini...");
    console.log(`📄 File details: ${file.originalname}, Type: ${file.mimetype}, Size: ${file.size} bytes`);

    // Read the uploaded file for processing
    const fileBuffer = fs.readFileSync(file.path);

    // Process file with Gemini
    const processingResult = await geminiService.processFileWithMessage(
      fileBuffer,      // file buffer
      file.mimetype,   // MIME type
      file.originalname, // file name
      message || "Extract technical specifications from this document" // user message
    );

    // Save ORIGINAL uploaded file to chat history
    const uploadedChat = await Chat.create({
      conversationId,
      userId,
      userMessage: message || `Uploaded file: ${file.originalname}`,
      aiResponse: "File uploaded successfully", // You can change this if needed
      fileName: file.originalname,
      fileType: file.mimetype,
      filePath: file.path, // Save file path for permanent storage
      isUserUploaded: true // Mark as user uploaded file
    });

    // Save AI response as separate chat entry
    const aiResponseChat = await Chat.create({
      conversationId,
      userId,
      userMessage: `Analysis of: ${file.originalname}`,
      aiResponse: processingResult,
      fileName: `analysis-${file.originalname}`,
      fileType: 'text/plain',
      isAIResponse: true // Mark as AI response
    });

    // Update conversation timestamp
    await Conversation.findByIdAndUpdate(conversationId, { 
      updatedAt: new Date() 
    });

    res.json({
      success: true,
      message: "File processed successfully",
      response: processingResult,
      uploadedChatId: uploadedChat._id,
      aiResponseChatId: aiResponseChat._id
    });

  } catch (err) {
    console.error("❌ File processing error:", err);
    res.status(500).json({ 
      error: "File processing failed", 
      details: err.message 
    });
  }
});

// Get uploaded file
router.get("/file/:chatId", auth, async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user._id;

    const chat = await Chat.findOne({ _id: chatId, userId });
    
    if (!chat || !chat.filePath) {
      return res.status(404).json({ error: "File not found" });
    }

    if (!fs.existsSync(chat.filePath)) {
      return res.status(404).json({ error: "File no longer exists" });
    }

    res.setHeader('Content-Type', chat.fileType);
    res.setHeader('Content-Disposition', `attachment; filename="${chat.fileName}"`);
    
    const fileStream = fs.createReadStream(chat.filePath);
    fileStream.pipe(res);

  } catch (err) {
    console.error("❌ File retrieval error:", err);
    res.status(500).json({ error: "File retrieval failed" });
  }
});

router.post("/generate-pdf", auth, async (req, res) => {
  try {
    const { conversationId, requirements, companyName, gstNumber } = req.body;
    const userId = req.user._id;

    console.log("📄 PDF generation request received");

    if (!conversationId) {
      return res.status(400).json({ error: "Conversation ID is required" });
    }

    // Get conversation data
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    const chats = await Chat.find({ conversationId }).sort({ createdAt: 1 });

    console.log("🔄 Generating clean PDF...");

    // Create PDF directly in memory
    const pdfBuffer = await generateCleanPDF(chats, companyName, gstNumber);

    // Save generated PDF to uploads directory
    const pdfFileName = `specification-${conversationId}-${Date.now()}.pdf`;
    const pdfFilePath = path.join(uploadsDir, pdfFileName);
    fs.writeFileSync(pdfFilePath, pdfBuffer);

    // Save to chat history with file path
    const pdfChat = await Chat.create({
      conversationId,
      userId,
      userMessage: "[PDF REQUEST] Generate PDF report",
      aiResponse: `📊 Specification PDF generated successfully!`,
      fileName: `specification-${conversationId}.pdf`,
      fileType: 'application/pdf',
      filePath: pdfFilePath, // Save the generated PDF permanently
      isGeneratedPDF: true // Mark as generated PDF
    });

    // Set PDF headers for download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="specification-${conversationId}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    // Send PDF directly
    res.send(pdfBuffer);

  } catch (err) {
    console.error("❌ PDF generation error:", err);
    res.status(500).json({ 
      error: "PDF generation failed", 
      details: err.message 
    });
  }
});

// Get all files for a conversation
router.get("/files/:conversationId", auth, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id;

    const conversation = await Conversation.findOne({ _id: conversationId, userId });
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    const files = await Chat.find({ 
      conversationId, 
      $or: [
        { filePath: { $exists: true, $ne: null } },
        { fileName: { $exists: true, $ne: null } }
      ]
    }).sort({ createdAt: -1 });

    const fileList = files.map(chat => ({
      id: chat._id,
      fileName: chat.fileName,
      fileType: chat.fileType,
      uploadedAt: chat.createdAt,
      isUserUploaded: chat.isUserUploaded || false,
      isGeneratedPDF: chat.isGeneratedPDF || false,
      isAIResponse: chat.isAIResponse || false
    }));

    res.json({ success: true, files: fileList });

  } catch (err) {
    console.error("❌ Files retrieval error:", err);
    res.status(500).json({ error: "Files retrieval failed" });
  }
});

// Clean PDF generation with company name and GST
async function generateCleanPDF(chats, companyName, gstNumber) {
  return new Promise((resolve, reject) => {
    try {
      const chunks = [];
      const doc = new PDFDocument({
        margin: 25,
        size: 'A4',
        bufferPages: true
      });

      // Collect data
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Extract structured data (only requirements now)
      const extractedData = extractStructuredDataFromChats(chats);

      // ===== DARK BLUE HEADER SECTION =====
      
      // Dark Blue Header Background
      doc.fillColor('#1e3a8a')  // Dark Blue
         .rect(0, 0, doc.page.width, 80)
         .fill();

      // Company Name - White Text
      doc.fillColor('#ffffff')
         .fontSize(18)
         .font('Helvetica-Bold')
         .text(companyName || 'COMPANY NAME', 0, 25, { 
           align: 'center',
           width: doc.page.width
         });

      // GST Number
      doc.fillColor('#ffffff')
         .fontSize(14)
         .font('Helvetica-Bold')
         .text(`GST: ${gstNumber || 'GST NUMBER'}`, 0, 50, {
           align: 'center',
           width: doc.page.width
         });

      // Document Title
      doc.fillColor('#dbeafe')
         .fontSize(12)
         .font('Helvetica')
         .text('Technical Specification Document', 0, 70, {
           align: 'center',
           width: doc.page.width
         });

      let yPosition = 100;

      // ===== DOCUMENT DATE =====
      if (extractedData.date && extractedData.date !== "Not found") {
        doc.fillColor('#1e3a8a')
           .fontSize(12)
           .font('Helvetica-Bold')
           .text('DOCUMENT DATE:', 40, yPosition);
        
        doc.fillColor('#374151')
           .fontSize(11)
           .font('Helvetica')
           .text(extractedData.date, 150, yPosition);
        
        yPosition += 20;
      }

      // Report Generation Date
      doc.fillColor('#6b7280')
         .fontSize(9)
         .font('Helvetica')
         .text(`Generated on: ${new Date().toLocaleDateString()}`, 40, yPosition);

      yPosition += 25;

      // Separator line
      doc.moveTo(40, yPosition)
         .lineTo(doc.page.width - 40, yPosition)
         .strokeColor('#e5e7eb')
         .lineWidth(0.5)
         .stroke();

      yPosition += 20;

      // ===== REQUIREMENTS TABLE =====
      if (extractedData.requirements && extractedData.requirements !== "Not found") {
        // Table Title
        doc.fillColor('#1e3a8a')
           .fontSize(14)
           .font('Helvetica-Bold')
           .text('TECHNICAL SPECIFICATIONS', 0, yPosition, { 
             align: 'center',
             width: doc.page.width
           });
        
        yPosition += 25;

        // Parse requirements
        const requirementsTable = parseRequirementsToTable(extractedData.requirements);
        
        // Table setup
        const tableTop = yPosition;
        const col1X = 40;    // Component
        const col2X = 150;   // Specifications  
        const col3X = doc.page.width - 50; // Quantity
        const col1Width = 100;
        const col2Width = doc.page.width - 250;
        const col3Width = 40;

        // Table Header with Dark Blue background
        doc.fillColor('#1e3a8a')
           .rect(40, tableTop, doc.page.width - 80, 20)
           .fill();
        
        doc.fillColor('#ffffff')
           .fontSize(10)
           .font('Helvetica-Bold')
           .text('COMPONENT', col1X + 5, tableTop + 6, { 
             width: col1Width - 10 
           })
           .text('SPECIFICATIONS', col2X + 5, tableTop + 6, { 
             width: col2Width - 10 
           })
           .text('QTY', col3X, tableTop + 6, { 
             width: col3Width, 
             align: 'center' 
           });

        // Header border
        doc.strokeColor('#1e3a8a')
           .lineWidth(1)
           .rect(40, tableTop, doc.page.width - 80, 20)
           .stroke();

        yPosition = tableTop + 20;

        // Table Rows
        requirementsTable.forEach((row, index) => {
          // Calculate row height based on content
          const specsText = row.specifications;
          const specsHeight = doc.heightOfString(specsText, {
            width: col2Width - 10,
            align: 'left'
          });
          
          const rowHeight = Math.max(25, specsHeight + 10);

          // Check if we need a new page
          if (yPosition + rowHeight > doc.page.height - 50) {
            doc.addPage();
            yPosition = 50;
            
            // Add header on new page
            doc.fillColor('#1e3a8a')
               .rect(40, yPosition, doc.page.width - 80, 20)
               .fill();
            
            doc.fillColor('#ffffff')
               .fontSize(10)
               .font('Helvetica-Bold')
               .text('COMPONENT', col1X + 5, yPosition + 6, { width: col1Width - 10 })
               .text('SPECIFICATIONS', col2X + 5, yPosition + 6, { width: col2Width - 10 })
               .text('QTY', col3X, yPosition + 6, { width: col3Width, align: 'center' });

            doc.strokeColor('#1e3a8a')
               .lineWidth(1)
               .rect(40, yPosition, doc.page.width - 80, 20)
               .stroke();

            yPosition += 20;
          }

          // Alternate row colors
          if (index % 2 === 0) {
            doc.fillColor('#ffffff')
               .rect(40, yPosition, doc.page.width - 80, rowHeight)
               .fill();
          } else {
            doc.fillColor('#f8fafc')
               .rect(40, yPosition, doc.page.width - 80, rowHeight)
               .fill();
          }

          // Row border
          doc.strokeColor('#e5e7eb')
             .lineWidth(0.3)
             .rect(40, yPosition, doc.page.width - 80, rowHeight)
             .stroke();

          // Component (bold)
          doc.fillColor('#1f2937')
             .fontSize(9)
             .font('Helvetica-Bold')
             .text(row.component, col1X + 5, yPosition + 8, {
               width: col1Width - 10,
               align: 'left'
             });

          // Specifications (normal)
          doc.fillColor('#374151')
             .fontSize(8)
             .font('Helvetica')
             .text(specsText, col2X + 5, yPosition + 8, {
               width: col2Width - 10,
               align: 'left'
             });

          // Quantity (bold, centered)
          doc.fillColor('#1e3a8a')
             .fontSize(9)
             .font('Helvetica-Bold')
             .text(row.quantity, col3X, yPosition + (rowHeight/2) - 4, {
               width: col3Width,
               align: 'center'
             });

          yPosition += rowHeight;
        });
      }

      // Simple footer
      const pageCount = doc.bufferedPageRange().count;
      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);
        doc.fillColor('#6b7280')
           .fontSize(8)
           .text(
             `Page ${i + 1} of ${pageCount}`,
             0,
             doc.page.height - 20,
             { 
               align: 'center',
               width: doc.page.width 
             }
           );
      }

      doc.end();

    } catch (error) {
      reject(error);
    }
  });
}

// Extract structured data from chats
function extractStructuredDataFromChats(chats) {
  const data = {
    institute: '',
    contact: '',
    requirements: '',
    date: ''
  };

  chats.forEach(chat => {
    const content = chat.aiResponse || '';
    
    if (content.includes('--- INSTITUTE_START ---')) {
      data.institute = extractCleanSection(content, 'INSTITUTE_START', 'INSTITUTE_END');
    }
    
    if (content.includes('--- CONTACT_START ---')) {
      data.contact = extractCleanSection(content, 'CONTACT_START', 'CONTACT_END');
    }
    
    if (content.includes('--- REQUIREMENTS_START ---')) {
      data.requirements = extractCleanSection(content, 'REQUIREMENTS_START', 'REQUIREMENTS_END');
    }
    
    if (content.includes('--- DATE_START ---')) {
      data.date = extractCleanSection(content, 'DATE_START', 'DATE_END');
    }
  });

  return data;
}

function extractCleanSection(content, start, end) {
  const regex = new RegExp(`---\\s*${start}\\s*---([\\s\\S]*?)---\\s*${end}\\s*---`, "i");
  const match = content.match(regex);
  if (!match) return 'Not found';
  
  return match[1]
    .trim()
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/`/g, '')
    .replace(/\n\s*\n/g, '\n')
    .trim();
}

// Parse requirements text into structured table data
function parseRequirementsToTable(requirementsText) {
  const lines = requirementsText.split('\n').filter(line => line.trim());
  const tableData = [];
  
  let currentComponent = '';
  let currentSpecs = '';
  let currentQuantity = '';

  lines.forEach(line => {
    line = line.trim();
    if (!line) return;

    // Check if line starts a new component
    const isNewComponent = line.match(/^[A-Za-z][^:]*:/) || 
                          line.match(/^[A-Za-z\s]+\([^)]*\):/) ||
                          line.match(/^(Evaporator|Ethylene|High Pressure|Low pressure|Condenser|Cascade|Thermostatic|Pressure|Service|Rota|Control)/i);

    if (isNewComponent) {
      // Save previous component
      if (currentComponent && currentSpecs) {
        tableData.push({
          component: cleanComponentName(currentComponent),
          specifications: cleanSpecifications(currentSpecs),
          quantity: currentQuantity || '01 No'
        });
      }

      // Reset for new component
      currentComponent = '';
      currentSpecs = '';
      currentQuantity = '';

      // Extract component name
      const colonIndex = line.indexOf(':');
      if (colonIndex > -1) {
        currentComponent = line.substring(0, colonIndex).trim();
        currentSpecs = line.substring(colonIndex + 1).trim();
      } else {
        currentComponent = line;
        currentSpecs = '';
      }

      extractQuantity(line);

    } else {
      // Continue adding to current specifications
      if (currentSpecs) {
        currentSpecs += ' ' + line;
      } else if (currentComponent) {
        currentSpecs = line;
      }
      extractQuantity(line);
    }

    function extractQuantity(text) {
      const quantityMatch = text.match(/\(Quantity:\s*([^)]+)\)/i);
      if (quantityMatch && !currentQuantity) {
        currentQuantity = quantityMatch[1].trim();
        currentSpecs = currentSpecs.replace(/\(Quantity:\s*[^)]+\)/i, '').trim();
      }
    }
  });

  // Add the last component
  if (currentComponent && currentSpecs) {
    tableData.push({
      component: cleanComponentName(currentComponent),
      specifications: cleanSpecifications(currentSpecs),
      quantity: currentQuantity || '01 No'
    });
  }

  return tableData;
}

// Clean component names
function cleanComponentName(name) {
  return name
    .replace(/\([^)]*\)/g, '')
    .replace(/:\s*$/, '')
    .replace(/^([^:]+):.*$/, '$1')
    .trim();
}

// Clean specifications
function cleanSpecifications(specs) {
  return specs
    .replace(/\(Quantity:\s*[^)]+\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = router;