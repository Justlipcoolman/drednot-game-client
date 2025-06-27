// puppeteer-bot.js (Uptime Robot Version)

const puppeteer = require('puppeteer');
const { join } = require('path');
const express = require('express'); // <-- ADD THIS LINE

// ... (All your existing configuration and functions are UNCHANGED) ...
const BOT_SERVER_URL = process.env.BOT_SERVER_URL;
const API_KEY = 'drednot123';
const MESSAGE_DELAY = 1200;
// ... etc.

// PASTE THE ENTIRETY OF YOUR PREVIOUS, WORKING PUPPETEER-BOT.JS SCRIPT HERE
// From the "if (!BOT_SERVER_URL)" line all the way to the end of the "startBot()" function.


// --- NEW SECTION: ADD THIS AT THE VERY BOTTOM OF THE FILE ---

// Create a simple web server
const app = express();
const PORT = process.env.PORT || 8000; // Koyeb provides a PORT environment variable

// Create a "ping" endpoint for Uptime Robot
app.get('/', (req, res) => {
  console.log("Ping received from Uptime Robot (or browser). Keeping alive!");
  res.status(200).send('Bot client is alive and running.');
});

// Start the web server
app.listen(PORT, () => {
  console.log(`Health check server listening on port ${PORT}`);
  // Start the main bot logic AFTER the server is ready
  startBot();
});
