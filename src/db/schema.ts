import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import type { Entity } from "@/lib/domain";
export const records = sqliteTable(
  "records",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    payload: text("payload", { mode: "json" }).$type<Entity>().notNull(),
    deleted: integer("deleted").notNull().default(0),
  },
  (t) => [index("records_kind").on(t.kind, t.deleted)],
);
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  qaum: text("qaum"),
});
export const sessions = sqliteTable(
  "sessions",
  {
    hash: text("hash").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    expires: integer("expires").notNull(),
  },
  (t) => [index("sessions_expiry").on(t.expires)],
);
export const meta = sqliteTable("meta", {
  id: integer("id").primaryKey(),
  revision: integer("revision").notNull(),
  mutationId: text("mutation_id").notNull(),
});
export const audit = sqliteTable(
  "audit",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    action: text("action").notNull(),
    recordId: text("record_id").notNull(),
    at: text("at").notNull(),
    oldValue: text("old_value"),
    newValue: text("new_value"),
  },
  (t) => [index("audit_at").on(t.at)],
);
export const loginAttempts = sqliteTable("login_attempts", {
  key: text("key").primaryKey(),
  attempts: integer("attempts").notNull(),
  resetAt: integer("reset_at").notNull(),
});
