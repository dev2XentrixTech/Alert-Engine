const { Router } = require('express');
const db = require('../db/connection');

const router = Router();

// ─── helpers ────────────────────────────────────────────────────────────────

const CHANNEL_LABEL  = { 1: 'email', 2: 'sms', 3: 'whatsapp', 4: 'voice_call', 5: 'app' };
const CONTACT_LABEL  = { 1: 'official', 2: 'personal', 3: 'emergency' };
const STATUS_LABEL   = { 1: 'queued', 2: 'sent', 3: 'failed' };
const FLOW_LABEL     = { 1: 'all_in', 2: 'sequential' };
const ALERT_LABEL    = { 1: 'one_way', 2: 'two_way' };

function paginate(query, page, limit) {
    const offset = (page - 1) * limit;
    return `${query} LIMIT ${limit} OFFSET ${offset}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/analytics/triggers
// List all triggers with high-level summary stats.
// Query params: page, limit, status (1-4), alert_type (1/2), alert_flow_type (1/2)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/api/analytics/triggers', async (req, res) => {
    try {
        const page  = Math.max(1, parseInt(req.query.page)  || 1);
        const limit = Math.min(100, parseInt(req.query.limit) || 20);

        const filters = [];
        const params  = [];

        if (req.query.status) {
            filters.push('tt.status = ?');
            params.push(parseInt(req.query.status));
        }

        const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

        const [[{ total }]] = await db.execute(
            `SELECT COUNT(*) as total FROM trigger_table tt ${whereClause}`, params
        );

        const [rows] = await db.execute(
            paginate(`
                SELECT
                    tt.id             AS trigger_id,
                    tt.status         AS trigger_status,
                    tt.trigger_type,
                    tt.created_at,
                    tt.updated_at,

                    ts.total_employees,
                    ts.total_dispatches,
                    ts.total_sent,
                    ts.total_failed,
                    ts.channels_used,
                    ts.alert_type,
                    ts.resolved_at,
                    ts.completed_at,
                    ts.duration_seconds,

                    JSON_UNQUOTE(JSON_EXTRACT(tt.trigger_detail, '$.template_name')) AS template_name,
                    JSON_UNQUOTE(JSON_EXTRACT(tt.trigger_detail, '$.alert_flow_type')) AS alert_flow_type

                FROM trigger_table tt
                LEFT JOIN trigger_summary ts ON ts.trigger_id = tt.id
                ${whereClause}
                ORDER BY tt.created_at DESC
            `, page, limit),
            params
        );

        const data = rows.map(r => ({
            ...r,
            alert_type_label:      ALERT_LABEL[r.alert_type]      || null,
            alert_flow_type_label: FLOW_LABEL[parseInt(r.alert_flow_type)] || null,
            channels_used:         r.channels_used
                ? r.channels_used.split(',').map(id => ({ id: parseInt(id), label: CHANNEL_LABEL[parseInt(id)] }))
                : [],
        }));

        res.json({ total, page, limit, pages: Math.ceil(total / limit), data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/analytics/triggers/:id
// Full detail for one trigger: summary + per-employee dispatch breakdown.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/api/analytics/triggers/:id', async (req, res) => {
    try {
        const triggerId = parseInt(req.params.id);

        // Trigger + summary
        const [[trigger]] = await db.execute(`
            SELECT
                tt.id, tt.template_id, tt.trigger_detail, tt.status,
                tt.trigger_type, tt.created_by, tt.created_at, tt.updated_at,
                ts.total_employees, ts.total_dispatches,
                ts.total_sent, ts.total_failed,
                ts.channels_used, ts.alert_type,
                ts.resolved_at, ts.completed_at, ts.duration_seconds
            FROM trigger_table tt
            LEFT JOIN trigger_summary ts ON ts.trigger_id = tt.id
            WHERE tt.id = ?
        `, [triggerId]);

        if (!trigger) return res.status(404).json({ error: 'Trigger not found' });

        // Per-channel stats
        const [channelStats] = await db.execute(`
            SELECT
                dl.channel,
                COUNT(*)                                        AS total,
                SUM(dl.status = 2)                              AS sent,
                SUM(dl.status = 3)                              AS failed,
                SUM(dl.status = 4)                              AS delivered,
                AVG(TIMESTAMPDIFF(SECOND, dl.queued_at, dl.sent_at)) AS avg_send_time_seconds
            FROM trigger_dispatch_log dl
            WHERE dl.trigger_id = ?
            GROUP BY dl.channel
        `, [triggerId]);

        // Per-employee dispatch details
        const [dispatches] = await db.execute(`
            SELECT
                dl.id       AS dispatch_log_id,
                dl.emp_id,
                em.emp_id   AS emp_code,
                em.full_name,
                dl.channel,
                dl.contact_type,
                dl.contact_value,
                dl.status,
                dl.message_id,
                dl.attempt_count,
                dl.queued_at,
                dl.sent_at,
                dl.error_message,

                rl.selected_option,
                rl.response_raw,
                rl.response_time_seconds,
                rl.created_at AS responded_at
            FROM trigger_dispatch_log dl
            JOIN employee_master em ON em.id = dl.emp_id
            LEFT JOIN trigger_response_log rl
                   ON rl.trigger_id = dl.trigger_id
                  AND rl.emp_id     = dl.emp_id
                  AND rl.channel    = dl.channel
            WHERE dl.trigger_id = ?
            ORDER BY dl.emp_id, dl.channel, dl.queued_at
        `, [triggerId]);

        // Group dispatches by employee
        const byEmployee = {};
        for (const d of dispatches) {
            if (!byEmployee[d.emp_id]) {
                byEmployee[d.emp_id] = {
                    emp_id:   d.emp_id,
                    emp_code: d.emp_code,
                    full_name: d.full_name,
                    channels: [],
                };
            }
            byEmployee[d.emp_id].channels.push({
                dispatch_log_id:  d.dispatch_log_id,
                channel:          d.channel,
                channel_label:    CHANNEL_LABEL[d.channel],
                contact_type:     CONTACT_LABEL[d.contact_type],
                contact_value:    d.contact_value,
                status:           STATUS_LABEL[d.status],
                message_id:       d.message_id,
                attempt_count:    d.attempt_count,
                queued_at:        d.queued_at,
                sent_at:          d.sent_at,
                error_message:    d.error_message,
                response: d.responded_at ? {
                    selected_option:       d.selected_option,
                    response_raw:          d.response_raw,
                    response_time_seconds: d.response_time_seconds,
                    responded_at:          d.responded_at,
                } : null,
            });
        }

        const triggerDetail = typeof trigger.trigger_detail === 'string'
            ? JSON.parse(trigger.trigger_detail)
            : trigger.trigger_detail;

        res.json({
            trigger_id:            trigger.id,
            template_id:           trigger.template_id,
            template_name:         triggerDetail.template_name || null,
            alert_type:            triggerDetail.alert_type,
            alert_type_label:      ALERT_LABEL[triggerDetail.alert_type],
            alert_flow_type:       triggerDetail.alert_flow_type,
            alert_flow_type_label: FLOW_LABEL[triggerDetail.alert_flow_type],
            trigger_status:        trigger.status,
            created_by:            trigger.created_by,
            created_at:            trigger.created_at,
            summary: {
                total_employees:  trigger.total_employees,
                total_dispatches: trigger.total_dispatches,
                total_sent:       trigger.total_sent,
                total_failed:     trigger.total_failed,
                delivery_rate:    trigger.total_dispatches
                    ? `${((trigger.total_sent / trigger.total_dispatches) * 100).toFixed(1)}%`
                    : null,
                resolved_at:      trigger.resolved_at,
                completed_at:     trigger.completed_at,
                duration_seconds: trigger.duration_seconds,
            },
            channel_breakdown: channelStats.map(c => ({
                channel:               c.channel,
                channel_label:         CHANNEL_LABEL[c.channel],
                total:                 c.total,
                sent:                  c.sent,
                failed:                c.failed,
                delivered:             c.delivered,
                avg_send_time_seconds: c.avg_send_time_seconds
                    ? Math.round(c.avg_send_time_seconds)
                    : null,
            })),
            employees: Object.values(byEmployee),
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/analytics/triggers/:id/responses
// All responses received for a two-way trigger.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/api/analytics/triggers/:id/responses', async (req, res) => {
    try {
        const triggerId = parseInt(req.params.id);

        const [rows] = await db.execute(`
            SELECT
                rl.id,
                rl.emp_id,
                em.emp_id   AS emp_code,
                em.full_name,
                rl.channel,
                rl.contact_value,
                rl.selected_option,
                rl.response_raw,
                rl.response_time_seconds,
                rl.created_at AS responded_at
            FROM trigger_response_log rl
            JOIN employee_master em ON em.id = rl.emp_id
            WHERE rl.trigger_id = ?
            ORDER BY rl.created_at ASC
        `, [triggerId]);

        // Option tally — how many chose each option
        const tally = {};
        for (const r of rows) {
            const key = r.selected_option || 'unrecognised';
            tally[key] = (tally[key] || 0) + 1;
        }

        res.json({
            trigger_id:          triggerId,
            total_responses:     rows.length,
            option_tally:        tally,
            avg_response_time_seconds: rows.length
                ? Math.round(rows.reduce((s, r) => s + (r.response_time_seconds || 0), 0) / rows.length)
                : null,
            responses: rows.map(r => ({
                ...r,
                channel_label: CHANNEL_LABEL[r.channel],
            })),
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/analytics/triggers/:id/employees/:empId
// Single employee's full journey for a trigger (all channels + response).
// ─────────────────────────────────────────────────────────────────────────────
router.get('/api/analytics/triggers/:id/employees/:empId', async (req, res) => {
    try {
        const triggerId = parseInt(req.params.id);
        const empId     = parseInt(req.params.empId);

        const [dispatches] = await db.execute(`
            SELECT
                dl.id AS dispatch_log_id,
                dl.channel, dl.contact_type, dl.contact_value,
                dl.status, dl.message_id, dl.attempt_count,
                dl.queued_at, dl.sent_at, dl.error_message
            FROM trigger_dispatch_log dl
            WHERE dl.trigger_id = ? AND dl.emp_id = ?
            ORDER BY dl.queued_at ASC
        `, [triggerId, empId]);

        const [responses] = await db.execute(`
            SELECT channel, selected_option, response_raw, response_time_seconds, created_at AS responded_at
            FROM trigger_response_log
            WHERE trigger_id = ? AND emp_id = ?
            ORDER BY created_at ASC
        `, [triggerId, empId]);

        const [[emp]] = await db.execute(
            `SELECT id, emp_id AS emp_code, full_name FROM employee_master WHERE id = ?`, [empId]
        );

        // For sequential: also fetch the sequential queue steps
        const [seqSteps] = await db.execute(`
            SELECT seq_order, channel, contact_type, wait_minutes, status,
                   wait_until, dispatched_at
            FROM trigger_sequential_queue
            WHERE trigger_id = ? AND emp_id = ?
            ORDER BY seq_order ASC
        `, [triggerId, empId]);

        res.json({
            trigger_id: triggerId,
            employee: emp || null,
            dispatches: dispatches.map(d => ({
                ...d,
                channel_label:    CHANNEL_LABEL[d.channel],
                contact_type_label: CONTACT_LABEL[d.contact_type],
                status_label:     STATUS_LABEL[d.status],
            })),
            sequential_steps: seqSteps.map(s => ({
                ...s,
                channel_label: CHANNEL_LABEL[s.channel],
                contact_type_label: CONTACT_LABEL[s.contact_type],
            })),
            responses: responses.map(r => ({
                ...r,
                channel_label: CHANNEL_LABEL[r.channel],
            })),
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/analytics/overview
// System-wide stats: totals, delivery rate, channel usage breakdown.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/api/analytics/overview', async (req, res) => {
    try {
        const [[totals]] = await db.execute(`
            SELECT
                COUNT(*)                     AS total_triggers,
                SUM(total_employees)         AS total_employees_alerted,
                SUM(total_dispatches)        AS total_dispatches,
                SUM(total_sent)              AS total_sent,
                SUM(total_failed)            AS total_failed,
                SUM(alert_type = 1)          AS one_way_triggers,
                SUM(alert_type = 2)          AS two_way_triggers,
                AVG(duration_seconds)        AS avg_duration_seconds
            FROM trigger_summary
        `);

        const [channelStats] = await db.execute(`
            SELECT
                channel,
                COUNT(*)            AS total_dispatches,
                SUM(status = 2)     AS sent,
                SUM(status = 3)     AS failed
            FROM trigger_dispatch_log
            GROUP BY channel
            ORDER BY channel ASC
        `);

        const [[responseStats]] = await db.execute(`
            SELECT
                COUNT(*)                     AS total_responses,
                AVG(response_time_seconds)   AS avg_response_time_seconds
            FROM trigger_response_log
        `);

        res.json({
            triggers: {
                total:    totals.total_triggers,
                one_way:  totals.one_way_triggers,
                two_way:  totals.two_way_triggers,
            },
            dispatches: {
                total:         totals.total_dispatches,
                sent:          totals.total_sent,
                failed:        totals.total_failed,
                delivery_rate: totals.total_dispatches
                    ? `${((totals.total_sent / totals.total_dispatches) * 100).toFixed(1)}%`
                    : null,
            },
            employees_alerted: totals.total_employees_alerted,
            avg_trigger_duration_seconds: totals.avg_duration_seconds
                ? Math.round(totals.avg_duration_seconds)
                : null,
            channel_breakdown: channelStats.map(c => ({
                channel:       c.channel,
                channel_label: CHANNEL_LABEL[c.channel],
                total:         c.total_dispatches,
                sent:          c.sent,
                failed:        c.failed,
            })),
            two_way_responses: {
                total:                     responseStats.total_responses,
                avg_response_time_seconds: responseStats.avg_response_time_seconds
                    ? Math.round(responseStats.avg_response_time_seconds)
                    : null,
            },
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
