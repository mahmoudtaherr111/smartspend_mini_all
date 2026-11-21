import * as dotenv from "dotenv";
dotenv.config();
import { defineConfig } from "drizzle-kit";

const connectionString =
  process.env.DATABASE_URL || "mysql://localhost:3306/smartspend";

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "mysql",
  dbCredentials: {
    url: connectionString,
  },
});
