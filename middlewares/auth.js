const jwt = require("jsonwebtoken");

const Authenticated = (req, res, next) => {

  const auth = req.headers["authorization"] || req.headers["Authorization"];
  if (!auth || !auth.startsWith("Bearer")) {
    console.log(`[AUTH] Missing or invalid Authorization header for: ${req.originalUrl}`);
    return res
      .status(403)
      .json({ message: "Unauthorized, JWT token is required" });
  }
  try {
    const token = auth.split(" ")[1];
    if (!token) {
      return res
        .status(403)
        .json({ message: "Unauthorized, JWT token is missing" });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    console.log(`[AUTH] Token verified for user: ${decoded.id}, role: ${decoded.role} at ${req.originalUrl}`);
    next()
  } catch (err) {
    console.log(`[AUTH] Token verification failed for ${req.originalUrl}: ${err.message}`);
    return res
      .status(403)
      .json({ message: "Unauthorized, JWT token is invalid or expired" });
  }
};

module.exports = Authenticated;
