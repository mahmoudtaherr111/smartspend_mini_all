import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function migrate() {
  const url = process.env.DATABASE_URL || 'mysql://root:@localhost:3306/test';
  console.log(`Connecting to database...`);
  
  try {
    const connection = await mysql.createConnection(url);
    console.log('Connected successfully!');

    // Update users table
    try {
      console.log('Updating users table...');
      await connection.query('ALTER TABLE `users` ADD COLUMN `current_streak` int DEFAULT 0');
      await connection.query('ALTER TABLE `users` ADD COLUMN `highest_streak` int DEFAULT 0');
      await connection.query('ALTER TABLE `users` ADD COLUMN `last_streak_at` datetime');
      console.log('âœ… Added gamification columns to users table.');
    } catch(e) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        console.log('âš ï¸ Columns already exist in users table.');
      } else {
        console.log('âŒ Error updating users:', e.message);
      }
    }

    // Update local_users table
    try {
      console.log('Updating local_users table...');
      await connection.query('ALTER TABLE `local_users` ADD COLUMN `current_streak` int DEFAULT 0');
      await connection.query('ALTER TABLE `local_users` ADD COLUMN `highest_streak` int DEFAULT 0');
      await connection.query('ALTER TABLE `local_users` ADD COLUMN `last_streak_at` datetime');
      console.log('âœ… Added gamification columns to local_users table.');
    } catch(e) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        console.log('âš ï¸ Columns already exist in local_users table.');
      } else {
        console.log('âŒ Error updating local_users:', e.message);
      }
    }

    await connection.end();
    console.log('ðŸŽ‰ Database migration completed successfully!');
  } catch (err) {
    console.error('ðŸ’¥ Failed to connect or migrate:', err.message);
  }
}

migrate();
