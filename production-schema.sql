PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE IF NOT EXISTS "d1_migrations"(
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		name       TEXT UNIQUE,
		applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE `audit` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`action` text NOT NULL,
	`record_id` text NOT NULL,
	`at` text NOT NULL,
	`old_value` text,
	`new_value` text
);
CREATE TABLE `login_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	`reset_at` integer NOT NULL
);
CREATE TABLE `meta` (
	`id` integer PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`mutation_id` text NOT NULL
);
CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL
);
CREATE TABLE `sessions` (
	`hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`name` text NOT NULL
, `qaum` text, `role` text, `version` integer DEFAULT 0 NOT NULL, `mutation_id` text DEFAULT '' NOT NULL);
DELETE FROM sqlite_sequence;
CREATE INDEX `audit_at` ON `audit` (`at`);
CREATE INDEX `records_kind` ON `records` (`kind`,`deleted`);
CREATE INDEX `sessions_expiry` ON `sessions` (`expires`);
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);
CREATE INDEX users_role_name ON users(role,name,id);
CREATE INDEX users_name_id ON users(name,id);
CREATE TRIGGER users_valid_role_insert BEFORE INSERT ON users WHEN NEW.role IS NULL OR NEW.role NOT IN ('user','moderator','admin') BEGIN SELECT RAISE(ABORT,'Invalid user role'); END;
CREATE TRIGGER users_valid_role_update BEFORE UPDATE OF role ON users WHEN NEW.role IS NULL OR NEW.role NOT IN ('user','moderator','admin') BEGIN SELECT RAISE(ABORT,'Invalid user role'); END;
