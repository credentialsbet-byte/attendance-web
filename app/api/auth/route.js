import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';
import { sign, hashPw, getSession } from '../../../lib/auth';

export const dynamic = 'force-dynamic';

// GET            -> current session ({role,...} or null)
// GET ?list=1    -> active employee names for the login dropdown
export async function GET(req) {
  const url = new URL(req.url);
  if (url.searchParams.get('list')) {
    const { rows } = await sql`SELECT id, name FROM employees WHERE active = true ORDER BY name`;
    return NextResponse.json(rows);
  }
  return NextResponse.json(getSession(req));
}

// POST { role:'admin', password }  or  { role:'employee', empId, password }
export async function POST(req) {
  const { role, password, empId } = await req.json();

  if (role === 'admin') {
    const adminPw = process.env.ADMIN_PASSWORD || 'admin123';
    if (password !== adminPw) {
      return NextResponse.json({ error: 'Wrong admin password' }, { status: 401 });
    }
    const res = NextResponse.json({ role: 'admin' });
    res.cookies.set('session', sign({ role: 'admin' }), {
      httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 12,
    });
    return res;
  }

  if (role === 'employee') {
    const emp = (
      await sql`SELECT id, name, pass_hash FROM employees WHERE id = ${empId} AND active = true`
    ).rows[0];
    if (!emp || emp.pass_hash !== hashPw(password)) {
      return NextResponse.json({ error: 'Wrong password' }, { status: 401 });
    }
    const payload = { role: 'employee', empId: emp.id, name: emp.name };
    const res = NextResponse.json(payload);
    res.cookies.set('session', sign(payload), {
      httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 12,
    });
    return res;
  }

  return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
}

// DELETE -> logout
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set('session', '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}
