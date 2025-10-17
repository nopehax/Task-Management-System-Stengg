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
  ('project lead'),
  ('project manager'),
  ('dev team');

-- Seed users
INSERT INTO accounts (username, email, password, active, userGroups) VALUES
  ('admin', 'admin@example.com', '$2b$10$l3yNCDOT0h70PD9TRhDKLepx6kR5q7BLQTT/4w8dmnz8zKBFgQsJm', 1, '["admin"]'),
  ('pm',    'pm@example.com',    '$2b$10$mGy56GwtDPtNCH6//jgA8.y2Uv/w/.CNZAhFjiWVaEiItHjXSPoUm',    1, '["project manager"]'),
  ('user',  'user@example.com',  '$2b$10$JVZimuEKi1ShfrK/n.xFz.iZYEZxT/K6YQtvGJ5wjxCn5IU8Ss49u',  1, '["dev team"]'),
  ('inactive', 'null@null.com', '$2b$12$JC407angGDbdviFYAgefXed8evLSrx5zMbInSyunzALggKjLUa0Ei', 0, '["dev team"]');
