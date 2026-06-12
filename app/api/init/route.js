import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

// Visit /api/init ONCE after connecting Postgres. Safe to visit again (IF NOT EXISTS).
export async function GET() {
  try {
    await sql`CREATE TABLE IF NOT EXISTS departments (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    )`;
    await sql`CREATE TABLE IF NOT EXISTS shifts (
      id SERIAL PRIMARY KEY,
      dept_id INTEGER NOT NULL REFERENCES departments(id),
      name TEXT NOT NULL,
      start_t TEXT NOT NULL,
      end_t TEXT NOT NULL,
      grace INTEGER NOT NULL DEFAULT 15
    )`;
    await sql`CREATE TABLE IF NOT EXISTS employees (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      dept_id INTEGER REFERENCES departments(id),
      shift_id INTEGER REFERENCES shifts(id),
      pass_hash TEXT,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT now()
    )`;
    await sql`CREATE TABLE IF NOT EXISTS attendance (
      id SERIAL PRIMARY KEY,
      emp_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      day DATE NOT NULL,
      check_in TEXT,
      check_out TEXT,
      status TEXT,
      late_min INTEGER DEFAULT 0,
      photo_in TEXT,
      photo_out TEXT,
      UNIQUE (emp_id, day)
    )`;

    // Seed default departments + time windows (only if empty; edit later in the UI)
    const n = (await sql`SELECT COUNT(*)::int AS n FROM departments`).rows[0].n;
    if (n === 0) {
      const sales = (await sql`INSERT INTO departments (name) VALUES ('Sales') RETURNING id`).rows[0].id;
      const dev = (await sql`INSERT INTO departments (name) VALUES ('Developers') RETURNING id`).rows[0].id;
      const gfx = (await sql`INSERT INTO departments (name) VALUES ('Graphics Design') RETURNING id`).rows[0].id;
      await sql`INSERT INTO shifts (dept_id, name, start_t, end_t) VALUES
        (${sales}, 'Morning',   '07:00', '15:30'),
        (${sales}, 'Afternoon', '14:30', '23:00'),
        (${sales}, 'Night',     '23:00', '07:00'),
        (${dev},   'General',   '10:00', '19:00'),
        (${gfx},   'General',   '10:00', '19:00')`;
    }
    return NextResponse.json({ ok: true, message: 'Tables ready. Log in as admin to add employees.' });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
