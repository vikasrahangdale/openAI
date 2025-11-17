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
        model: "gemini-2.5-flash",
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
        result?.response?.text ||
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
        model: "gemini-2.5-flash",
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

      const result = await model.generateContent({
        contents: [
          {
            parts: [
              {
                inlineData: {
                  data: fileBuffer.toString("base64"),
                  mimeType: mimeType,
                },
              },
              { text: prompt },
            ],
          },
        ],
      });

      const text = result?.response?.candidates?.[0]?.content?.parts?.[0]?.text ||
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