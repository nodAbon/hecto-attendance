const { loadSyncEnv } = require('./loadEnv');
const mysql = require('mysql2/promise');

loadSyncEnv();

const COMPANY = '1600';
const CAPS_GROUP = '08';
const mysqlConfig = {
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  port: Number(process.env.MYSQL_PORT || 3306),
  connectTimeout: 15000,
};

function compactKst(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(date).reduce((out, part) => {
    if (part.type !== 'literal') out[part.type] = part.value;
    return out;
  }, {});
  return `${parts.year}${parts.month}${parts.day}${parts.hour}${parts.minute}${parts.second}`;
}

function bytes(value) {
  return Buffer.byteLength(JSON.stringify(value));
}

function mb(value) {
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}

async function run() {
  const now = new Date();
  const from = compactKst(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const fromDate = from.slice(0, 8);
  const fromTime = from.slice(8, 14);
  const conn = await mysql.createConnection(mysqlConfig);

  try {
    const [secom] = await conn.execute(`
      SELECT e.I_EMPLOY_NO AS emp_no, t.Sabun AS sabun, t.CardNo AS card_no,
             t.ATime AS a_time, CAST(t.EqCode AS CHAR) AS eq_code, t.Flag1 AS flag1
      FROM t_secom_alarm t
      INNER JOIN hr_employee e ON e.I_COMPANY = ?
        AND t.Sabun IS NOT NULL AND t.Sabun <> ''
        AND e.I_COMPANY = LEFT(t.Sabun, 4)
        AND e.I_EMPLOY_NO = RIGHT(t.Sabun, 8)
      INNER JOIN hr_department d ON d.I_COMPANY = ? AND d.I_DEPT = e.I_DEPT
      WHERE COALESCE(e.I_RETIRE_YN, '0') <> '1' AND t.ATime >= ?
      ORDER BY t.ATime DESC
    `, [COMPANY, COMPANY, from]);

    const [caps] = await conn.execute(`
      SELECT e.I_EMPLOY_NO AS emp_no, t.E_IDNO AS idno, t.E_CARD AS card_no,
             t.E_DATE AS e_date, t.E_TIME AS e_time, t.G_ID AS gate_code,
             t.E_GROUP AS e_group, t.E_MODE AS e_mode, t.E_TYPE AS e_type, t.E_RESULT AS e_result
      FROM tenter t
      INNER JOIN hr_employee e ON e.I_COMPANY = ?
        AND t.E_IDNO IS NOT NULL AND t.E_IDNO <> ''
        AND e.I_COMPANY = LEFT(t.E_IDNO, 4)
        AND e.I_EMPLOY_NO = RIGHT(t.E_IDNO, 8)
      INNER JOIN hr_department d ON d.I_COMPANY = ? AND d.I_DEPT = e.I_DEPT
      WHERE COALESCE(e.I_RETIRE_YN, '0') <> '1' AND t.E_GROUP = ?
        AND (t.E_DATE > ? OR (t.E_DATE = ? AND t.E_TIME >= ?))
      ORDER BY t.E_DATE DESC, t.E_TIME DESC
    `, [COMPANY, COMPANY, CAPS_GROUP, fromDate, fromDate, fromTime]);

    const report = (name, rows) => {
      const sourceBytes = bytes(rows);
      const batches = Math.ceil(rows.length / 500);
      const payloadBytes = Array.from({ length: batches }, (_, index) =>
        bytes(rows.slice(index * 500, index * 500 + 500))
      ).reduce((sum, value) => sum + value, 0);
      return { name, rows: rows.length, batches, sourceJson: mb(sourceBytes), upsertJson: mb(payloadBytes) };
    };

    const result = [report('SECOM', secom), report('CAPS', caps)];
    const totalRows = result.reduce((sum, item) => sum + item.rows, 0);
    const totalBytes = result.reduce((sum, item) => sum + Number.parseFloat(item.upsertJson), 0);
    console.log(JSON.stringify({ windowStartKst: from, windowHours: 24, result, totalRows, totalUpsertJsonMb: totalBytes.toFixed(2) }, null, 2));
  } finally {
    await conn.end();
  }
}

run().catch((error) => {
  console.error(`[measure-sync-payload] failed: ${error.code || error.message}`);
  process.exitCode = 1;
});
