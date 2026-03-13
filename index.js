require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./db'); // Pulling in your Neon database connection

const app = express();

// 1. MIDDLEWARE (The Gatekeepers)
// This line right here is the magic key that allows your React app to talk to Render
app.use(cors()); 
app.use(express.json());

// 2. ROUTES
// Health Check Route (To verify the server is awake)
app.get('/', (req, res) => {
  res.send('✅ KDEB Coffee Backend is Live on Render!');
});

// Menu Route (Fetching your Caffe Lattes and Matcha Green Teas)
app.get('/api/menu', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM menu'); 
    res.json(result.rows);
  } catch (err) {
    console.error("Database error:", err.message);
    res.status(500).json({ error: "Failed to load menu" });
  }
});

// Add your other routes below here (Orders, etc.)
// ...

// 3. START THE ENGINE
// This tells the server to use Render's dynamic port, or fallback to 3001 locally
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ KDEB Coffee Server is awake and running on port ${PORT}`);
});