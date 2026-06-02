const db = require('../db/connection');
const { DISPATCH_STATUS, SEQ_STATUS } = require('../config/constants');

async function handleWorkerCompletion(job, status, messageId, providerResponse, errorMessage) {
    const { dispatch_log_id, sequential_queue_id, triggerId } = job.data;

    // ── Attempt tracking ───────────────────────────────────────────────────────
    // job.attemptsMade = how many attempts ran BEFORE this one (0 on first run).
    // job.opts.attempts = max attempts from retryPolicy (e.g. 2).
    const attemptNumber  = (job.attemptsMade || 0) + 1;
    const maxAttempts    = job.opts?.attempts ?? 1;
    const isFinalAttempt = attemptNumber >= maxAttempts;

    // For a FAILED attempt that still has retries left, keep status as QUEUED
    // so analytics don't show the row as permanently failed during the retry window.
    // Only flip to FAILED on the last attempt when BullMQ will not retry further.
    const effectiveStatus = (status === DISPATCH_STATUS.FAILED && !isFinalAttempt)
        ? DISPATCH_STATUS.QUEUED
        : status;

    // ── 1. Update dispatch log ─────────────────────────────────────────────────
    if (dispatch_log_id) {
        await db.execute(
            `UPDATE trigger_dispatch_log 
             SET status = ?, message_id = ?, provider_response = ?,
                 error_message = ?, sent_at = NOW(), attempt_count = ?
             WHERE id = ?`,
            [
                effectiveStatus,
                messageId    || null,
                providerResponse ? JSON.stringify(providerResponse) : null,
                errorMessage || null,
                attemptNumber,
                dispatch_log_id,
            ]
        );
    }

    // ── 2. Advance sequential queue (only on final outcome) ───────────────────
    // Do not advance the sequence on intermediate failures — BullMQ will retry
    // the same step. Only mark COMPLETED/FAILED once the attempt is definitively done.
    if (sequential_queue_id && isFinalAttempt) {
        const [currentRow] = await db.execute(
            `SELECT emp_id, trigger_id, seq_order, wait_minutes FROM trigger_sequential_queue WHERE id = ?`,
            [sequential_queue_id]
        );
        if (currentRow.length) {
            const { emp_id, trigger_id, seq_order, wait_minutes } = currentRow[0];

            const seqStatus = (status === DISPATCH_STATUS.SENT || status === DISPATCH_STATUS.DELIVERED)
                ? SEQ_STATUS.COMPLETED
                : SEQ_STATUS.FAILED;

            await db.execute(
                `UPDATE trigger_sequential_queue 
                 SET status = ?, wait_until = DATE_ADD(NOW(), INTERVAL ? MINUTE) 
                 WHERE id = ?`,
                [seqStatus, wait_minutes, sequential_queue_id]
            );

            // Schedule the next step only if this step succeeded
            if (seqStatus === SEQ_STATUS.COMPLETED) {
                await db.execute(
                    `UPDATE trigger_sequential_queue 
                     SET wait_until = DATE_ADD(NOW(), INTERVAL ? MINUTE)
                     WHERE emp_id = ? AND trigger_id = ? AND seq_order = ? AND status = ?`,
                    [wait_minutes, emp_id, trigger_id, seq_order + 1, SEQ_STATUS.PENDING]
                );
            }
        }
    }

    // ── 3. Update trigger_summary counters (only on final outcome) ────────────
    // Bug without this guard: with attempts=2, a job that fails twice would
    // increment total_failed on attempt-1 AND attempt-2, making the sum
    // exceed total_dispatches and incorrectly mark the trigger completed early.
    if (triggerId && isFinalAttempt) {
        if (status === DISPATCH_STATUS.SENT || status === DISPATCH_STATUS.DELIVERED) {
            await db.execute(
                `UPDATE trigger_summary SET total_sent = total_sent + 1 WHERE trigger_id = ?`,
                [triggerId]
            );
        } else if (status === DISPATCH_STATUS.FAILED) {
            await db.execute(
                `UPDATE trigger_summary SET total_failed = total_failed + 1 WHERE trigger_id = ?`,
                [triggerId]
            );
        }

        // Mark ALL_IN trigger complete when every dispatch has a final outcome
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
