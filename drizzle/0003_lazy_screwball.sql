ALTER TABLE `users` ADD `version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `mutation_id` text DEFAULT '' NOT NULL;
--> statement-breakpoint
-- Existing workspaces had only the setup account before public registration.
UPDATE users SET role='admin' WHERE id=(SELECT id FROM users ORDER BY rowid LIMIT 1) AND NOT EXISTS(SELECT 1 FROM users WHERE role='admin');
--> statement-breakpoint
UPDATE users SET role='user' WHERE role IS NULL OR role NOT IN ('user','moderator','admin');
--> statement-breakpoint
CREATE INDEX users_role_name ON users(role,name,id);
--> statement-breakpoint
CREATE INDEX users_name_id ON users(name,id);
--> statement-breakpoint
CREATE TRIGGER users_valid_role_insert BEFORE INSERT ON users WHEN NEW.role IS NULL OR NEW.role NOT IN ('user','moderator','admin') BEGIN SELECT RAISE(ABORT,'Invalid user role'); END;
--> statement-breakpoint
CREATE TRIGGER users_valid_role_update BEFORE UPDATE OF role ON users WHEN NEW.role IS NULL OR NEW.role NOT IN ('user','moderator','admin') BEGIN SELECT RAISE(ABORT,'Invalid user role'); END;
