const jwt = require("jsonwebtoken");
const {
  validateTokenWithAuthService
} = require("../services/externalServices");

// Authenticate — tries Auth Service first, falls back to local JWT verify
const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token provided" });

  // Try Auth Service if URL is configured
  if (process.env.GATEWAY_URL) {
    const user = await validateTokenWithAuthService(token);
    if (user) {
      req.user = user;
      return next();
    }
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  // Fallback: local JWT verify
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
};

// Admin only access
const adminOnly = (req, res, next) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
};

module.exports = { authenticate, adminOnly };
