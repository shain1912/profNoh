import jwt from 'jsonwebtoken';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../env';
import { getUserById, type UserRow } from './userStore';

const COOKIE = 'axedu_sess';
const MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30일

export function setSessionCookie(reply: FastifyReply, userId: string) {
  const token = jwt.sign({ sub: userId }, env.AUTH_JWT_SECRET, { expiresIn: MAX_AGE_SEC });
  reply.setCookie(COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: env.APP_ORIGIN.startsWith('https'),
    maxAge: MAX_AGE_SEC,
  });
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(COOKIE, { path: '/' });
}

/** 세션 쿠키에서 사용자 ID만 추출 (DB 조회 없음) */
export function getSessionUserId(req: FastifyRequest): string | null {
  const token = (req.cookies ?? {})[COOKIE];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, env.AUTH_JWT_SECRET) as { sub?: string };
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

/** 세션 쿠키 → 사용자 행. 없으면 null. */
export async function getSessionUser(req: FastifyRequest): Promise<UserRow | null> {
  const id = getSessionUserId(req);
  if (!id) return null;
  return getUserById(id);
}
