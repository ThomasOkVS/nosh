import path from "node:path";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 3001),
  databaseUrl: required("DATABASE_URL"),
  sessionSecret: process.env.SESSION_SECRET ?? "dev-secret-change-me",
  uploadsDir: process.env.UPLOADS_DIR ?? path.resolve(process.cwd(), "uploads"),
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173",
  seedDemoData: process.env.SEED_DEMO_DATA === "true",
};
