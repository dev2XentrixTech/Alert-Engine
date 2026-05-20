const db = require('./src/db/connection');

async function createTable() {
    try {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS trigger_response_log (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                trigger_id INT UNSIGNED NOT NULL,
                emp_id INT UNSIGNED NOT NULL,
                channel TINYINT UNSIGNED NOT NULL COMMENT '1=email,2=sms,3=whatsapp,4=voice,5=app',
                contact_value VARCHAR(254) DEFAULT NULL,
                selected_option TINYINT UNSIGNED DEFAULT NULL,
                response_raw TEXT DEFAULT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                INDEX idx_trigger_emp (trigger_id, emp_id)
            )
        `);
        console.log("Table trigger_response_log created successfully.");
        process.exit(0);
    } catch (err) {
        console.error("Error creating table:", err);
        process.exit(1);
    }
}

createTable();
