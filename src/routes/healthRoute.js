const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { redisConnection } = require('../queues/redisConnection');

router.get('/', async (req, res) => {
    const health = {
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        services: {
            mysql: { status: 'down', latency_ms: 0 },
            redis: { status: 'down', latency_ms: 0 }
        },
        memory: process.memoryUsage()
    };

    try {
        const startMysql = Date.now();
        await db.query('SELECT 1');
        health.services.mysql = { status: 'up', latency_ms: Date.now() - startMysql };
    } catch (e) {
        health.status = 'unhealthy';
    }

    try {
        const startRedis = Date.now();
        await redisConnection.ping();
        health.services.redis = { status: 'up', latency_ms: Date.now() - startRedis };
    } catch (e) {
        health.status = 'unhealthy';
    }

    res.status(health.status === 'healthy' ? 200 : 503).json(health);
});

module.exports = router;
