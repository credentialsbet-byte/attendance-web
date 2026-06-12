import { NextResponse } from 'next/server';

// Office-only access control.
// Set OFFICE_IPS in Vercel env vars, e.g. "103.115.27.4" or "103.115.27.4,103.115.27.5"
// If OFFICE_IPS is not set, access is open (useful while testing).
export function middleware(req) {
  const allowed = (process.env.OFFICE_IPS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (allowed.length === 0) return NextResponse.next();

  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  if (allowed.includes(ip)) return NextResponse.next();

  return new NextResponse(
    `Access denied. This attendance system can only be used from the office network. (Your IP: ${ip})`,
    { status: 403 }
  );
}

export const config = {
  matcher: ['/((?!_next|favicon.ico).*)'],
};
