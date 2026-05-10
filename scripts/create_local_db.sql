-- Create local database and user matching .env (DATABASE_URL)
-- Run this on your machine with a MySQL root/admin user:
--   mysql -u root -p < scripts/create_local_db.sql

CREATE DATABASE IF NOT EXISTS `test` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Replace 'user' and 'password' below if you prefer different credentials.
CREATE USER IF NOT EXISTS 'user'@'localhost' IDENTIFIED BY 'password';
GRANT ALL PRIVILEGES ON `test`.* TO 'user'@'localhost';
FLUSH PRIVILEGES;

-- Optional: verify
-- SHOW GRANTS FOR 'user'@'localhost';
