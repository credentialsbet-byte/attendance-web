import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { dhakaNow, statusFor, hoursWorked } from '../../../lib/rules';

export const dynamic = 'force-dynamic';

// GET -> today's board. Admin: everyone. Employee: only their own row.
export async function GET(req) {
  const s = getSession(req);
  if (!s) return NextResponse.json({ error: 'Login required' }, { status: 401 });
  const { date } = dhakaNow();

  const base = await sql`
    SELECT e.id, e.name, d.name AS dept, sh.name AS shift, sh.start_t, sh.end_t, sh.grace,
           a.check_in, a.check_out, a.status, a.late_min,
           (a.photo_in IS NOT NULL)  AS has_photo_in,
           (a.photo_out IS NOT NULL) AS has_photo_out
    FROM employees e
    LEFT JOIN departments d ON d.id = e.dept_id
    LEFT JOIN shifts sh ON sh.id = e.shift_id
    LEFT JOIN attendance a ON a.emp_id = e.id AND a.day = ${date}
    WHERE e.active = true
    ORDER BY d.name NULLS LAST, e.name`;

  const rows = s.role === 'admin' ? base.rows : base.rows.filter((r) => r.id === s.empId);
  return NextResponse.json({ date, rows });
}

// POST { empId?, action:'in'|'out', photo }
// Employees can only stamp THEMSELVES; admin can stamp anyone.
export async function POST(req) {
  const s = getSession(req);
  if (!s) return NextResponse.json({ error: 'Login required' }, { status: 401 });

  const body = await req.json();
  const empId = s.role === 'admin' ? body.empId : s.empId;
  const { action, photo } = body;
  const { date, time } = dhakaNow();

  const emp = (
    await sql`SELECT e.*, sh.start_t, sh.grace FROM employees e
              LEFT JOIN shifts sh ON sh.id = e.shift_id
              WHERE e.id = ${empId} AND e.active = true`
  ).rows[0];
  if (!emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
  if (!emp.start_t) return NextResponse.json({ error: 'No shift assigned — ask the admin to assign a time window first' }, { status: 400 });

  if (action === 'in') {
    const existing = (
      await sql`SELECT check_in FROM attendance WHERE emp_id = ${empId} AND day = ${date}`
    ).rows[0];
    if (existing?.check_in) return NextResponse.json({ error: 'Already checked in today' }, { status: 409 });
    const { status, lateMin } = statusFor(emp.start_t, emp.grace ?? 15, time);
    await sql`
      INSERT INTO attendance (emp_id, day, check_in, status, late_min, photo_in)
      VALUES (${empId}, ${date}, ${time}, ${status}, ${lateMin}, ${photo || null})
      ON CONFLICT (emp_id, day)
      DO UPDATE SET check_in = ${time}, status = ${status}, late_min = ${lateMin}, photo_in = ${photo || null}`;
    return NextResponse.json({ ok: true, time, status, lateMin });
  }

  if (action === 'out') {
    const open = (
      await sql`SELECT * FROM attendance
                WHERE emp_id = ${empId} AND check_in IS NOT NULL AND check_out IS NULL
                ORDER BY day DESC LIMIT 1`
    ).rows[0];
    if (!open) return NextResponse.json({ error: 'No open check-in found' }, { status: 409 });
    await sql`UPDATE attendance SET check_out = ${time}, photo_out = ${photo || null} WHERE id = ${open.id}`;
    return NextResponse.json({ ok: true, time, hours: hoursWorked(open.check_in, time) });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
