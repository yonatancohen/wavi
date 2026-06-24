import type { FastifyRequest } from 'fastify';
import { db } from '../db/client.js';

export type AuthUser = {
  id: string;
  email?: string;
};

export function isAuthRequired(): boolean {
  return process.env.AUTH_REQUIRED === 'true';
}

export async function verifyBearerToken(authHeader: string | undefined): Promise<AuthUser | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;

  return { id: data.user.id, email: data.user.email };
}

export async function requireAuth(request: FastifyRequest): Promise<AuthUser | null> {
  return verifyBearerToken(request.headers.authorization);
}
