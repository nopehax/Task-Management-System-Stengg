CREATE DATABASE IF NOT EXISTS `nodelogin` DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;
USE `nodelogin`;
SET NAMES utf8;

DROP TABLE IF EXISTS accounts;
DROP TABLE IF EXISTS userGroups;

-- Catalog of valid groups
CREATE TABLE userGroups (
  name VARCHAR(50) NOT NULL,
  PRIMARY KEY (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Accounts table
CREATE TABLE accounts (
  username VARCHAR(50) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password VARCHAR(255) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  userGroups JSON NOT NULL,
  PRIMARY KEY (username),
  UNIQUE KEY uq_accounts_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Seed catalog groups
INSERT INTO userGroups (name) VALUES
  ('admin'),
  ('project_lead'),
  ('project_manager'),
  ('dev_team');

-- Seed users
INSERT INTO accounts (username, email, password, active, userGroups) VALUES
  ('admin', 'admin@example.com', 'admin', 1, '["admin"]'),
  ('pm',    'pm@example.com',    'pm',    1, '["project_manager"]'),
  ('user',  'user@example.com',  'user',  1, '["dev_team"]');
