const express = require('express');
const cors = require('cors');
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
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin && origin !== '*');
const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Origin not allowed by CORS policy.'));
  },
};

app.use(express.json());
app.use(cors(corsOptions));
app.use(morgan('combined'));
app.use(globalRateLimiter);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/farmers', farmerRoutes);
app.use('/cycles', cycleRoutes);
app.use('/milk', milkRoutes);
app.use('/feed', feedRoutes);
app.use('/payments', paymentRoutes);
app.use('/dashboard', dashboardRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
