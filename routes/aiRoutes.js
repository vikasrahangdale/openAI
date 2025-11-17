const express = require("express");
const router = express.Router();
const axios = require("axios");
const cheerio = require("cheerio");
const puppeteer = require("puppeteer");
const auth = require("../middleware/auth");
const subscriptionCheck = require("../middleware/subscriptionCheck");
const SupplierResult = require("../models/SupplierResult");
const Conversation = require("../models/Conversation");
const Chat = require("../models/Chat");
const geminiService = require("../utils/gemini");
const mongoose = require("mongoose");


// ✅ OpenAI Init (if needed later)
// const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Regex patterns
const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/gi;
const indianPhoneRegex = /(?:\+91[\s-]?)?[6789]\d{9}|0[6789]\d{9}|[6789]\d{9}/g;
const whatsappRegex = /https?:\/\/(?:wa\.me|api\.whatsapp\.com\/send)[^"'<\s]+/gi;
const cityRegex = /(?:Ambala|Delhi|Mumbai|Chennai|Kolkata|Bangalore|Hyderabad|Pune|Ahmedabad|Jaipur|Lucknow|Kanpur|Nagpur|Indore|Thane|Bhopal|Visakhapatnam|Patna|Vadodara|Ghaziabad|Ludhiana|Agra|Nashik|Faridabad|Meerut|Rajkot|Kalyan|Vasai|Varanasi|Srinagar|Aurangabad|Dhanbad|Amritsar|Navi Mumbai|Allahabad|Ranchi|Howrah|Coimbatore|Jabalpur|Gwalior|Vijayawada|Jodhpur|Madurai|Raipur|Kota|Chandigarh|Guwahati|Solapur|Hubli|Dharwad|Bareilly|Moradabad|Mysore|Tiruchirappalli|Shimla|Bhilai|Jamshedpur|Bhubaneswar|Salem|Warangal|Jalgaon|Guntur|Bhiwandi|Saharanpur|Gorakhpur|Bikaner|Amravati|Noida|Jamshedpur|Bhilai|Bokaro|Akola|Belgaum|Karnal|Bhagalpur|Mangalore|Muzaffarnagar|Ujjain|Nellore|Jammu|Kharagpur|Darbhanga|Kollam|Kozhikode|Erode|Rourkela|Shillong|Thrissur|Kakinada|Aligarh|Bhavnagar|Bilaspur|Cuttack|Karnal|Mathura|Panihati|Latur|Dhule|Rohtak|Korba|Bhilwara|Brahmapur|Muzaffarpur|Ahmednagar|Kollam|Rampur|Shimoga|Vellore|Ganganagar|Tumkur|Palakkad|Sambalpur|Bardhaman|Kulti|Sasaram|Hapur|Ongole|Nizamabad|Malkajgiri|Parbhani|Tumkur|Khammam|Bihar Sharif|Panipat|Durgapur|Bally|Ulhasnagar|Jamnagar|Satara|Alwar|Dewas|Haldia|Nandyal|Ozhukarai|Kadapa|Karnal|Anantapuram|Kurnool|Bathinda|Ramagundam|Karimnagar|Arrah|Puducherry|Yamunanagar|Bihariganj|Bhadravati|Khandwa|Bhind|Chandrapur|Farrukhabad|Ambala|Haryana|Punjab|Uttar Pradesh|Maharashtra|Tamil Nadu|Karnataka|Gujarat|Rajasthan|West Bengal|Madhya Pradesh)/gi;

// ✅ FIXED Puppeteer function
async function fetchRenderedHTML(url) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox", 
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage"
      ],
      timeout: 80000
    });

    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(60000);
    await page.setDefaultTimeout(60000);
    
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    );

    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    console.log(`🔍 Navigating to: ${url}`);
    
    await page.goto(url, { 
      waitUntil: ["domcontentloaded", "networkidle0"],
      timeout: 60000
    });

    // Wait for page to load completely
    await page.waitForFunction(
      () => document.readyState === 'complete',
      { timeout: 30000 }
    );

    const html = await page.content();
    await browser.close();
    
    console.log(`✅ Successfully loaded: ${url}`);
    return html;
    
  } catch (err) {
    if (browser) await browser.close();
    console.log(`❌ Puppeteer failed for ${url}:`, err.message);
    return null;
  }
}

// ✅ Normalize website URL
function normalizeWebsite(url) {
  try {
    if (!url.startsWith("http")) url = "https://" + url;
    return new URL(url).origin;
  } catch {
    return null;
  }
}

// ✅ Enhanced Email Extraction
function extractEmails(html, src) {
  if (!html) return [];
  const emails = [...new Set(html.match(emailRegex) || [])].map(e => {
    const email = e.toLowerCase();
    let description = "General Contact";
    
    if (email.includes("sales") || email.includes("sell") || email.includes("order")) {
      description = "Sales Department";
    } else if (email.includes("info") || email.includes("contact") || email.includes("enquiry")) {
      description = "Information Desk";
    } else if (email.includes("support") || email.includes("help") || email.includes("service")) {
      description = "Customer Support";
    } else if (email.includes("admin") || email.includes("office")) {
      description = "Administration";
    } else if (email.includes("career") || email.includes("hr") || email.includes("jobs")) {
      description = "HR Department";
    }
    
    return {
      value: email,
      source: src,
      description: description,
      type: "email"
    };
  });
  
  return emails;
}

// ✅ Enhanced Phone Extraction
function normalizeIndianPhone(num) {
  num = num.replace(/[^\d]/g, "");
  if (num.length === 10 && /^[6789]/.test(num)) return "+91" + num;
  if (num.startsWith("91") && num.length === 12 && /^91[6789]/.test(num)) return "+" + num;
  if (num.startsWith("0") && num.length === 11 && /^0[6789]/.test(num)) return "+91" + num.slice(1);
  return null;
}

function extractPhones(html, src) {
  const $ = cheerio.load(html);
  let phones = [];

  (html.match(indianPhoneRegex) || []).forEach(num => {
    const formatted = normalizeIndianPhone(num);
    if (formatted) {
      phones.push({ 
        value: formatted, 
        source: src,
        description: "Business Phone",
        type: "phone"
      });
    }
  });

  $("a[href^='tel:']").each((_, el) => {
    const phone = $(el).attr("href").replace("tel:", "");
    const formatted = normalizeIndianPhone(phone);
    if (formatted) {
      phones.push({ 
        value: formatted, 
        source: src,
        description: "Direct Call",
        type: "phone"
      });
    }
  });

  return [...new Map(phones.map(p => [p.value, p])).values()];
}

// ✅ Enhanced WhatsApp Extraction
function extractWhatsapp(html, src) {
  const whatsapps = [...new Set([...html.matchAll(whatsappRegex)].map(m => m[0]))].map(link => ({
    value: link,
    source: src,
    description: "WhatsApp Business Chat",
    type: "whatsapp"
  }));
  
  return whatsapps.slice(0, 3);
}

// ✅ IMPROVED Address Extraction with City Detection
function extractAddress(html, src) {
  const $ = cheerio.load(html);
  let addresses = [];
  
  // Extract from address tags
  $('address').each((_, el) => {
    const addressText = $(el).text().trim().replace(/\s+/g, ' ');
    if (addressText.length > 15) {
      const cities = addressText.match(cityRegex) || [];
      const city = cities.length > 0 ? cities[0] : "City not specified";
      
      addresses.push({
        value: addressText.substring(0, 200),
        source: src,
        description: `Business Address - ${city}`,
        type: "address",
        city: city
      });
    }
  });
  
  // Extract location from text content
  $('p, div, span').each((_, el) => {
    const text = $(el).text().trim().replace(/\s+/g, ' ');
    if (text.length > 50 && text.length < 300) {
      const cities = text.match(cityRegex) || [];
      if (cities.length > 0) {
        const city = cities[0];
        addresses.push({
          value: text.substring(0, 150),
          source: src,
          description: `Business Location - ${city}`,
          type: "address",
          city: city
        });
      }
    }
  });
  
  return [...new Map(addresses.map(a => [a.value, a])).values()].slice(0, 2);
}

// ✅ Enhanced Company Name Extraction
function extractSellerName(html) {
  const $ = cheerio.load(html);
  
  const name = 
    $("meta[property='og:site_name']").attr("content") ||
    $("meta[name='og:site_name']").attr("content") ||
    $("title").text().trim().split('|')[0].split('-')[0].trim() ||
    $("h1").first().text().trim() ||
    $(".logo").attr("alt") ||
    $("[class*='brand']").text().trim() ||
    "Company Name Not Found";
  
  return name.substring(0, 100);
}

function extractProductAvailability(html, serperDescription = "") {
  const $ = cheerio.load(html);
  
  let description = "";
  
  // Priority 1: Use SERPER description if available
  if (serperDescription && serperDescription.length > 20) {
    description = serperDescription;
  }
  // Priority 2: Meta descriptions
  else if ($("meta[name='description']").attr("content")) {
    description = $("meta[name='description']").attr("content");
  }
  // Priority 3: Open Graph description
  else if ($("meta[property='og:description']").attr("content")) {
    description = $("meta[property='og:description']").attr("content");
  }
  else {
    const h1 = $("h1").first().text().trim();
    const h2 = $("h2").first().text().trim();
    description = h1 + (h2 ? " - " + h2 : "");
  }
  
  if (!description || description.length < 30) {
    const keywords = $("meta[name='keywords']").attr("content");
    if (keywords) {
      description = "Products: " + keywords;
    } else {
      description = "Laboratory equipment supplier with various scientific instruments and apparatus";
    }
  }
  
  return description.substring(0, 250);
}

// ✅ Enhanced Rating Calculation
function calculateRating(emails, phones, whatsapps, hasAddress) {
  let score = 1.0;
  
  score += Math.min(emails.length * 0.8, 2.0);
  score += Math.min(phones.length * 0.6, 1.5);
  score += Math.min(whatsapps.length * 0.4, 1.0);
  score += hasAddress ? 0.5 : 0;
  
  return Math.min(5.0, score).toFixed(1);
}

async function fetchWithAxios(url) {
  try {
    const response = await axios.get(url, {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    return response.data;
  } catch (error) {
    console.log(`❌ Axios fallback failed for ${url}:`, error.message);
    return null;
  }
}

async function saveChatAndUpdateConversation(conversationId, userId, userMessage, aiResponse) {
  try {
    console.log(`💾 Saving chat for conversation: ${conversationId}`);
    
    // 1. Save chat message
    const newChat = await Chat.create({
      conversationId,
      userId,
      userMessage,
      aiResponse
    });

    // 2. Update conversation
    await Conversation.findByIdAndUpdate(
      conversationId,
      {
        $inc: { messageCount: 1 },
        lastMessage: userMessage.substring(0, 100),
        updatedAt: new Date()
      }
    );

    console.log(`✅ Chat saved successfully: ${newChat._id}`);
    return newChat;
  } catch (error) {
    console.error("❌ Error in saveChatAndUpdateConversation:", error);
    throw error;
  }
}

router.get("/conversations", auth, async (req, res) => {
  try {
    const userId = req.user._id;
    const { type } = req.query;

    const filter = { userId };
    if (type) filter.type = type;

    const conversations = await Conversation.find(filter)
      .sort({ updatedAt: -1 })
      .select("_id title type lastMessage createdAt updatedAt messageCount");

    res.json({
      success: true,
      conversations
    });
  } catch (error) {
    console.error("❌ Error fetching conversations:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to load conversations" 
    });
  }
});

router.get("/conversations/:id", auth, async (req, res) => {
  try {
    const conversation = await Conversation.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: "Conversation not found"
      });
    }

    const chats = await Chat.find({
      conversationId: req.params.id,
      userId: req.user._id
    }).sort({ createdAt: 1 });

    res.json({
      success: true,
      conversation,
      chats
    });
  } catch (error) {
    console.error("❌ Error fetching conversation:", error);
    res.status(500).json({
      success: false,
      error: "Failed to load conversation"
    });
  }
});

router.post("/conversations", auth, async (req, res) => {
  try {
    const { title, type = "chat" } = req.body;
    const userId = req.user._id;

    const conversation = await Conversation.create({
      title: title || `New ${type === "supplier" ? "Supplier Search" : "Chat"}`,
      userId,
      type,
      lastMessage: "",
      messageCount: 0
    });

    res.json({
      success: true,
      conversation
    });
  } catch (error) {
    console.error("❌ Error creating conversation:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create conversation"
    });
  }
});

router.post("/find-supplier", auth, subscriptionCheck, async (req, res) => {
  try {

    const { prompt } = req.body;
    const userId = req.user._id;

    // ✅ Validate Body
    if (!prompt || typeof prompt !== "string" || prompt.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Prompt is required"
      });
    }

    console.log(`🔍 User ${userId} searching for: "${prompt}"`);

    // ✅ STEP 1: Check cache FIRST
    const existingResult = await SupplierResult.findOne({ userId, prompt });

    if (existingResult) {
      console.log(`✅ Cached result found for "${prompt}"`);

      // ✅ Fix: Avoid undefined prompt for title
      const safeTitle = `Supplier: ${
        prompt.substring(0, 30)
      }${prompt.length > 30 ? "..." : ""}`;

      let conversation = await Conversation.findOne({
        userId,
        type: "supplier",
        lastMessage: prompt
      });

      if (!conversation) {
        conversation = await Conversation.create({
          title: safeTitle,
          userId,
          type: "supplier",
          lastMessage: prompt
        });

        await saveChatAndUpdateConversation(
          conversation._id,
          userId,
          prompt,
          JSON.stringify({
            type: "supplier_results",
            totalResults: existingResult.totalFound,
            results: existingResult.suppliers,
            searchDate: existingResult.searchDate,
            cached: true
          })
        );
      }

      return res.json({
        success: true,
        totalResults: existingResult.totalFound,
        results: existingResult.suppliers,
        cached: true,
        conversationId: conversation._id,
        searchDate: existingResult.searchDate,
        message: "Cached result returned"
      });
    }

    console.log(`🔄 No cache, doing fresh search...`);

    let results = [];

    // ✅ SERPER Google Search
    const serperResponse = await axios.post(
      "https://google.serper.dev/search",
      { q: `${prompt} supplier India contact website email phone`, num: 15 },
      { headers: { "X-API-KEY": process.env.SERPER_API_KEY }, timeout: 30000 }
    );

    let searchResults = (serperResponse.data?.organic || [])
      .filter(item =>
        item.link &&
        !item.link.includes("google.com") &&
        !item.link.includes("youtube.com") &&
        !item.link.includes("facebook.com") &&
        !item.link.includes("twitter.com")
      )
      .slice(0, 12)
      .map(item => ({
        title: item.title,
        link: item.link,
        snippet: item.snippet,
        hostname: new URL(item.link).hostname
      }));

    console.log(`🎯 SERPER URLs fetched: ${searchResults.length}`);

    // ✅ SCRAPING LOOP
    const processedDomains = new Set();

    for (const result of searchResults) {
      const dom = result.hostname;
      if (processedDomains.has(dom)) continue;
      processedDomains.add(dom);

      const siteUrl = normalizeWebsite(dom);
      if (!siteUrl) continue;

      console.log(`🌐 Scraping: ${siteUrl}`);

      let html =
        (await fetchRenderedHTML(siteUrl)) ||
        (await fetchWithAxios(siteUrl));

      if (!html) continue;

      try {
        let emails = extractEmails(html, siteUrl);
        let phones = extractPhones(html, siteUrl);
        let whatsapps = extractWhatsapp(html, siteUrl);
        let addresses = extractAddress(html, siteUrl);
        const productDescription = extractProductAvailability(html, result.snippet);

        emails = [...new Map(emails.map(e => [e.value, e])).values()];
        phones = [...new Map(phones.map(p => [p.value, p])).values()];
        whatsapps = [...new Map(whatsapps.map(w => [w.value, w])).values()];
        addresses = [...new Map(addresses.map(a => [a.value, a])).values()];

        const cities = [...new Set(addresses.map(addr => addr.city).filter(Boolean))];
        const location = cities[0] || "Location not specified";

        const formattedResult = {
          sellerName: extractSellerName(html),
          website: siteUrl,
          location,
          emails,
          phones,
          whatsapps,
          addresses,
          productAvailability: productDescription,
          rating: calculateRating(emails, phones, whatsapps, addresses.length > 0),
          lastUpdated: new Date().toISOString(),
          contactInfoFound: emails.length + phones.length + whatsapps.length,
          cities
        };

        if (formattedResult.contactInfoFound > 0) {
          results.push(formattedResult);
        }

      } catch (err) {
        console.log(`❌ Scrape failed: ${err.message}`);
      }
    }

    // ✅ Create safe title (Fix crash)
    const safeTitle = `Supplier: ${
      prompt.substring(0, 30)
    }${prompt.length > 30 ? "..." : ""}`;

    const conversation = await Conversation.create({
      title: safeTitle,
      userId,
      type: "supplier",
      lastMessage: prompt
    });

    if (results.length > 0) {
      await SupplierResult.create({
        userId,
        prompt,
        suppliers: results,
        totalFound: results.length,
        searchDate: new Date()
      });

      await saveChatAndUpdateConversation(
        conversation._id,
        userId,
        prompt,
        JSON.stringify({
          type: "supplier_results",
          totalResults: results.length,
          results: results,
          searchDate: new Date(),
          cached: false
        })
      );
    }

    return res.json({
      success: true,
      totalResults: results.length,
      results: results.sort((a, b) => parseFloat(b.rating) - parseFloat(a.rating)),
      cached: false,
      conversationId: conversation._id,
      searchDate: new Date().toISOString(),
      message: results.length > 0 ? "Fresh search complete" : "No suppliers found"
    });

  } catch (err) {
    console.error("💥 Supplier Search Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});


router.post("/save-supplier", auth, async (req, res) => {
  try {
    const userId = req.user._id;  // ✅ use the logged-in user ID
    const { prompt, suppliers } = req.body;

    await SupplierResult.create({
      userId,
      prompt,
      suppliers,
    });

    res.json({ success: true, message: "Supplier saved!" });
  } catch (error) {
    console.error("❌ Error saving supplier:", error);
    res.status(500).json({ success: false, error: "Failed to save supplier" });
  }
});


router.get("/supplier-history", auth, async (req, res) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "User ID not found in request",
      });
    }

    // ✅ Convert to ObjectId (important!)
    const objectId = new mongoose.Types.ObjectId(userId);

    // ✅ Query using ObjectId
    const searchHistory = await SupplierResult.find({ userId: objectId })
      .sort({ createdAt: -1 })
      .select("prompt createdAt suppliers")
      .limit(20);

    console.log(`📜 Found ${searchHistory.length} history records for user ${userId}`);

    res.json({
      success: true,
      history: searchHistory,
    });
  } catch (error) {
    console.error("❌ Error fetching supplier history:", error);
    res.status(500).json({
      success: false,
      error: "Failed to load search history",
    });
  }
});

router.post("/chat", auth, async (req, res) => {
  try {
    const { message, conversationId } = req.body;
    const userId = req.user._id;

    if (!message) {
      return res.status(400).json({ success: false, error: "Message is required" });
    }

    let conversation;

    if (conversationId) {
      conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        return res.status(404).json({ success: false, error: "Conversation not found" });
      }
    } else {
      conversation = await Conversation.create({
        title: message.substring(0, 30) + (message.length > 30 ? "..." : ""),
        userId,
        type: "chat",
        lastMessage: message,
      });
    }

    // ✅ Ask Gemini (ONLY message)
    const responseText = await geminiService.sendMessage(message);

    // ✅ Save User + AI Chat
    await Chat.create({
      conversationId: conversation._id,
      userId,
      userMessage: message,
      aiResponse: responseText || "No reply",
    });

    // ✅ Update Conversation
    await Conversation.findByIdAndUpdate(
      conversation._id,
      {
        lastMessage: message,
        $inc: { messageCount: 1 },
      },
      { new: true }
    );

    return res.json({
      success: true,
      conversationId: conversation._id,
      aiResponse: responseText || "No response",
    });

  } catch (error) {
    console.error("❌ Gemini Route Error:", error);
    return res.status(500).json({ success: false, error: "Something went wrong" });
  }
});








module.exports = router;