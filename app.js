const express         = require('express');
const webhookRoutes   = require('./src/routes/webhookRoutes');
const voiceWebhooks   = require('./src/routes/voiceWebhookRoutes');
const healthRoute     = require('./src/routes/healthRoute');
const analyticsRoutes = require('./src/routes/analyticsRoutes');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false })); // needed for Vonage voice event webhooks

app.use(webhookRoutes);
app.use(voiceWebhooks);
app.use('/health', healthRoute);
app.use(analyticsRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

module.exports = app;
