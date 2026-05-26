const db = require('../db/connection');
const { DISPATCH_STATUS, SEQ_STATUS } = require('../config/constants');

async function handleWorkerCompletion(job, status, messageId, providerResponse, errorMessage) {
    const { dispatch_log_id, sequential_queue_id } = job.data;
    
    if (dispatch_log_id) {
        await db.execute(
            `UPDATE trigger_dispatch_log 
             SET status = ?, message_id = ?, provider_response = ?, error_message = ?, sent_at = NOW() 
             WHERE id = ?`,
            [status, messageId || null, providerResponse ? JSON.stringify(providerResponse) : null, errorMessage || null, dispatch_log_id]
        );
    }
    
    if (sequential_queue_id) {
        const [currentRow] = await db.execute(`SELECT emp_id, trigger_id, seq_order, wait_minutes FROM trigger_sequential_queue WHERE id = ?`, [sequential_queue_id]);
        if (currentRow.length) {
            const { emp_id, trigger_id, seq_order, wait_minutes } = currentRow[0];
            
            // 1. Mark this step as completed/failed and set its wait_until to mark when its wait period ends
            const seqStatus = status === DISPATCH_STATUS.SENT || status === DISPATCH_STATUS.DELIVERED ? SEQ_STATUS.COMPLETED : SEQ_STATUS.FAILED;
            await db.execute(
                `UPDATE trigger_sequential_queue 
                 SET status = ?, wait_until = DATE_ADD(NOW(), INTERVAL ? MINUTE) 
                 WHERE id = ?`,
                [seqStatus, wait_minutes, sequential_queue_id]
            );

            // 2. Schedule the next step to start exactly after THIS step's wait_minutes expires
            const nextSeq = seq_order + 1;
            await db.execute(
                `UPDATE trigger_sequential_queue 
                 SET wait_until = DATE_ADD(NOW(), INTERVAL ? MINUTE) 
                 WHERE emp_id = ? AND trigger_id = ? AND seq_order = ? AND status = ?`,
                [wait_minutes, emp_id, trigger_id, nextSeq, SEQ_STATUS.PENDING]
            );
        }
    }
    
    const { triggerId } = job.data;
    if (triggerId) {
        if (status === DISPATCH_STATUS.SENT || status === DISPATCH_STATUS.DELIVERED) {
            await db.execute(`UPDATE trigger_summary SET total_sent = total_sent + 1 WHERE trigger_id = ?`, [triggerId]);
        } else if (status === DISPATCH_STATUS.FAILED) {
            await db.execute(`UPDATE trigger_summary SET total_failed = total_failed + 1 WHERE trigger_id = ?`, [triggerId]);
        }
        
        await db.execute(`
            UPDATE trigger_summary 
            SET completed_at = NOW(),
                duration_seconds = TIMESTAMPDIFF(SECOND, resolved_at, NOW())
            WHERE trigger_id = ? 
              AND alert_type = 1 
              AND (total_sent + total_failed) >= total_dispatches 
              AND completed_at IS NULL
        `, [triggerId]);
    }
}

module.exports = { handleWorkerCompletion };
