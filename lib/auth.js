import crypto from 'crypto';

const SECRET = process.env.AUTH_SECRET || 'dev-secret-change-me';

export const hashPw = (pw) =>
  crypto.createHash('sha256').update(SECRET + ':' + String(pw)).digest('hex');

export function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verify(token) {
  try {
    const [body, sig] = String(token).split('.');
    const good = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
    return JSON.parse(Buffer.from(body, 'base64url').toString());
  } catch {
    return null;
  }
}

// Use inside route handlers: getSession(req) -> { role:'admin' } | { role:'employee', empId, name } | null
export function getSession(req) {
  const token = req.cookies.get('session')?.value;
  return token ? verify(token) : null;
}

export const requireAdmin = (req) => {
  const s = getSession(req);
  return s?.role === 'admin' ? s : null;
};
