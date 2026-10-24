const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const assistantService = require('../services/assistantService');

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'You have sent several messages. Please wait a minute and try again.' } },
});

router.get('/status', (req, res) => {
  res.json({ configured: assistantService.isConfigured(), model: assistantService.modelName() });
});

router.post('/chat', chatLimiter, asyncHandler(async (req, res) => {
  const { message, history = [] } = req.body || {};
  if (typeof message !== 'string' || !message.trim()) throw ApiError.badRequest('Enter a message to chat with the Inventory Copilot.');
  if (message.length > 1200) throw ApiError.badRequest('Messages must be 1,200 characters or fewer.');
  if (!Array.isArray(history)) throw ApiError.badRequest('Conversation history must be a list of messages.');

  const answer = await assistantService.reply({ message: message.trim(), history });
  res.json({ answer });
}));

module.exports = router;
