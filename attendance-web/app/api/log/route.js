import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { hoursWorked } from '../../../lib/rules';

export const dynamic = 'force-dynamic';

// GET /api/log?month=6&year=2026      -> records + summary (admin: all, employee: own only)
// GET /api/log?photo=<id>&which=in|out -> stored webcam photo (admin only)
export async function GET(req) {
  const s = getSession(req);
  if (!s) return NextResponse.json({ error: 'Login required' }, { status: 401 });
  const url = new URL(req.url);

  const photoId = url.searchParams.get('photo');
  if (photoId) {
    if (s.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    const which = url.searchParams.get('which') === 'out' ? 'photo_out' : 'photo_in';
    const { rows } = await sql.query(`SELECT ${which} AS photo FROM attendance WHERE id = $1`, [photoId]);
    return NextResponse.json({ photo: rows[0]?.photo || null });
  }

  const month = Number(url.searchParams.get('month'));
  const year = Number(url.searchParams.get('year'));
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;

  const all = await sql`
    SELECT a.id, a.emp_id, a.day, e.name, d.name AS dept, sh.name AS shift,
           a.check_in, a.check_out, a.status, a.late_min,
           (a.photo_in IS NOT NULL) AS has_photo_in, (a.photo_out IS NOT NULL) AS has_photo_out
    FROM attendance a
    JOIN employees e ON e.id = a.emp_id
    LEFT JOIN departments d ON d.id = e.dept_id
    LEFT JOIN shifts sh ON sh.id = e.shift_id
    WHERE a.day >= ${start} AND a.day < ${end}
    ORDER BY a.day DESC, e.name`;

  const rows = s.role === 'admin' ? all.rows : all.rows.filter((r) => r.emp_id === s.empId);

  // Working days = distinct dates (company-wide) where someone checked in
  const workDays = [...new Set(all.rows.map((r) => String(r.day).slice(0, 10)))];

  const empList =
    s.role === 'admin'
      ? (await sql`SELECT e.id, e.name, d.name AS dept, sh.name AS shift FROM employees e
                   LEFT JOIN departments d ON d.id = e.dept_id
                   LEFT JOIN shifts sh ON sh.id = e.shift_id
                   WHERE e.active = true ORDER BY d.name NULLS LAST, e.name`).rows
      : (await sql`SELECT e.id, e.name, d.name AS dept, sh.name AS shift FROM employees e
                   LEFT JOIN departments d ON d.id = e.dept_id
                   LEFT JOIN shifts sh ON sh.id = e.shift_id
                   WHERE e.id = ${s.empId}`).rows;

  const summary = empList.map((e) => {
    const mine = all.rows.filter((r) => r.emp_id === e.id);
    const present = mine.filter((r) => r.status === 'PRESENT').length;
    const late = mine.filter((r) => r.status === 'LATE').length;
    const logged = present + late;
    const absent = Math.max(workDays.length - logged, 0);
    const hrs = mine.map((r) => hoursWorked(r.check_in, r.check_out)).filter((h) => h !== null);
    return {
      name: e.name, dept: e.dept, shift: e.shift,
      workDays: workDays.length, present, late, absent,
      latePct: logged ? Math.round((late / logged) * 1000) / 10 : 0,
      attendPct: workDays.length ? Math.round((logged / workDays.length) * 1000) / 10 : 0,
      avgHrs: hrs.length ? Math.round((hrs.reduce((a, b) => a + b, 0) / hrs.length) * 100) / 100 : null,
    };
  });

  return NextResponse.json({ rows, summary });
}
