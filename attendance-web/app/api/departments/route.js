import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../lib/auth';

export const dynamic = 'force-dynamic';

const deny = () => NextResponse.json({ error: 'Admin only' }, { status: 403 });

// GET -> departments with their shifts
export async function GET(req) {
  if (!requireAdmin(req)) return deny();
  const depts = (await sql`SELECT * FROM departments ORDER BY id`).rows;
  const shifts = (await sql`SELECT * FROM shifts ORDER BY dept_id, start_t`).rows;
  return NextResponse.json(
    depts.map((d) => ({ ...d, shifts: shifts.filter((s) => s.dept_id === d.id) }))
  );
}

// POST -> one endpoint, action-based
// { action:'dept-add', name }
// { action:'dept-rename', id, name }
// { action:'dept-delete', id }
// { action:'shift-add', deptId, name, start, end, grace }
// { action:'shift-update', id, name, start, end, grace }
// { action:'shift-delete', id }
export async function POST(req) {
  if (!requireAdmin(req)) return deny();
  const b = await req.json();
  const hhmm = /^([01]?\d|2[0-3]):[0-5]\d$/;

  try {
    switch (b.action) {
      case 'dept-add': {
        if (!b.name?.trim()) throw new Error('Name required');
        const { rows } = await sql`INSERT INTO departments (name) VALUES (${b.name.trim()}) RETURNING *`;
        return NextResponse.json(rows[0]);
      }
      case 'dept-rename':
        await sql`UPDATE departments SET name = ${b.name.trim()} WHERE id = ${b.id}`;
        return NextResponse.json({ ok: true });
      case 'dept-delete': {
        const used = (await sql`SELECT COUNT(*)::int AS n FROM employees WHERE dept_id = ${b.id} AND active = true`).rows[0].n;
        if (used > 0) throw new Error(`Cannot delete: ${used} employee(s) are still in this department`);
        await sql`DELETE FROM shifts WHERE dept_id = ${b.id}`;
        await sql`DELETE FROM departments WHERE id = ${b.id}`;
        return NextResponse.json({ ok: true });
      }
      case 'shift-add': {
        if (!hhmm.test(b.start) || !hhmm.test(b.end)) throw new Error('Times must be HH:MM (24h)');
        const { rows } = await sql`
          INSERT INTO shifts (dept_id, name, start_t, end_t, grace)
          VALUES (${b.deptId}, ${b.name?.trim() || 'Shift'}, ${b.start}, ${b.end}, ${b.grace ?? 15})
          RETURNING *`;
        return NextResponse.json(rows[0]);
      }
      case 'shift-update':
        if (!hhmm.test(b.start) || !hhmm.test(b.end)) throw new Error('Times must be HH:MM (24h)');
        await sql`UPDATE shifts SET name = ${b.name?.trim() || 'Shift'}, start_t = ${b.start},
                  end_t = ${b.end}, grace = ${b.grace ?? 15} WHERE id = ${b.id}`;
        return NextResponse.json({ ok: true });
      case 'shift-delete': {
        const used = (await sql`SELECT COUNT(*)::int AS n FROM employees WHERE shift_id = ${b.id} AND active = true`).rows[0].n;
        if (used > 0) throw new Error(`Cannot delete: ${used} employee(s) are assigned to this shift`);
        await sql`DELETE FROM shifts WHERE id = ${b.id}`;
        return NextResponse.json({ ok: true });
      }
      default:
        throw new Error('Unknown action');
    }
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
