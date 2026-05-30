import { defineConfig } from "drizzle-kit";

// No Railway o serviço de MySQL expõe a URL como MYSQL_URL; aceitamos os dois
// nomes pra não depender de um alias DATABASE_URL configurado à mão.
const connectionString = process.env.DATABASE_URL || process.env.MYSQL_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL (ou MYSQL_URL) is required to run drizzle commands");
}

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    url: connectionString,
  },
});
