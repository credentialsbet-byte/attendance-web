import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../lib/auth';
import { hashPw } from '../../../lib/auth';

export const dynamic = 'force-dynamic';
const deny = () => NextResponse.json({ error: 'Admin only' }, { status: 403 });

// GET -> full list with dept & shift info (admin only)
export async function GET(req) {
  if (!requireAdmin(req)) return deny();
  const { rows } = await sql`
    SELECT e.id, e.name, e.dept_id, e.shift_id,
           d.name AS dept, s.name AS shift, s.start_t, s.end_t
    FROM employees e
    LEFT JOIN departments d ON d.id = e.dept_id
    LEFT JOIN shifts s ON s.id = e.shift_id
    WHERE e.active = true ORDER BY d.name NULLS LAST, e.name`;
  return NextResponse.json(rows);
}

// POST { name, deptId, shiftId, password } -> add employee (admin only)
export async function POST(req) {
  if (!requireAdmin(req)) return deny();
  const { name, deptId, shiftId, password } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });
  if (!password || String(password).length < 4)
    return NextResponse.json({ error: 'Password must be at least 4 characters' }, { status: 400 });
  const { rows } = await sql`
    INSERT INTO employees (name, dept_id, shift_id, pass_hash)
    VALUES (${name.trim()}, ${deptId || null}, ${shiftId || null}, ${hashPw(password)})
    RETURNING id, name`;
  return NextResponse.json(rows[0]);
}

// PATCH { id, name?, deptId?, shiftId?, password? } -> rename / reassign / reset password (admin only)
export async function PATCH(req) {
  if (!requireAdmin(req)) return deny();
  const { id, name, deptId, shiftId, password } = await req.json();
  if (name !== undefined) {
    if (!name.trim()) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
    await sql`UPDATE employees SET name = ${name.trim()} WHERE id = ${id}`;
  }
  if (deptId !== undefined) await sql`UPDATE employees SET dept_id = ${deptId || null} WHERE id = ${id}`;
  if (shiftId !== undefined) await sql`UPDATE employees SET shift_id = ${shiftId || null} WHERE id = ${id}`;
  if (password !== undefined) {
    if (String(password).length < 4)
      return NextResponse.json({ error: 'Password must be at least 4 characters' }, { status: 400 });
    await sql`UPDATE employees SET pass_hash = ${hashPw(password)} WHERE id = ${id}`;
  }
  return NextResponse.json({ ok: true });
}

// DELETE { id } -> soft delete (admin only)
export async function DELETE(req) {
  if (!requireAdmin(req)) return deny();
  const { id } = await req.json();
  await sql`UPDATE employees SET active = false WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
