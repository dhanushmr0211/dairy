function createRateLimiter({ windowMs, maxRequests }) {
  const hits = new Map();

  return function rateLimiter(req, res, next) {
    const now = Date.now();
    const key = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const userHits = hits.get(key) || [];

    const recentHits = userHits.filter((time) => now - time < windowMs);

    if (recentHits.length >= maxRequests) {
      return res.status(429).json({
        message: 'Too many requests. Please try again later.',
      });
    }

    recentHits.push(now);
    hits.set(key, recentHits);
    next();
  };
}

const paymentRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 20,
});

module.exports = {
  paymentRateLimiter,
};
