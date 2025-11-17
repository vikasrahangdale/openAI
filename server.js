const express = require("express");
const cors = require("cors");
const path = require('path');
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
require("dotenv").config();
const connectDB = require("./config/db");

const aiRoutes = require("./routes/aiRoutes");
const authRoutes = require("./routes/authRoutes");
const subscriptionRoutes = require("./routes/subscriptionRoutes");
const emailRoutes = require("./routes/emailRoutes");
const webhookRoutes = require("./routes/webhookRoutes");
const uploadRoute = require("./routes/uploadRoutes");
// const geminiRoutes = require("./routes/geminiRoutes");

const app = express();

// ✅ Connect DB
connectDB();

app.use(cors({
  origin: "http://localhost:5173",
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

app.use(helmet());
app.use(express.json());

// ✅ Rate Limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many requests, please try again later.",
});
app.use(limiter);

// ✅ ROUTES
app.use("/api/ai", aiRoutes);                 // <-- must be a router
app.use("/auth", authRoutes);
app.use("/api/subscription", subscriptionRoutes);
app.use("/api/emails", emailRoutes);          // add/list emails
app.use("/api/webhook", webhookRoutes); 
app.use("/upload", uploadRoute);
// app.use("/ai", geminiRoutes);    
// 


app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ✅ Health Check
app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", message: "Server is running" });
});

// ✅ ERROR HANDLER
app.use((err, req, res, next) => {
  console.error("❌ Server Error:", err.stack);
  res.status(500).json({ error: "Internal server error" });
});

// ✅ Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
