// puppeteer-bot.js (Complete Uptime Robot Version)

const puppeteer = require('puppeteer');
const { join } = require('path');
const express = require('express'); // For the web server

// --- CONFIGURATION ---
const BOT_SERVER_URL = process.env.BOT_SERVER_URL;
const API_KEY = 'drednot123';
const MESSAGE_DELAY = 1200;

if (!BOT_SERVER_URL) {
    console.error("CRITICAL: BOT_SERVER_URL environment variable is not set!");
    process.exit(1);
}

let page;
let messageQueue = [];
let isProcessingQueue = false;

// --- HELPER FUNCTIONS ---

async function queueReply(message) {
    const MAX_LENGTH = 199;
    const lines = Array.isArray(message) ? message : [message];
    lines.forEach(line => {
        let remaining = String(line);
        while (remaining.length > 0) {
            messageQueue.push(remaining.substring(0, MAX_LENGTH));
            remaining = remaining.substring(MAX_LENGTH);
        }
    });
    if (!isProcessingQueue) processQueue();
}

async function processQueue() {
    if (messageQueue.length === 0) {
        isProcessingQueue = false;
        return;
    }
    isProcessingQueue = true;
    const message = messageQueue.shift();
    try {
        await page.type('#chat-input', message, { delay: 20 });
        await page.click('#chat-send');
        console.log(`[BOT-SENT] ${message}`);
    } catch (error) {
        console.error(`Error sending message: "${message}". Error: ${error.message}`);
    }
    setTimeout(processQueue, MESSAGE_DELAY);
}

async function processRemoteCommand(command, username, args) {
    console.log(`[BOT-RECV] !${command} from ${username}`);
    try {
        const response = await fetch(BOT_SERVER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
            body: JSON.stringify({ command, username, args })
        });
        const data = await response.json();
        if (data.reply) {
            queueReply(data.reply);
        }
    } catch (error) {
        console.error("[API-ERROR] Failed to contact economy server:", error);
    }
}

// --- MAIN BOT LOGIC ---

async function startBot() {
    console.log("Launching headless browser... This may take a moment.");
    let browser;
    try {
        // This launch configuration is the one that works on Koyeb/Render
        const executablePath = join(
            __dirname, '.cache', 'puppeteer', 'chrome', 'linux-127.0.6533.88', 'chrome-linux64', 'chrome'
        );
        console.log(`Attempting to launch Chrome from: ${executablePath}`);
        
        browser = await puppeteer.launch({
            executablePath: executablePath,
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });

        page = await browser.newPage();
        console.log("Navigating to Drednot.io...");
        await page.goto('https://drednot.io/', { waitUntil: 'networkidle2' });
        console.log("Page loaded. Looking for initial pop-ups...");

        // Click through the welcome/login modals
        console.log("Looking for the 'NOTICE' accept button...");
        await page.waitForSelector('.modal-container .btn-green', { timeout: 10000 });
        await page.click('.modal-container .btn-green');
        console.log("Clicked 'Accept' on the notice.");

        console.log("Looking for the 'Play Anonymously' button...");
        const playAnonymouslyButton = await page.waitForXPath("//button[contains(., 'Play Anonymously')]", { timeout: 10000 });
        await playAnonymouslyButton.click();
        console.log("Clicked 'Play Anonymously'. Modals cleared.");
        
        console.log("Waiting for game interface to load...");
        await page.waitForSelector('#chat-input', { timeout: 60000 });
        
        console.log("✅ Guest joined successfully! Bot is in-game.");
        queueReply("In-Game Client Online.");

        await page.exposeFunction('onCommandDetected', processRemoteCommand);

        // Inject the chat monitor
        await page.evaluate(() => {
            const chatContent = document.getElementById("chat-content");
            const allCommands = ["bal","balance","craft","cs","csb","crateshopbuy","daily","eat","flip","gather","info","inv","inventory","lb","leaderboard","m","market","marketbuy","marketcancel","marketsell","mb","mc","ms","n","next","p","pay","previous","recipes","slots","smelt","timers","traitroll","traits","verify","work"];

            const observer = new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === 1 && node.tagName === "P") {
                            const pText = node.textContent || "";
                            const colonIdx = pText.indexOf(':');
                            if (colonIdx === -1) return;
                            const bdiElement = node.querySelector("bdi");
                            if (!bdiElement) return;
                            let msgTxt = pText.substring(colonIdx + 1).trim();
                            if (msgTxt.startsWith('!')) {
                                let username = bdiElement.innerText.trim();
                                const parts = msgTxt.slice(1).trim().split(/ +/);
                                const command = parts.shift().toLowerCase();
                                const args = parts;
                                if (allCommands.includes(command)) {
                                    window.onCommandDetected(command, username, args);
                                 }
                            }
                        }
                    });
                });
            });
            observer.observe(chatContent, { childList: true, subtree: true });
            console.log("In-page chat monitor has been activated.");
        });

    } catch (error) {
        console.error("❌ A critical error occurred during bot startup:", error.message);
        if (browser) await browser.close();
        console.log("Bot will attempt to restart in 1 minute...");
        setTimeout(startBot, 60000);
    }
}

// --- WEB SERVER FOR UPTIME ROBOT ---

const app = express();
const PORT = process.env.PORT || 8000; // Koyeb provides the PORT variable automatically

// This is the endpoint Uptime Robot will hit.
app.get('/', (req, res) => {
  console.log("Ping received! Keeping the service alive.");
  res.status(200).send('Bot client is alive and running.');
});

// Start the web server and then start the bot logic.
app.listen(PORT, () => {
  console.log(`Health check server listening on port ${PORT}`);
  startBot();
});
