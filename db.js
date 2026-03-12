const { Pool } = require('pg');
require('dotenv').config(); // This line is crucial so it can read your .env file!

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // This tells Node it is safe to connect to Neon
    }
});

module.exports = pool;