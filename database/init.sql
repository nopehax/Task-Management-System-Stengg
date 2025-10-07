CREATE DATABASE IF NOT EXISTS `nodelogin` DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;
USE `nodelogin`;

DROP TABLE IF EXISTS `accounts`;
CREATE TABLE IF NOT EXISTS `accounts` (
  `id`        INT(11) NOT NULL AUTO_INCREMENT,
  `username`  VARCHAR(50)  NOT NULL,
  `password`  VARCHAR(255) NOT NULL,
  `email`     VARCHAR(100) NOT NULL,
  `userGroup` ENUM('admin','project_lead','project_manager','dev_team') NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_accounts_username` (`username`),
  UNIQUE KEY `uq_accounts_email`    (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

INSERT INTO `accounts` (`username`, `password`, `email`, `userGroup`)
VALUES ('user', 'user', 'test@test.com', 'dev_team');

INSERT INTO `accounts` (`username`, `password`, `email`, `userGroup`)
VALUES ('admin', 'admin', 'admin@admin.com', 'admin');
