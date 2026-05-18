const express      = require('express');
const webhookRoutes = require('./src/routes/webhookRoutes');
const healthRoute = require('./src/routes/healthRoute');

const app = express();

app.use(express.json());
app.use(webhookRoutes);
app.use('/health', healthRoute);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

module.exports = app;
