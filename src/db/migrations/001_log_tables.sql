-- ─────────────────────────────────────────────
-- alert-notification-ms log tables
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS log_trigger (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  trigger_id    VARCHAR(64)  NOT NULL,
  template_id   VARCHAR(64)  NOT NULL,
  employee_count INT          NOT NULL DEFAULT 0,
  status        VARCHAR(20)  NOT NULL DEFAULT 'dispatched',
  error_message TEXT         NULL,
  channel       VARCHAR(20)  NOT NULL DEFAULT 'system',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_trigger_id (trigger_id)
);

CREATE TABLE IF NOT EXISTS log_email (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  trigger_id    VARCHAR(64)  NOT NULL,
  emp_id        INT UNSIGNED NULL,
  status        VARCHAR(20)  NOT NULL,
  error_message TEXT         NULL,
  channel       VARCHAR(20)  NOT NULL DEFAULT 'email',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_trigger_id (trigger_id),
  INDEX idx_emp_id (emp_id)
);

CREATE TABLE IF NOT EXISTS log_sms (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  trigger_id    VARCHAR(64)  NOT NULL,
  emp_id        INT UNSIGNED NULL,
  status        VARCHAR(20)  NOT NULL,
  error_message TEXT         NULL,
  channel       VARCHAR(20)  NOT NULL DEFAULT 'sms',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_trigger_id (trigger_id),
  INDEX idx_emp_id (emp_id)
);

CREATE TABLE IF NOT EXISTS log_whatsapp (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  trigger_id    VARCHAR(64)  NOT NULL,
  emp_id        INT UNSIGNED NULL,
  status        VARCHAR(20)  NOT NULL,
  error_message TEXT         NULL,
  channel       VARCHAR(20)  NOT NULL DEFAULT 'whatsapp',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_trigger_id (trigger_id),
  INDEX idx_emp_id (emp_id)
);

CREATE TABLE IF NOT EXISTS log_voice (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  trigger_id    VARCHAR(64)  NOT NULL,
  emp_id        INT UNSIGNED NULL,
  status        VARCHAR(20)  NOT NULL,
  error_message TEXT         NULL,
  channel       VARCHAR(20)  NOT NULL DEFAULT 'voice',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_trigger_id (trigger_id),
  INDEX idx_emp_id (emp_id)
);

CREATE TABLE IF NOT EXISTS log_push (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  trigger_id    VARCHAR(64)  NOT NULL,
  emp_id        INT UNSIGNED NULL,
  status        VARCHAR(20)  NOT NULL,
  error_message TEXT         NULL,
  channel       VARCHAR(20)  NOT NULL DEFAULT 'push',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_trigger_id (trigger_id),
  INDEX idx_emp_id (emp_id)
);

CREATE TABLE IF NOT EXISTS log_response (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  trigger_id    VARCHAR(64)  NOT NULL,
  emp_id        INT UNSIGNED NULL,
  status        VARCHAR(20)  NOT NULL DEFAULT 'received',
  error_message TEXT         NULL,
  channel       VARCHAR(20)  NOT NULL,
  message_text  TEXT         NULL,
  sequential    TINYINT(1)   NOT NULL DEFAULT 0,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_trigger_id (trigger_id),
  INDEX idx_emp_id (emp_id)
);

CREATE TABLE IF NOT EXISTS log_failed (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  trigger_id    VARCHAR(64)  NOT NULL,
  emp_id        INT UNSIGNED NULL,
  channel       VARCHAR(20)  NOT NULL,
  error_message TEXT         NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_trigger_id (trigger_id)
);

-- Push token registry (one row per device per employee)
CREATE TABLE IF NOT EXISTS push_tokens (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  emp_id       INT UNSIGNED NOT NULL,
  device_token VARCHAR(512) NOT NULL,
  platform     ENUM('ios','android') NOT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_emp_token (emp_id, device_token),
  INDEX idx_emp_id (emp_id)
);
