import { getDb } from "../../src/db/client.ts";

const sql = await getDb();
const schemaUrl = new URL("./schema.sql", import.meta.url);
const schema = await Deno.readTextFile(schemaUrl);

const statements = schema
  .split(";")
  .map((statement) => statement.trim())
  .filter((statement) => statement.length > 0);

for (const statement of statements) {
  await sql.query(statement);
}

console.log(`Applied ${statements.length} schema statements.`);
