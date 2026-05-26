/**
 * PM2 Ecosystem Configuration
 *
 * Usage:
 *   pm2 start ecosystem.config.js          # Start all three services
 *   pm2 start ecosystem.config.js --only alert-api    # Start just the API
 *   pm2 restart all                        # Zero-downtime restart
 *   pm2 stop all                           # Stop everything
 *   pm2 logs                               # Tail all logs
 *   pm2 logs alert-api                     # Tail only API logs
 *   pm2 monit                              # Real-time dashboard
 *   pm2 save                               # Save process list for auto-restart on reboot
 *   pm2 startup                            # Generate system startup script
 *   pm2 delete all                         # Remove all from PM2
 */
module.exports = {
  apps: [
    // ─── API Server ─────────────────────────────────────────────────────────
    // Handles HTTP requests: webhooks, analytics, health checks.
    // Runs in cluster mode for multi-core scaling.
    {
      name:          'alert-api',
      script:        'server-api.js',
      instances:     1,          // one process per CPU core
      exec_mode:     'fork',      // cluster mode for load balancing
      watch:         false,          // never watch in prod


      max_memory_restart: '350M',    // auto-restart if memory leaks
      max_restarts:       10,       // stop hammering if crashing repeatedly
      min_uptime:         5000,     // must stay up 5s to count as successful
      restart_delay:      3000,

      env: {
        NODE_ENV: 'production',
        PORT:     4000,
      },

      // Graceful shutdown: PM2 sends SIGINT, our handler runs server.close()
      kill_timeout:       5000,      // wait 5s for graceful shutdown
      listen_timeout:     3000,      // wait 3s for 'listening' event on restart
      shutdown_with_message: false,

      // ── Logs ─────────────────────────────────────────────────────────────
      out_file:        '/var/log/pm2/alert-api-out.log',
      error_file:      '/var/log/pm2/alert-api-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs:      true,
    },

    // ─── Worker Process ─────────────────────────────────────────────────────
    // Processes BullMQ jobs: email, SMS, WhatsApp, voice dispatch.
    // Must be FORK mode (not cluster) — BullMQ workers manage their own concurrency.
    // Scaling: increase instances to run parallel worker processes.
    {
      name:          'alert-worker',
      script:        'server-worker.js',
      instances:     1,              // start with 1, scale up if queues back up
      exec_mode:     'fork',
      watch:         false,

      max_memory_restart: '280M',
      max_restarts:       10,
      min_uptime:         5000,
      restart_delay:      5000,     // slightly longer — jobs need time to settle
      
      env: {
        NODE_ENV: 'production',
      },
      kill_timeout:  10000,          // 10s for in-flight jobs to drain

      // ── Logs ─────────────────────────────────────────────────────────────
      out_file:        '/var/log/pm2/alert-worker-out.log',
      error_file:      '/var/log/pm2/alert-worker-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs:      true,
    },

    // ─── Cron Scheduler ─────────────────────────────────────────────────────
    // Polls trigger_table and sequential queue.
    // MUST always be 1 instance — multiple instances = duplicate dispatches.
    {
      name:          'alert-cron',
      script:        'server-cron.js',
      instances:     1,             
      exec_mode:     'fork',
      watch:         false,

      max_memory_restart: '150M',   // cron is lightweight, 150M is generous
      max_restarts:       10,
      min_uptime:         5000,
      restart_delay:      3000,

      env: {
        NODE_ENV: 'production',
      },
      // Cron is stateless — fast shutdown is fine
       kill_timeout:       3000,     // stateless — fast shutdown is safe

      // ── Logs ─────────────────────────────────────────────────────────────
      out_file:        '/var/log/pm2/alert-cron-out.log',
      error_file:      '/var/log/pm2/alert-cron-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs:      true,
    },
  ],
};
