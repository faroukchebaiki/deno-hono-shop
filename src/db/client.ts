import { neon } from "@neondatabase/serverless";

export type SqlClient = ReturnType<typeof neon>;

let sqlClient: SqlClient | null = null;

export const getDb = (): SqlClient => {
  if (sqlClient) return sqlClient;
  const url = Deno.env.get("DATABASE_URL");
  if (!url) {
    throw new Error("DATABASE_URL is required to connect to the database.");
  }
  sqlClient = neon(url);
  return sqlClient;
};
