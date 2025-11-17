const subscriptionCheck = async (req, res, next) => {
  try {
    if (req.user.usageCount >= req.user.subscriptionLimit) {
      return res.status(429).json({
        error: 'Usage limit exceeded',
        message: 'Please upgrade your subscription to continue using the service'
      });
    }
    next();
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = subscriptionCheck;