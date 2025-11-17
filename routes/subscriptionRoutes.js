const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');
const router = express.Router();

router.get('/info', auth, async (req, res) => {
  try {
    res.json({
      success: true,
      subscription: {
        tier: req.user.subscriptionTier,
        usage: req.user.usageCount,
        limit: req.user.subscriptionLimit,
        remaining: req.user.subscriptionLimit - req.user.usageCount
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/upgrade', auth, async (req, res) => {
  try {
    const { newTier } = req.body;
    const validTiers = ['basic', 'premium', 'enterprise'];

    if (!newTier || !validTiers.includes(newTier.toLowerCase())) {
      return res.status(400).json({ error: 'Invalid subscription tier' });
    }

    req.user.subscriptionTier = newTier.toLowerCase();
    req.user.subscriptionLimit = getSubscriptionLimit(newTier.toLowerCase());
    await req.user.save();

    res.json({
      success: true,
      message: 'Subscription upgraded successfully',
      subscription: {
        tier: req.user.subscriptionTier,
        limit: req.user.subscriptionLimit
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

function getSubscriptionLimit(tier) {
  const limits = {
    basic: Number(process.env.BASIC_SUBSCRIPTION_LIMIT) || 50,
    premium: Number(process.env.PREMIUM_SUBSCRIPTION_LIMIT) || 500,
    enterprise: Number(process.env.ENTERPRISE_SUBSCRIPTION_LIMIT) || 5000
  };
  return limits[tier] || limits.basic;
}

module.exports = router;
