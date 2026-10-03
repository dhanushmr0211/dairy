const rateLimit = require('express-rate-limit');

const paymentRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    message: 'Too many requests. Please try again later.',
  },
});

module.exports = {
  paymentRateLimiter,
};
