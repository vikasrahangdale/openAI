const express = require("express");
const router = express.Router();
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const auth = require("../middleware/auth");

function getSubscriptionLimit(tier) {
  switch (tier) {
    case "premium":
      return 999999;
    case "enterprise":
      return 9999999;
    default:
      return 50;
  }
}

router.post("/register", async (req, res) => {
  try {
    const {
      email,
      password,
      companyName = "",
      gstNumber = "",
      subscriptionTier = "basic"
    } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ error: "User already exists" });
    }

    const user = new User({
      email,
      password, 
      companyName,
      gstNumber,
      subscriptionTier,
      subscriptionLimit: getSubscriptionLimit(subscriptionTier)
    });

    await user.save();

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "3d",
    });

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        companyName: user.companyName,
        gstNumber: user.gstNumber,
        subscriptionTier: user.subscriptionTier,
        usageCount: user.usageCount,
        subscriptionLimit: user.subscriptionLimit
      },
    });
  } catch (error) {
    console.error("REGISTER ERROR:", error);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "Invalid credentials" });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "24h",
    });

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        companyName: user.companyName,
        gstNumber: user.gstNumber,
        subscriptionTier: user.subscriptionTier,
        usageCount: user.usageCount,
        subscriptionLimit: user.subscriptionLimit
      },
    });
  } catch (error) {
    console.error("LOGIN ERROR:", error);
    res.status(500).json({ error: "Server error" });
  }
});


router.get("/profile", auth, async (req, res) => {
  try {
    res.json({
      success: true,
      user: {
        id: req.user._id,
        email: req.user.email,
        companyName: req.user.companyName,
        gstNumber: req.user.gstNumber,
        subscriptionTier: req.user.subscriptionTier,
        usageCount: req.user.usageCount,
        subscriptionLimit: req.user.subscriptionLimit,
        createdAt: req.user.createdAt
      }
    });
  } catch (error) {
    console.error("PROFILE ERROR:", error);
    res.status(500).json({ error: "Server error" });
  }
});



router.post("/logout", (req, res) => {
  try {
    return res.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("LOGOUT ERROR:", error);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
