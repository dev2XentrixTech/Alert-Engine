const db = require('./src/db/connection');

async function migrate() {
  try {
    console.log('Running migrations...');

    await db.query(`
      CREATE TABLE IF NOT EXISTS trigger_dispatch_log (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          trigger_id INT UNSIGNED NOT NULL,
          emp_id INT UNSIGNED NOT NULL,
          channel TINYINT UNSIGNED NOT NULL COMMENT '1=email,2=sms,3=whatsapp,4=voice,5=app',
          contact_type TINYINT UNSIGNED NOT NULL COMMENT '1=official,2=personal,3=emergency',
          contact_value VARCHAR(254) DEFAULT NULL,
          status TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '1=queued,2=sent,3=failed',
          message_id VARCHAR(255) DEFAULT NULL,
          provider_response TEXT DEFAULT NULL,
          error_message TEXT DEFAULT NULL,
          attempt_count TINYINT UNSIGNED DEFAULT 1,
          queued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          sent_at DATETIME DEFAULT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          INDEX idx_trigger (trigger_id),
          INDEX idx_trigger_channel (trigger_id, channel),
          INDEX idx_status (status)
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS trigger_summary (
          id INT UNSIGNED NOT NULL AUTO_INCREMENT,
          trigger_id INT UNSIGNED NOT NULL,
          total_employees SMALLINT UNSIGNED DEFAULT 0,
          total_dispatches INT UNSIGNED DEFAULT 0,
          total_sent INT UNSIGNED DEFAULT 0,
          total_failed INT UNSIGNED DEFAULT 0,
          channels_used VARCHAR(50) DEFAULT NULL,
          alert_type TINYINT UNSIGNED NOT NULL,
          resolved_at DATETIME DEFAULT NULL,
          completed_at DATETIME DEFAULT NULL,
          duration_seconds INT UNSIGNED DEFAULT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uk_trigger (trigger_id)
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS trigger_sequential_queue (
          id INT UNSIGNED NOT NULL AUTO_INCREMENT,
          trigger_id INT UNSIGNED NOT NULL,
          emp_id INT UNSIGNED NOT NULL,
          channel TINYINT UNSIGNED NOT NULL,
          contact_type TINYINT UNSIGNED NOT NULL,
          seq_order TINYINT UNSIGNED NOT NULL,
          wait_minutes INT UNSIGNED DEFAULT 0,
          status TINYINT UNSIGNED NOT NULL DEFAULT 1,
          dispatch_log_id BIGINT UNSIGNED DEFAULT NULL,
          wait_until DATETIME DEFAULT NULL,
          dispatched_at DATETIME DEFAULT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          INDEX idx_pending (status, wait_until),
          INDEX idx_trigger_emp (trigger_id, emp_id)
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS app_notification (
          id INT UNSIGNED NOT NULL AUTO_INCREMENT,
          trigger_id INT UNSIGNED NOT NULL,
          emp_id INT UNSIGNED NOT NULL,
          title VARCHAR(255) DEFAULT NULL,
          message TEXT DEFAULT NULL,
          dispatch_log_id BIGINT UNSIGNED DEFAULT NULL,
          is_read TINYINT(1) DEFAULT 0,
          read_at DATETIME DEFAULT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          INDEX idx_emp (emp_id, is_read)
      )
    `);

    console.log('Migrations completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();
