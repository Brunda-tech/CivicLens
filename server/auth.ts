import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import type { SafeOfficer } from './types.ts';

const RUNTIME_FALLBACK_SECRET = crypto.randomBytes(32).toString('hex');

function getJwtSecret(): string {
  const envSecret = process.env.JWT_SECRET?.trim();
  return envSecret && envSecret.length >= 16 ? envSecret : RUNTIME_FALLBACK_SECRET;
}

export const SESSION_COOKIE_NAME = 'civiclens_officer_session';

export interface TokenPayload {
  sub: number;
  email: string;
  name: string;
  role: 'officer';
  iat: number;
  exp: number;
}

export interface AuthenticatedRequest extends Request {
  officer?: SafeOfficer;
}

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64url');
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;
  try {
    const derived = crypto.scryptSync(password, salt, 64);
    const storedBuf = Buffer.from(keyHex, 'hex');
    if (derived.length !== storedBuf.length) return false;
    return crypto.timingSafeEqual(derived, storedBuf);
  } catch {
    return false;
  }
}

export function signToken(officer: SafeOfficer): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payloadObj: TokenPayload = {
    sub: officer.id,
    email: officer.email,
    name: officer.name,
    role: 'officer',
    iat: now,
    exp: now + 60 * 60 * 24 * 7,
  };
  const payload = base64UrlEncode(JSON.stringify(payloadObj));
  const data = `${header}.${payload}`;
  const signature = crypto
    .createHmac('sha256', getJwtSecret())
    .update(data)
    .digest('base64url');
  return `${data}.${signature}`;
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payload, sig] = parts;
    const data = `${header}.${payload}`;
    const expectedSig = crypto
      .createHmac('sha256', getJwtSecret())
      .update(data)
      .digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }
    const decoded = JSON.parse(base64UrlDecode(payload)) as TokenPayload;
    const now = Math.floor(Date.now() / 1000);
    if (!decoded.exp || decoded.exp < now || decoded.role !== 'officer') {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

export function extractTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const pairs = cookieHeader.split(';');
    for (const pair of pairs) {
      const idx = pair.indexOf('=');
      if (idx > 0) {
        const key = pair.slice(0, idx).trim();
        if (key === SESSION_COOKIE_NAME) {
          return decodeURIComponent(pair.slice(idx + 1).trim());
        }
      }
    }
  }
  return null;
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    partitioned: true,
    maxAge: 1000 * 60 * 60 * 24 * 7,
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    partitioned: true,
    path: '/',
  });
}

export function verifyOriginForCookieAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.headers.authorization?.startsWith('Bearer ')) {
    next();
    return;
  }
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const origin = req.headers.origin;
    const host = (req.headers['x-forwarded-host'] as string) || req.headers.host;
    if (origin && host) {
      try {
        const originHost = new URL(origin).host;
        if (originHost !== host) {
          res.status(403).json({ error: 'Invalid request origin' });
          return;
        }
      } catch {
        res.status(403).json({ error: 'Invalid origin header' });
        return;
      }
    }
  }
  next();
}
