const asyncHandler = require('../utils/asyncHandler');
const authService = require('../services/authService');

// POST /api/auth/register  - creates a "staff" account and logs it in.
exports.register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body || {};
  const user = await authService.register({ name, email, password });
  res.status(201).json({ token: authService.signToken(user), user: user.toSafeJSON() });
});

// POST /api/auth/login
exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  const user = await authService.login({ email, password });
  res.json({ token: authService.signToken(user), user: user.toSafeJSON() });
});

// GET /api/auth/me
exports.me = asyncHandler(async (req, res) => {
  res.json({ user: req.user.toSafeJSON() });
});
