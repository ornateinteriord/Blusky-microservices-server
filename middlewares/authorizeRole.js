const authorizeRoles = (...allowedRoles) => {
  // Flatten in case an array was passed as the first argument
  const roles = allowedRoles.flat();

  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      console.log(`[AUTH] Access denied for role: ${req.user?.role}. Allowed: ${roles}`);
      return res.status(403).json({ message: "Access denied" });
    }
    next();
  };
};

module.exports = authorizeRoles;
