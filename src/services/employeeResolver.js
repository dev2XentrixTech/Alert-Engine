const pool = require('../db/connection');

async function resolveEmployees(template) {
  const empIds = template.emp_ids
    ? template.emp_ids.split(',').map(Number).filter(Boolean)
    : [];

  const grpIds = template.grp_ids
    ? template.grp_ids.split(',').map(Number).filter(Boolean)
    : [];

  if (!empIds.length && !grpIds.length) return [];

  const conditions = [];
  const params     = [];

  if (empIds.length) {
    conditions.push(`em.id IN (${empIds.map(() => '?').join(',')})`);
    params.push(...empIds);
  }

  if (grpIds.length) {
    conditions.push(`em.group_id IN (${grpIds.map(() => '?').join(',')})`);
    params.push(...grpIds);
  }

  const sql = `
    SELECT em.id AS emp_id, em.personal_email, em.emergency_contact,
           pt.device_token AS push_token, pt.platform
    FROM employee_master em
    LEFT JOIN push_tokens pt ON pt.emp_id = em.id
    WHERE ${conditions.join(' OR ')}
  `;

  const [rows] = await pool.query(sql, params);
  return rows;
}

module.exports = { resolveEmployees };
