import type { Role } from "../types/domain.ts";
import { getAuthCookieConfig } from "./config.ts";
import {
  decodeJson,
  encodeJson,
  randomToken,
  signHmac,
  verifyHmac,
} from "../lib/crypto.ts";

export type SessionPayload = {
  sub: string;
  role: Role;
  iat: number;
  exp: number;
  nonce: string;
};

export type SessionUser = {
  id: string;
  role: Role;
};

const serialize = (
  payload: SessionPayload,
  secret: string,
): Promise<string> => {
  const encoded = encodeJson(payload);
  return signHmac(encoded, secret).then((sig) => `${encoded}.${sig}`);
};

const deserialize = async (
  token: string,
  secret: string,
): Promise<SessionPayload | null> => {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const valid = await verifyHmac(encoded, signature, secret);
  if (!valid) return null;
  const payload = decodeJson<SessionPayload>(encoded);
  if (payload.exp * 1000 < Date.now()) return null;
  return payload;
};

export const createSessionToken = async (
  userId: string,
  role: Role,
  ttlSeconds = 60 * 60 * 24 * 7,
) => {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: userId,
    role,
    iat: now,
    exp: now + ttlSeconds,
    nonce: randomToken(12),
  };
  const { cookieSecret } = getAuthCookieConfig();
  return await serialize(payload, cookieSecret);
};

export const verifySessionToken = (token: string) => {
  const { cookieSecret } = getAuthCookieConfig();
  return deserialize(token, cookieSecret);
};
