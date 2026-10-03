const express = require('express');
const farmerRoutes = require('./routes/farmerRoutes');
const cycleRoutes = require('./routes/cycleRoutes');
const milkRoutes = require('./routes/milkRoutes');
const feedRoutes = require('./routes/feedRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/farmers', farmerRoutes);
app.use('/cycles', cycleRoutes);
app.use('/milk', milkRoutes);
app.use('/feed', feedRoutes);
app.use('/payments', paymentRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
