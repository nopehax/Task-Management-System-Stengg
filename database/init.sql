CREATE DATABASE IF NOT EXISTS `nodelogin` DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;
USE `nodelogin`;
SET NAMES utf8;

DROP TABLE IF EXISTS userGroups;
DROP TABLE IF EXISTS accounts;
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS plans;
DROP TABLE IF EXISTS applications;

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

-- Applications table
CREATE TABLE applications (
  App_Acronym VARCHAR(50) NOT NULL,
  App_Description VARCHAR(255) NOT NULL,
  App_Rnumber INT(11) NOT NULL DEFAULT 0,
  App_startDate DATE NOT NULL,
  App_endDate DATE NOT NULL,
  App_permit_Create JSON NOT NULL,
  App_permit_Open JSON NOT NULL,
  App_permit_ToDo JSON NOT NULL,
  App_permit_Doing JSON NOT NULL,
  App_permit_Done JSON NOT NULL,
  PRIMARY KEY (App_Acronym)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Plans table
CREATE TABLE plans (
  Plan_MVP_name VARCHAR(50) NOT NULL,
  Plan_startDate DATE NOT NULL,
  Plan_endDate DATE NOT NULL,
  Plan_app_acronym VARCHAR(50) NOT NULL,
  PRIMARY KEY (Plan_MVP_name),
  FOREIGN KEY (Plan_app_acronym) REFERENCES applications(App_Acronym)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Tasks table
CREATE TABLE tasks (
  Task_name VARCHAR(50) NOT NULL,
  Task_description VARCHAR(255) NOT NULL,
  Task_notes JSON NOT NULL,
  Task_id VARCHAR(50) NOT NULL,
  Task_plan VARCHAR(50),
  Task_app_acronym VARCHAR(50) NOT NULL,
  Task_state ENUM('Open', 'ToDo', 'Doing', 'Done', 'Closed') NOT NULL,
  Task_creator VARCHAR(50) NOT NULL,
  Task_owner VARCHAR(50) NOT NULL,
  Task_createDate DATE NOT NULL,
  PRIMARY KEY (Task_id),
  FOREIGN KEY (Task_plan) REFERENCES plans(Plan_MVP_name),
  FOREIGN KEY (Task_app_acronym) REFERENCES applications(App_Acronym)
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
  ('figurehead', 'fig@fig.com', '$2b$12$19OLvcSNPJU9sWnJWrr/Lu2rkPXnFNFREzgXlAz177uUhYr1ZfOIy', 1, '["admin", "project lead", "project manager", "dev team"]'),
  ('pm',    'pm@example.com',    '$2b$10$mGy56GwtDPtNCH6//jgA8.y2Uv/w/.CNZAhFjiWVaEiItHjXSPoUm',    1, '["project manager"]'),
  ('user',  'user@example.com',  '$2b$10$JVZimuEKi1ShfrK/n.xFz.iZYEZxT/K6YQtvGJ5wjxCn5IU8Ss49u',  1, '["dev team"]'),
  ('inactive', 'null@null.com', '$2b$12$JC407angGDbdviFYAgefXed8evLSrx5zMbInSyunzALggKjLUa0Ei', 0, '["dev team"]');

-- Seed applications
INSERT INTO applications (App_Acronym, App_Description, App_Rnumber, App_startDate, App_endDate, App_permit_Create, App_permit_Open, App_permit_ToDo, App_permit_Doing, App_permit_Done) VALUES
  ('Project A', 'first app yay', 0, '2022-01-01', '2022-01-31', '["project lead"]', '["project manager"]', '["project manager", "dev team"]', '["dev team"]', '["project lead"]'),
  ('pipedream', 'someones pipedream', 1, '2022-02-01', '2022-02-28', '["project lead"]', '["project manager"]', '["project manager", "dev team"]', '["dev team"]', '["project lead"]');

-- Seed plans
INSERT INTO plans (Plan_MVP_name, Plan_startDate, Plan_endDate, Plan_app_acronym) VALUES
  ('do init', '2022-01-01', '2022-01-14', 'Project A'),
  ('start frontend', '2022-01-15', '2022-02-21', 'Project A'),
  ('start backend', '2022-02-22', '2022-03-28', 'Project A'),
  ('init pipedream', '2022-03-29', '2022-04-05', 'pipedream');

-- Seed tasks
-- INSERT INTO tasks (Task_name, Task_description, Task_notes, Task_id, Task_plan, Task_app_acronym, Task_state, Task_creator, Task_owner, Task_createDate) VALUES
--   ('init', 'init', '{}', '0', 'do init', 'Project A', 'Open', 'pm', 'pm', '2022-01-01'),
--   ('init', 'init', '{}', '1', 'do init', 'Project A', 'Open', 'pm', 'pm', '2022-01-01'),
--   ('init', 'init', '{}', '2', 'do init', 'Project A', 'Open', 'pm', 'pm', '2022-01-01');
