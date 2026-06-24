import type { FastifyRequest } from 'fastify';
import { db } from '../db/client.js';
import { getAllowedOwnerEmail, isOwnerEmail } from './allowed-owner.js';

export type AuthUser = {
  id: string;
  email?: string;
};

export type AuthRejectReason = 'missing_bearer' | 'invalid_token' | 'email_not_allowed';

export type AuthRejectDetail = {
  reason: AuthRejectReason;
  userEmail?: string | null;
  allowedOwnerEmail?: string | null;
  getUserError?: string;
};

let lastAuthReject: AuthRejectDetail | null = null;

export function getLastAuthReject(): AuthRejectDetail | null {
  return lastAuthReject;
}

const isDev = process.env.NODE_ENV !== 'production';

function logAuthReject(detail: AuthRejectDetail) {
  lastAuthReject = detail;
  if (!isDev) return;

  if (detail.reason === 'missing_bearer') {
    console.warn('[Auth] 401 missing Bearer token');
    return;
  }

  if (detail.reason === 'invalid_token') {
    console.warn('[Auth] 401 invalid token', { getUserError: detail.getUserError });
    return;
  }

  console.warn('[Auth] 401 email not allowed', {
    userEmail: detail.userEmail ?? '(none)',
    allowedOwnerEmail: detail.allowedOwnerEmail ?? '(unset — all emails allowed)',
  });
}

export function isAuthRequired(): boolean {
  return process.env.AUTH_REQUIRED === 'true';
}

/** Bearer from Authorization header or ?token= (EventSource cannot send headers). */
export function resolveBearerHeader(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  if (header?.startsWith('Bearer ')) return header;

  const rawUrl = request.raw.url ?? request.url;
  try {
    const token = new URL(rawUrl, 'http://localhost').searchParams.get('token');
    if (token) return `Bearer ${token}`;
  } catch {
    // Malformed URL — fall through to missing bearer.
  }

  return undefined;
}

export async function verifyBearerToken(authHeader: string | undefined): Promise<AuthUser | null> {
  lastAuthReject = null;

  if (!authHeader?.startsWith('Bearer ')) {
    logAuthReject({ reason: 'missing_bearer' });
    return null;
  }

  const token = authHeader.slice(7);
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) {
    logAuthReject({
      reason: 'invalid_token',
      getUserError: error?.message ?? 'no user returned',
    });
    return null;
  }

  if (!isOwnerEmail(data.user.email)) {
    logAuthReject({
      reason: 'email_not_allowed',
      userEmail: data.user.email ?? null,
      allowedOwnerEmail: getAllowedOwnerEmail(),
    });
    return null;
  }

  return { id: data.user.id, email: data.user.email };
}

export async function requireAuth(request: FastifyRequest): Promise<AuthUser | null> {
  const bearer = resolveBearerHeader(request);
  if (bearer) request.headers.authorization = bearer;
  return verifyBearerToken(bearer);
}
