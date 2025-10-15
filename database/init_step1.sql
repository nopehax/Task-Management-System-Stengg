-- Task Management System: Database Init (Step 1)
-- Clean cut-over schema with username as PK and JSON userGroups.
-- Assumes MySQL 5.7+ (JSON type).

-- Optional: create/use a database (comment out if managed elsewhere)
-- CREATE DATABASE IF NOT EXISTS task_manager CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
-- USE task_manager;

SET NAMES utf8;

-- Drop existing tables to allow clean re-run during development
DROP TABLE IF EXISTS accounts;
DROP TABLE IF EXISTS userGroups;

-- Catalog of valid groups (normalized snake_case labels)
CREATE TABLE userGroups (
  name VARCHAR(50) NOT NULL,
  PRIMARY KEY (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Accounts table: username is immutable primary key, groups stored as JSON array
CREATE TABLE accounts (
  username VARCHAR(50) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password VARCHAR(255) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  userGroups JSON NOT NULL,
  PRIMARY KEY (username),
  UNIQUE KEY uq_accounts_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Seed catalog groups (snake_case)
INSERT INTO userGroups (name) VALUES
  ('admin'),
  ('project_lead'),
  ('project_manager'),
  ('dev_team');

-- Seed users
-- NOTE: Passwords are plaintext to match current backend (hashing intentionally bypassed).
--       Groups are stored as JSON arrays of snake_case strings.
INSERT INTO accounts (username, email, password, active, userGroups) VALUES
  ('admin', 'admin@example.com', 'admin', 1, '["admin"]'),
  ('pm',    'pm@example.com',    'pm',    1, '["project_manager"]'),
  ('user',  'user@example.com',  'user',  1, '["dev_team"]');
