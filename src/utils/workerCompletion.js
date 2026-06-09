const db = require('../db/connection');
const { QUEUE_STATUS, SEQ_STATUS } = require('../config/constants');

// These queue_status values mean "our worker successfully dispatched to Vonage"
const DISPATCHED_SET = new Set([QUEUE_STATUS.DISPATCHED]);

/**
 * Called by every channel worker after a send attempt completes (success or failure).
 *
 * Writes to:
 *   trigger_dispatch_log.queue_status  — DID OUR WORKER REACH VONAGE?
 *   trigger_summary                    — running counters (per-step, not per-employee)
 *   trigger_sequential_queue           — advance next step if applicable
 *
 * Does NOT touch delivery_status — that column is owned by logWriteWorker
 * and is updated only when Vonage status webhooks arrive.
 *
 * ── Sequential next-step scheduling ──────────────────────────────────────────
 * CURRENT BEHAVIOR (always-wait):
 *   Whether the current step succeeded OR failed, the next step is always
 *   scheduled with the full wait_minutes. Reasoning: the wait is a business
 *   rule ("give the person N minutes before escalating"), not a retry window.
 *
 * OPTION B (immediate on failure — uncomment the block below to switch):
 *   If the current step failed, the next step fires immediately (wait = 0).
 *   If it succeeded, the next step waits the normal wait_minutes.
 *   Use this when you want fastest possible escalation on channel failures.
 */
async function handleWorkerCompletion(job, queueStatus, messageId, providerResponse, errorMessage) {
    const { dispatch_log_id, sequential_queue_id, triggerId } = job.data;

    // ── Attempt tracking ───────────────────────────────────────────────────────
    const attemptNumber  = (job.attemptsMade || 0) + 1;
    const maxAttempts    = job.opts?.attempts ?? 1;
    const isFinalAttempt = attemptNumber >= maxAttempts;

    // During retry window keep queue_status=QUEUED so dashboards don't show
    // "dispatch failed" while BullMQ is still retrying the same job.
    const effectiveQueueStatus = (queueStatus === QUEUE_STATUS.DISPATCH_FAILED && !isFinalAttempt)
        ? QUEUE_STATUS.QUEUED
        : queueStatus;

    // ── 1. Update dispatch log (queue_status only — delivery_status set by logWriteWorker) ──
    if (dispatch_log_id) {
        await db.execute(
            `UPDATE trigger_dispatch_log 
             SET queue_status = ?, message_id = ?, provider_response = ?,
                 error_message = ?, sent_at = NOW(), attempt_count = ?
             WHERE id = ?`,
            [
                effectiveQueueStatus,
                messageId    || null,
                providerResponse ? JSON.stringify(providerResponse) : null,
                errorMessage || null,
                attemptNumber,
                dispatch_log_id,
            ]
        );
    }

    // ── 2. Advance sequential queue (only on final attempt) ───────────────────
    if (sequential_queue_id && isFinalAttempt) {
        const [currentRow] = await db.execute(
            `SELECT emp_id, trigger_id, seq_order, wait_minutes FROM trigger_sequential_queue WHERE id = ?`,
            [sequential_queue_id]
        );

        if (currentRow.length) {
            const { emp_id, trigger_id, seq_order, wait_minutes } = currentRow[0];

            const seqStatus = DISPATCHED_SET.has(queueStatus)
                ? SEQ_STATUS.COMPLETED
                : SEQ_STATUS.FAILED;

            // Mark current step as COMPLETED or FAILED
            await db.execute(
                `UPDATE trigger_sequential_queue 
                 SET status = ?, wait_until = DATE_ADD(NOW(), INTERVAL ? MINUTE) 
                 WHERE id = ?`,
                [seqStatus, wait_minutes, sequential_queue_id]
            );

            // ── Schedule next step ───────────────────────────────────────────
            // ALWAYS schedule the next step — whether this step succeeded or failed.
            // This fixes the bug where a failed step silently orphaned all remaining steps.
            //
            // CURRENT: always apply the full wait_minutes (success or failure).
            // The wait_minutes is a business rule ("escalate after N minutes"),
            // not a retry window — so it applies regardless of outcome.
            await db.execute(
                `UPDATE trigger_sequential_queue 
                 SET wait_until = DATE_ADD(NOW(), INTERVAL ? MINUTE)
                 WHERE emp_id = ? AND trigger_id = ? AND seq_order = ? AND status = ?`,
                [wait_minutes, emp_id, trigger_id, seq_order + 1, SEQ_STATUS.PENDING]
            );

            // ── OPTION B: immediate escalation on failure ────────────────────
            // Uncomment this block and remove the query above to use Option B.
            // On failure → next step fires immediately (wait_until = NOW())
            // On success → next step waits the normal wait_minutes
            //
            // const nextWait = DISPATCHED_SET.has(queueStatus) ? wait_minutes : 0;
            // await db.execute(
            //     `UPDATE trigger_sequential_queue 
            //      SET wait_until = DATE_ADD(NOW(), INTERVAL ? MINUTE)
            //      WHERE emp_id = ? AND trigger_id = ? AND seq_order = ? AND status = ?`,
            //     [nextWait, emp_id, trigger_id, seq_order + 1, SEQ_STATUS.PENDING]
            // );
        }
    }

    // ── 3. Update trigger_summary counters (only on final attempt) ────────────
    // These are per-dispatch-step counts:
    //   total_sent   = steps where our worker successfully reached Vonage
    //   total_failed = steps where all retries were exhausted (never reached Vonage)
    //
    // In sequential mode, one employee can appear in BOTH buckets
    // (e.g. WhatsApp failed → total_failed+1, SMS succeeded → total_sent+1).
    // That is correct — these count dispatch-steps, not employees.
    // Use trigger_response_log to count per-employee responses.
    if (triggerId && isFinalAttempt) {
        if (queueStatus === QUEUE_STATUS.DISPATCHED) {
            await db.execute(
                `UPDATE trigger_summary SET total_sent = total_sent + 1 WHERE trigger_id = ?`,
                [triggerId]
            );
        } else if (queueStatus === QUEUE_STATUS.DISPATCH_FAILED) {
            await db.execute(
                `UPDATE trigger_summary SET total_failed = total_failed + 1 WHERE trigger_id = ?`,
                [triggerId]
            );
        }

        // Mark ALL_IN trigger complete when every dispatch has a final outcome.
        // Sequential triggers (alert_type=2) are completed by checkSequentialCompletions()
        // in sequentialCron.js — not here.
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
