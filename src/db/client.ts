export type SqlClient = Awaited<ReturnType<typeof createDb>>;

let sqlClient: SqlClient | null = null;

const createDb = async () => {
  const url = Deno.env.get("DATABASE_URL");
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
