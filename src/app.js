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
const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
  : '*';

app.use(express.json());
app.use(cors({ origin: corsOrigin }));
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
