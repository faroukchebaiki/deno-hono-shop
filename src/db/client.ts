export type SqlClient = Awaited<ReturnType<typeof createDb>>;

let sqlClient: SqlClient | null = null;

const normalizeDatabaseUrl = (value: string) => {
  let normalized = value.trim();
  if (normalized.startsWith("DATABASE_URL=")) {
    normalized = normalized.slice("DATABASE_URL=".length).trim();
  }
  const first = normalized[0];
  const last = normalized[normalized.length - 1];
  if (
    normalized.length >= 2 &&
    ((first === '"' && last === '"') || (first === "'" && last === "'"))
  ) {
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized;
};

const createDb = async () => {
  const raw = Deno.env.get("DATABASE_URL");
  const url = raw ? normalizeDatabaseUrl(raw) : undefined;
  if (!url) {
    throw new Error("DATABASE_URL is required to connect to the database.");
  }
  const { neon } = await import("@neondatabase/serverless");
  return neon(url);
};

export const getDb = async (): Promise<SqlClient> => {
  if (sqlClient) return sqlClient;
  sqlClient = await createDb();
  return sqlClient;
};
