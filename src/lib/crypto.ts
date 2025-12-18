const encoder = new TextEncoder();
const decoder = new TextDecoder();

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(
    /=+$/,
    "",
  );
};

const fromBase64Url = (input: string): Uint8Array => {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (input.length % 4 || 4)) % 4);
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const timingSafeEqual = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
};

export const randomToken = (bytes = 16): string =>
  toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));

export const signHmac = async (
  message: string,
  secret: string,
): Promise<string> => {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(message),
  );
  return toBase64Url(new Uint8Array(signature));
};

export const verifyHmac = async (
  message: string,
  signature: string,
  secret: string,
): Promise<boolean> => {
  const expected = await signHmac(message, secret);
  return timingSafeEqual(fromBase64Url(expected), fromBase64Url(signature));
};

export const hashPassword = async (
  password: string,
  iterations = 100_000,
): Promise<string> => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations,
    },
    keyMaterial,
    256,
  );
  const hash = new Uint8Array(derived);
  return `pbkdf2-sha256:${iterations}:${toBase64Url(salt)}:${
    toBase64Url(hash)
  }`;
};

export const verifyPassword = async (
  password: string,
  stored: string,
): Promise<boolean> => {
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== "pbkdf2-sha256") return false;
  const iterations = Number(parts[1]);
  const salt = fromBase64Url(parts[2]);
  const expectedHash = fromBase64Url(parts[3]);

  if (!Number.isFinite(iterations) || iterations <= 0) return false;

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations,
    },
    keyMaterial,
    expectedHash.length * 8,
  );
  const hash = new Uint8Array(derived);
  return timingSafeEqual(expectedHash, hash);
};

export const encodeJson = (value: unknown): string =>
  toBase64Url(encoder.encode(JSON.stringify(value)));

export const decodeJson = <T>(input: string): T => {
  const bytes = fromBase64Url(input);
  return JSON.parse(decoder.decode(bytes)) as T;
};
