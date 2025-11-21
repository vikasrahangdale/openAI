const { GoogleGenerativeAI } = require("@google/generative-ai");
const PDFDocument = require("pdfkit");
const fs = require("fs");

class GeminiService {
  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }

  async sendMessage(message) {
    try {
      const model = this.genAI.getGenerativeModel({
        model: "gemini-2.5-flash", // Fixed model name
      });

      const result = await model.generateContent({
        contents: [
          {
            parts: [
              { text: message }
            ]
          }
        ]
      });

      const text =
        result?.response?.candidates?.[0]?.content?.parts?.[0]?.text ||
        result?.response?.candidates?.[0]?.content?.parts?.[0] ||
        result?.response?.text() ||
        result?.text ||
        result?.response ||
        "No response found";

      return text;

    } catch (err) {
      return "Error: " + err.message;
    }
  }

  async extractRequirements(fileBuffer, mimeType, fileName) {
    try {
      console.log("🔍 Analyzing tender document for specifications...");

      const model = this.genAI.getGenerativeModel({
        model: "gemini-2.5-flash", // Fixed model name
      });

      const prompt = `
        Analyze this TENDER DOCUMENT and extract ONLY the TECHNICAL SPECIFICATIONS of the product/equipment.

        Focus ONLY on these technical details:
        - Product name and model
        - Technical parameters and measurements
        - Materials and components
        - Capacity and performance specs
        - Dimensions and sizes
        - Technical requirements

        Format output EXACTLY like this:

        --- PRODUCT_START ---
        [Product Name]
        --- PRODUCT_END ---

        --- SPECIFICATIONS_START ---
        | Specification | Details |
        |---------------|---------|
        [List ALL technical specifications from the document]
        --- SPECIFICATIONS_END ---

        IGNORE: Prices, delivery dates, warranty, eligibility criteria, payment terms - these are NOT technical specifications.
        EXTRACT ONLY: Technical parameters, measurements, materials, capacities.

        At the end add: "Reply YES if you want me to generate a PDF."
      `;

      // Proper base64 conversion
      const base64Data = this.getBase64Data(fileBuffer);

      const result = await model.generateContent({
        contents: [
          {
            parts: [
              {
                inlineData: {
                  data: base64Data,
                  mimeType: mimeType,
                },
              },
              { text: prompt },
            ],
          },
        ],
      });

      const text = result?.response?.candidates?.[0]?.content?.parts?.[0]?.text ||
                   result?.response?.text() ||
                   "No response from Gemini";

      console.log("✅ Technical specifications extracted");
      
      const product = this.extractBetween(text, "PRODUCT_START", "PRODUCT_END");
      console.log("🎯 Product Found:", product);

      return text;

    } catch (err) {
      console.error("❌ Analysis Error:", err);
      return "Error analyzing specifications: " + err.message;
    }
  }

  async processFileWithMessage(fileBuffer, mimeType, fileName, userMessage) {
    try {
      const model = this.genAI.getGenerativeModel({
        model: "gemini-2.5-flash", // Fixed model name
      });

      const prompt = `
Extract the following information CLEANLY from the attached document.
Write ONLY the requested sections in exact block format below.

1. Institute Name
2. Address & Contact Details
3. Document/Tender Date
4. All Requirements / Specifications

Return EXACTLY in this format:

--- INSTITUTE_START ---
[Institute Name]
[Department, if present]
--- INSTITUTE_END ---

--- CONTACT_START ---
Address: [Full Address]
Email: [Email]
Phone: [Phone Numbers]
Website: [Website]
--- CONTACT_END ---

--- DATE_START ---
[Document/Tender Date]
--- DATE_END ---

--- REQUIREMENTS_START ---
[List every requirement/specification clearly, one per line]
--- REQUIREMENTS_END ---

Do NOT add anything outside these blocks.
If any field is missing in document, write "Not found".
`;

      // Proper base64 conversion
      const base64Data = this.getBase64Data(fileBuffer);

      console.log(`📄 Processing file: ${fileName}, Type: ${mimeType}, Size: ${base64Data.length} chars`);

      const result = await model.generateContent({
        contents: [
          {
            parts: [
              {
                inlineData: {
                  data: base64Data,
                  mimeType: mimeType,
                },
              },
              { text: prompt },
            ],
          },
        ],
      });

      const text =
        result?.response?.candidates?.[0]?.content?.parts?.[0]?.text ||
        result?.response?.text() ||
        "AI response missing";

      console.log("✅ File processed successfully");
      return text;

    } catch (err) {
      console.error("❌ Error in processFileWithMessage:", err);
      
      // Return structured fallback response
      return `--- INSTITUTE_START ---
Not found
--- INSTITUTE_END ---

--- CONTACT_START ---
Not found
--- CONTACT_END ---

--- DATE_START ---
Not found
--- DATE_END ---

--- REQUIREMENTS_START ---
Error processing document: ${err.message}
Please try again with a different file or check the file format.
--- REQUIREMENTS_END ---`;
    }
  }

  // New method to handle file processing with the expected name
  async processFile(file, message = "") {
    try {
      console.log(`📄 Processing file: ${file.originalname}, Type: ${file.mimetype}`);
      
      // Use the existing processFileWithMessage method
      return await this.processFileWithMessage(
        file.buffer,
        file.mimetype,
        file.originalname,
        message || "Extract technical specifications from this document"
      );
    } catch (error) {
      console.error("❌ File processing error:", error);
      throw new Error(`File processing failed: ${error.message}`);
    }
  }

  // Helper method to properly convert buffer to base64
  getBase64Data(fileBuffer) {
    try {
      if (fileBuffer instanceof Buffer) {
        return fileBuffer.toString('base64');
      } else if (fileBuffer.data) {
        // If it's already a base64 object
        return fileBuffer.data.toString('base64');
      } else if (fileBuffer.buffer) {
        // If it has a buffer property
        return fileBuffer.buffer.toString('base64');
      } else {
        // Convert to buffer first
        return Buffer.from(fileBuffer).toString('base64');
      }
    } catch (error) {
      console.error("❌ Error converting to base64:", error);
      throw new Error("Invalid file buffer format");
    }
  }

  async createRequirementsPDF(requirements, outputPath) {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: "A4",
        margin: 30
      });

      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      // Extract product and specifications
      const productName = this.extractBetween(requirements, "PRODUCT_START", "PRODUCT_END");
      const specifications = this.extractBetween(requirements, "SPECIFICATIONS_START", "SPECIFICATIONS_END");

      // Title
      doc.fontSize(20).font("Helvetica-Bold").text("TECHNICAL SPECIFICATIONS REPORT", { align: "center" });
      doc.moveDown(0.5);
      
      // Product Name
      if (productName && productName !== "Content not found") {
        doc.fontSize(16).font("Helvetica-Bold").text(`Product: ${productName}`, { align: "center" });
      }
      
      doc.moveDown(1.5);

      // Print specifications table
      if (specifications && specifications !== "Content not found") {
        doc.fontSize(14).font("Helvetica-Bold").text("Technical Specifications:", { align: "left" });
        doc.moveDown(0.5);
        this.renderCleanTable(doc, specifications);
      } else {
        doc.fontSize(12).text("No technical specifications found.", { align: "center" });
      }

      // Footer
      doc.moveDown(2);
      doc.fontSize(8).text(`Generated on: ${new Date().toLocaleDateString()}`, { align: "center" });

      doc.end();

      stream.on("finish", () => {
        console.log("✅ Specifications PDF generated successfully");
        resolve(true);
      });
      stream.on("error", reject);
    });
  }

  // Clean table with black borders and white background
  renderCleanTable(doc, tableText) {
    const lines = tableText.split('\n');
    let yPosition = doc.y;
    const leftMargin = 30;
    const pageWidth = 530;
    const col1Width = pageWidth * 0.4;
    const col2Width = pageWidth * 0.6;
    
    let rowCount = 0;

    // Table header
    doc.rect(leftMargin, yPosition, pageWidth, 25).fill("#ffffff").stroke("#000000");
    doc.fillColor("#000000")
       .fontSize(10)
       .font("Helvetica-Bold")
       .text("SPECIFICATION", leftMargin + 8, yPosition + 8, { 
         width: col1Width - 16 
       })
       .text("DETAILS", leftMargin + col1Width + 8, yPosition + 8, { 
         width: col2Width - 16 
       });
    
    yPosition += 25;

    doc.fontSize(9).font("Helvetica").fillColor("#000000");

    lines.forEach((line) => {
      line = line.trim();
      
      // Skip separator lines and header
      if (!line || line.startsWith('|---') || line.startsWith('|-') || 
          (line.includes('Specification') && line.includes('Details'))) {
        return;
      }

      // Parse table row
      if (line.startsWith('|')) {
        const cells = line.split('|')
          .map(cell => cell.trim())
          .filter(cell => cell !== '');

        if (cells.length >= 2) {
          const specification = cells[0];
          const details = cells.slice(1).join(' ');

          // Check for page break
          if (yPosition > 750) {
            doc.addPage();
            yPosition = 30;
            // Add header on new page
            doc.rect(leftMargin, yPosition, pageWidth, 25).fill("#ffffff").stroke("#000000");
            doc.fillColor("#000000")
               .fontSize(10)
               .font("Helvetica-Bold")
               .text("SPECIFICATION", leftMargin + 8, yPosition + 8, { width: col1Width - 16 })
               .text("DETAILS", leftMargin + col1Width + 8, yPosition + 8, { width: col2Width - 16 });
            yPosition += 25;
          }

          // Calculate row height
          const specHeight = doc.heightOfString(specification, { 
            width: col1Width - 16,
            lineGap: 2
          });
          const detHeight = doc.heightOfString(details, { 
            width: col2Width - 16,
            lineGap: 2
          });
          const rowHeight = Math.max(specHeight, detHeight) + 12;

          // White background
          doc.rect(leftMargin, yPosition, pageWidth, rowHeight).fill("#ffffff");

          // Black borders
          doc.rect(leftMargin, yPosition, pageWidth, rowHeight).stroke("#000000");

          // Vertical line between columns
          doc.moveTo(leftMargin + col1Width, yPosition)
             .lineTo(leftMargin + col1Width, yPosition + rowHeight)
             .stroke("#000000");

          // Draw content
          doc.fillColor("#000000")
             .text(specification, leftMargin + 8, yPosition + 6, {
               width: col1Width - 16,
               lineGap: 2
             })
             .text(details, leftMargin + col1Width + 8, yPosition + 6, {
               width: col2Width - 16,
               lineGap: 2
             });

          yPosition += rowHeight;
          rowCount++;
        }
      }
    });

    console.log(`✅ Rendered ${rowCount} technical specifications in PDF`);
  }

  extractBetween(text, start, end) {
    if (!text || typeof text !== 'string') {
      return "No content available";
    }

    const regex = new RegExp(`---\\s*${start}\\s*---([\\s\\S]*?)---\\s*${end}\\s*---`, "i");
    const match = text.match(regex);
    return match ? match[1].trim() : "Content not found";
  }
}

module.exports = new GeminiService();