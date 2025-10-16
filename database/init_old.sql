CREATE DATABASE IF NOT EXISTS `nodelogin` DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;
USE `nodelogin`;

DROP TABLE IF EXISTS `accounts`;
CREATE TABLE IF NOT EXISTS `accounts` (
  `id`        INT(11) NOT NULL AUTO_INCREMENT,
  `username`  VARCHAR(50)  NOT NULL,
  `password`  VARCHAR(255) NOT NULL,
  `email`     VARCHAR(100) NOT NULL,
  `userGroup` VARCHAR(50) NOT NULL,
  `active`    TINYINT(1)   NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_accounts_username` (`username`),
  UNIQUE KEY `uq_accounts_email`    (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

DROP TABLE IF EXISTS `userGroups`;
CREATE TABLE IF NOT EXISTS `userGroups` (
  `groupName` VARCHAR(50)  NOT NULL,
  PRIMARY KEY (`groupName`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
INSERT INTO `userGroups` (`groupName`) VALUES ('admin');
INSERT INTO `userGroups` (`groupName`) VALUES ('project_lead');
INSERT INTO `userGroups` (`groupName`) VALUES ('project_manager');
INSERT INTO `userGroups` (`groupName`) VALUES ('dev_team');


INSERT INTO `accounts` (`username`, `password`, `email`, `userGroup`, `active`)
VALUES ('user', 'user', 'test@test.com', 'dev_team', 1);

INSERT INTO `accounts` (`username`, `password`, `email`, `userGroup`, `active`)
VALUES ('admin', 'admin', 'admin@admin.com', 'admin', 1);

INSERT INTO `accounts` (`username`, `password`, `email`, `userGroup`, `active`)
VALUES ('pm', 'pm', 'blah@blah.com', 'project_manager', 1);