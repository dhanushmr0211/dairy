const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const farmerRoutes = require('./routes/farmerRoutes');
const cycleRoutes = require('./routes/cycleRoutes');
const milkRoutes = require('./routes/milkRoutes');
const feedRoutes = require('./routes/feedRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');

const { globalRateLimiter } = require('./middleware/rateLimiter');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

// Security headers with Helmet
app.use(helmet());

// CORS configuration (supports comma-separated origins, wildcard, and trims trailing slashes)
const rawOrigins = process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:5173';
const allowedOrigins = rawOrigins
  .split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    const normalizedOrigin = origin.replace(/\/+$/, '');
    if (allowedOrigins.includes('*') || allowedOrigins.includes(normalizedOrigin)) {
      return callback(null, true);
    }
    return callback(new Error('Origin not allowed by CORS policy.'));
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(morgan('combined'));
app.use(globalRateLimiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Main API routes
app.use('/farmers', farmerRoutes);
app.use('/cycles', cycleRoutes);
app.use('/milk', milkRoutes);
app.use('/feed', feedRoutes);
app.use('/payments', paymentRoutes);
app.use('/dashboard', dashboardRoutes);

// Centralized error handling
app.use(notFound);
app.use(errorHandler);

module.exports = app;
