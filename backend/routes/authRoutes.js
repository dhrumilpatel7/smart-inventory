const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const controller = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

// Slows down password guessing: max 30 login/register attempts per 15 minutes per IP.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many attempts. Please try again in a few minutes.' } },
});

router.post('/register', limiter, controller.register);
router.post('/login', limiter, controller.login);
router.get('/me', authenticate, controller.me);

module.exports = router;
