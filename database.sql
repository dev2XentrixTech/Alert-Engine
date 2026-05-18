-- Logs Table
CREATE TABLE logs (
    id bigint unsigned auto_increment primary key,
    userId int unsigned default null,
    ip_address varchar(45) default null,       
    user_agent varchar(255) default null,       
    method varchar(7) default null,            
    endpoint varchar(255) default null,        
    req_obj JSON null,                         
    error_message TEXT NULL,                     
    error_stack TEXT NULL,                          
    response_time_ms INT NULL,
    response_status smallint unsigned default null,                 
    has_permission tinyint(1) default null, 
    permission_id tinyint unsigned default null,
    section_id tinyint unsigned default null,
    created_at timestamp default current_timestamp
);

--employee table
CREATE TABLE employee_master (
    id int unsigned NOT NULL AUTO_INCREMENT,
    created_by int unsigned DEFAULT NULL,
    updated_by int unsigned DEFAULT NULL,
    emp_id varchar(60) NOT NULL,
    first_name varchar(255) NOT NULL,
    last_name varchar(255) NOT NULL,
    full_name varchar(511) GENERATED ALWAYS AS (concat(first_name,' ',last_name)) STORED,
    designation varchar(255) DEFAULT NULL,
    ccg2_business_unit_id int unsigned DEFAULT NULL,
    cc_function_id int unsigned DEFAULT NULL,
    ccg1_domain_unit_id int unsigned DEFAULT NULL,
    country_id int unsigned DEFAULT NULL,
    city_id int unsigned DEFAULT NULL,
    site_id int unsigned DEFAULT NULL,
    reporting_manager_id int unsigned DEFAULT NULL,
    official_email_id varchar(254) NOT NULL,
    personal_email_id varchar(254) DEFAULT NULL, 
    emergency_email_id varchar(254) DEFAULT NULL,  
    user_type_id INT UNSIGNED NOT NULL DEFAULT 3,
    official_contact_no varchar(20) NOT NULL, 
    official_contact_cc varchar(5) NOT NULL, 
    personal_contact_no varchar(20) DEFAULT NULL,           
    personal_contact_cc varchar(5) DEFAULT NULL, 
    emergency_contact_no varchar(20) DEFAULT NULL,  
    emergency_contact_cc varchar(5) DEFAULT NULL,      
    residential_address text,   
    blood_group_id int unsigned DEFAULT NULL,
    login_status tinyint(1) DEFAULT 0,
    working_status_id int unsigned DEFAULT NULL,
    img_src varchar(500) DEFAULT NULL,
    is_verified tinyint(1) DEFAULT 0,
    failed_attempts tinyint unsigned DEFAULT 0,
    locked_until datetime DEFAULT NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY emp_id (emp_id),
    UNIQUE KEY username (username),
    KEY idx_full_name (full_name),
    KEY idx_designation (designation)
);

-- User type master
CREATE TABLE user_type_master (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    created_by INT UNSIGNED DEFAULT NULL,
    updated_by INT UNSIGNED DEFAULT NULL,
    ut_code VARCHAR(50) NOT NULL,
    ut_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY ut_code (ut_code),
    UNIQUE KEY ut_name (ut_name)
);

-- Blood Group Master Table
CREATE TABLE blood_group_master (
    id int unsigned NOT NULL AUTO_INCREMENT,
    bg_code varchar(50) NOT NULL,
    bg_name varchar(50) NOT NULL,
    created_by int unsigned DEFAULT NULL,
    updated_by int unsigned DEFAULT NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY bg_code (bg_code)
);

-- Working Status Master Table
CREATE TABLE working_status_master (
    id int unsigned NOT NULL AUTO_INCREMENT,
    ws_code varchar(50) NOT NULL,
    ws_name varchar(50) NOT NULL,
    created_by int unsigned DEFAULT NULL,
    updated_by int unsigned DEFAULT NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY ws_code (ws_code)
);

-- Country Master Table
CREATE TABLE country_master (
    id int unsigned NOT NULL AUTO_INCREMENT,
    country_code varchar(50) NOT NULL,
    country_name varchar(50) NOT NULL,
    created_by int unsigned DEFAULT NULL,
    updated_by int unsigned DEFAULT NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY country_code (country_code)
);

-- City Master Table
CREATE TABLE city_master (
    id int unsigned NOT NULL AUTO_INCREMENT,
    city_code varchar(50) NOT NULL,
    city_name varchar(255) NOT NULL,
    created_by int unsigned DEFAULT NULL,
    updated_by int unsigned DEFAULT NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY city_code (city_code)
);

-- Domain Master Table
CREATE TABLE domain_master (
    id int unsigned NOT NULL AUTO_INCREMENT,
    domain_code varchar(50) NOT NULL,
    domain_name varchar(255) NOT NULL,
    created_by int unsigned DEFAULT NULL,
    updated_by int unsigned DEFAULT NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY domain_code (domain_code)
);

-- Department Master Table
CREATE TABLE department_master (
    id int unsigned NOT NULL AUTO_INCREMENT,
    dept_code varchar(50) NOT NULL,
    dept_name varchar(255) NOT NULL,
    domain_id int unsigned NOT NULL,
    created_by int unsigned DEFAULT NULL,
    updated_by int unsigned DEFAULT NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY dept_code (dept_code)
);

-- Business Unit Master Table
CREATE TABLE business_unit_master (
    id int unsigned NOT NULL AUTO_INCREMENT,
    unit_code varchar(50) NOT NULL,
    unit_name varchar(255) NOT NULL,
    created_by int unsigned DEFAULT NULL,
    updated_by int unsigned DEFAULT NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY unit_code (unit_code)
);

-- Site Master Table
CREATE TABLE site_master (
    id int unsigned NOT NULL AUTO_INCREMENT,
    city_id int unsigned NOT NULL,
    site_code varchar(10) NOT NULL,
    site_name varchar(255) NOT NULL UNIQUE,
    primary_address text NOT NULL,
    secondary_address text,
    pin_code varchar(10) NOT NULL,
    created_by int unsigned DEFAULT NULL,
    updated_by int unsigned DEFAULT NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
);

-- Support Master Table
CREATE TABLE support_master (
    id int unsigned NOT NULL AUTO_INCREMENT,
    name varchar(255) NOT NULL UNIQUE,
    email_id varchar(254) NOT NULL UNIQUE,
    designation varchar(100) NOT NULL,
    contact_number varchar(20) NOT NULL UNIQUE,
    type tinyint unsigned NOT NULL,
    created_by int unsigned DEFAULT NULL,
    updated_by int unsigned DEFAULT NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
);

-- Company Master
CREATE TABLE company_master (
    id int unsigned NOT NULL AUTO_INCREMENT,
    entity_name varchar(255) DEFAULT NULL,
    primary_address text,
    secondary_address text,
    country varchar(100) DEFAULT NULL,
    city varchar(100) DEFAULT NULL,
    pin varchar(20) DEFAULT NULL,
    phone_number varchar(20) DEFAULT NULL,
    email_id varchar(254) DEFAULT NULL,
    configured_email_id varchar(254) DEFAULT NULL,
    fax varchar(50) DEFAULT NULL,
    configured_contact_number varchar(20) DEFAULT NULL,
    license_number varchar(100) DEFAULT NULL,
    license_date date DEFAULT NULL,
    mail_server varchar(255) DEFAULT NULL,
    mail_port int DEFAULT NULL,
    sms_id varchar(100) DEFAULT NULL,   
    company_logo varchar(500) DEFAULT NULL,
    created_by int unsigned DEFAULT NULL,
    updated_by int unsigned DEFAULT NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
);

CREATE TABLE faq_master (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    created_by INT UNSIGNED NOT NULL,
    updated_by INT UNSIGNED NOT NULL DEFAULT 0,
    question varchar(1000) NOT NULL,
    answer varchar(1000) NOT NULL,
    status TINYINT UNSIGNED DEFAULT 1,
    attachment VARCHAR(500) DEFAULT NULL,
    link VARCHAR(500) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_question (question)
);


-- Group Table
CREATE TABLE manage_group (
    id int unsigned NOT NULL AUTO_INCREMENT,
    -- grp_code varchar(50) NOT NULL,
    grp_name varchar(255) NOT NULL,
    grp_type tinyint unsigned NOT NULL COMMENT '1=manual,2=logic',
    emp_ids text DEFAULT NULL,
    country_id int unsigned DEFAULT NULL,
    city_id int unsigned DEFAULT NULL,
    site_id int unsigned DEFAULT NULL,
    department_id int unsigned DEFAULT NULL,
    business_unit_id  int unsigned DEFAULT NULL,
    domain_id int unsigned DEFAULT NULL,
    working_status_id int unsigned DEFAULT NULL,
    user_type_id int unsigned DEFAULT NULL,
    blood_group_id int unsigned DEFAULT NULL,
    grp_ids text DEFAULT NULL,
    created_by int unsigned DEFAULT NULL,
    updated_by int unsigned DEFAULT NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY grp_code (grp_code)
);

CREATE TABLE alert_template (
    id int unsigned NOT NULL AUTO_INCREMENT,
    template_name varchar(255) NOT NULL,
    grp_ids text DEFAULT NULL,
    emp_ids text DEFAULT NULL,
    remarks text DEFAULT NULL,
    alert_flow_type tinyint unsigned NOT NULL,
    device_triggers JSON NOT NULL,
    alert_type tinyint unsigned NOT NULL,
    num_options tinyint unsigned DEFAULT NULL,
    option_1_text varchar(500) DEFAULT NULL,
    option_2_text varchar(500) DEFAULT NULL,
    option_3_text varchar(500) DEFAULT NULL,
    app_push_msg text DEFAULT NULL,
    voice_call_text text DEFAULT NULL,
    voice_call_audio varchar(500) DEFAULT NULL,
    sms_text text DEFAULT NULL,
    email_subject varchar(255) DEFAULT NULL,
    email_body text DEFAULT NULL,
    whatsapp_text text DEFAULT NULL,
    created_by int unsigned DEFAULT NULL,
    updated_by int unsigned DEFAULT NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY template_name (template_name)
);

-- Trigger Contact Review Table
CREATE TABLE trigger_contact_review (
    id int unsigned NOT NULL AUTO_INCREMENT,
    review_name varchar(255) NOT NULL,
    grp_ids text DEFAULT NULL,
    emp_ids text DEFAULT NULL,
    trigger_type tinyint unsigned NOT NULL,
    complete_within smallint unsigned NOT NULL,
    interval_type tinyint unsigned DEFAULT NULL,
    reminder_days int unsigned DEFAULT NULL,
    escalation_days int unsigned DEFAULT NULL,
    trigger_day tinyint DEFAULT NULL,
    trigger_date datetime DEFAULT NULL,
    first_trigger_date datetime DEFAULT NULL,
    next_reminder_date datetime DEFAULT NULL,
    next_escalation_date datetime DEFAULT NULL,
    last_triggered_date datetime DEFAULT NULL,
    created_by int unsigned DEFAULT NULL,
    updated_by int unsigned DEFAULT NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
);


CREATE TABLE contact_review_triggered (
    id int unsigned NOT NULL AUTO_INCREMENT,
    trigger_contact_review_id int unsigned NOT NULL,
    created_by int unsigned DEFAULT NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
);

CREATE TABLE contact_review_triggered_log (
    id int unsigned NOT NULL AUTO_INCREMENT,
    contact_review_triggered_id int unsigned NOT NULL,
    trigger_contact_review_id int unsigned NOT NULL,
    emp_id int unsigned NOT NULL,
    subject varchar(255) not null,
    status tinyint not null,
    is_updated tinyint DEFAULT 0,
    details_updated_at datetime DEFAULT NULL,
    is_confirmed tinyint DEFAULT 0,
    confirmed_at datetime DEFAULT NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
);

CREATE TABLE trigger_table (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    template_id INT UNSIGNED Default NULL,
    trigger_detail JSON NOT NULL,
    created_by INT UNSIGNED DEFAULT NULL,
    trigger_type tinyint unsigned default 1 COMMENT '1=general trigger,2=temporary trigger',
    status tinyint default 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
);

CREATE TABLE import_logs (
    id int unsigned auto_increment primary key,
    job_id int unsigned not null,
    created_by int unsigned not null,
    file_path varchar(500) not null,
    current_status tinyint not null,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE trigger_dispatch_log (
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
);

CREATE TABLE trigger_summary (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    trigger_id INT UNSIGNED NOT NULL,
    total_employees SMALLINT UNSIGNED DEFAULT 0,
    total_dispatches INT UNSIGNED DEFAULT 0,
    total_sent INT UNSIGNED DEFAULT 0,
    total_failed INT UNSIGNED DEFAULT 0,
    channels_used VARCHAR(50) DEFAULT NULL COMMENT 'csv of channel IDs e.g. 1,2,4',
    alert_type TINYINT UNSIGNED NOT NULL,
    resolved_at DATETIME DEFAULT NULL,
    completed_at DATETIME DEFAULT NULL,
    duration_seconds INT UNSIGNED DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_trigger (trigger_id)
);

CREATE TABLE trigger_sequential_queue (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    trigger_id INT UNSIGNED NOT NULL,
    emp_id INT UNSIGNED NOT NULL,
    channel TINYINT UNSIGNED NOT NULL,
    contact_type TINYINT UNSIGNED NOT NULL,
    seq_order TINYINT UNSIGNED NOT NULL,
    wait_minutes INT UNSIGNED DEFAULT 0,
    status TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '1=pending,2=dispatched,3=completed,4=failed',
    dispatch_log_id BIGINT UNSIGNED DEFAULT NULL,
    wait_until DATETIME DEFAULT NULL,
    dispatched_at DATETIME DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_pending (status, wait_until),
    INDEX idx_trigger_emp (trigger_id, emp_id)
);

CREATE TABLE app_notification (
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
);