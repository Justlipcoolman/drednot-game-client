// puppeteer-bot.js (FINAL VERSION w/ AUTO-REJOIN)

const puppeteer = require('puppeteer-core');
const express = require('express');

// --- CONFIGURATION ---
const BOT_SERVER_URL = process.env.BOT_SERVER_URL;
const API_KEY = 'drednot123';
const MESSAGE_DELAY = 1200;
const ZWSP = '\u200B';
// NEW: Inactivity configuration
const INACTIVITY_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

if (!BOT_SERVER_URL) {
    console.error("CRITICAL: BOT_SERVER_URL environment variable is not set!");
    process.exit(1);
}

let page;
let browser; // Make browser a global variable
let inactivityTimer; // NEW: Timer for rejoin logic

// --- HELPER FUNCTIONS ---
async function queueReply(message) { /* ... NO CHANGES IN THIS FUNCTION ... */
    const MAX_CONTENT_LENGTH = 199;
    const splitLongMessage = (line) => {
        const chunks = []; const strLine = String(line); if (strLine.length <= MAX_CONTENT_LENGTH) { chunks.push(strLine); return chunks; }
        let remainingText = strLine;
        while (remainingText.length > 0) {
            if (remainingText.length <= MAX_CONTENT_LENGTH) { chunks.push(remainingText); break; }
            let breakPoint = remainingText.lastIndexOf(' ', MAX_CONTENT_LENGTH); if (breakPoint <= 0) breakPoint = MAX_CONTENT_LENGTH;
            chunks.push(remainingText.substring(0, breakPoint).trim()); remainingText = remainingText.substring(breakPoint).trim();
        } return chunks;
    };
    const linesToProcess = Array.isArray(message) ? message : [message];
    linesToProcess.forEach(singleLine => {
        const messageChunks = splitLongMessage(singleLine);
        messageChunks.forEach(chunk => {
            if (chunk) { messageQueue.push(ZWSP + chunk); }
        });
    });
    if (!isProcessingQueue) processQueue();
}

async function processQueue() { /* ... NO CHANGES IN THIS FUNCTION ... */
    if (messageQueue.length === 0) { isProcessingQueue = false; return; }
    isProcessingQueue = true; const message = messageQueue.shift();
    try {
        await page.evaluate((msg) => {
            const chatBox = document.getElementById("chat"); const chatInp = document.getElementById("chat-input"); const chatBtn = document.getElementById("chat-send");
            if (chatBox?.classList.contains('closed')) { chatBtn?.click(); }
            if (chatInp) { chatInp.value = msg; }
            chatBtn?.click();
        }, message);
        console.log(`[BOT-SENT] ${message.substring(1)}`);
    } catch (error) { console.error(`Error sending message. Error: ${error.message}`); }
    setTimeout(processQueue, MESSAGE_DELAY);
}

async function processRemoteCommand(command, username, args) {
    // NEW: Reset the inactivity timer every time a command is processed
    resetInactivityTimer();
    console.log(`[BOT-RECV] !${command} from ${username}`);
    try {
        const response = await fetch(BOT_SERVER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
            body: JSON.stringify({ command, username, args })
        });
        const data = await response.json();
        if (data.reply) { queueReply(data.reply); }
    } catch (error) { console.error("[API-ERROR] Failed to contact economy server:", error); }
}

// --- NEW REJOIN AND RESTART FUNCTIONS ---
function rejoinOnInactivity() {
    console.log(`[REJOIN] No activity for ${INACTIVITY_TIMEOUT_MS / 60000} minutes. Restarting bot...`);
    // Trigger a full, clean restart
    restartBot("Inactivity detected");
}

function resetInactivityTimer() {
    clearTimeout(inactivityTimer); // Clear the previous timer
    inactivityTimer = setTimeout(rejoinOnInactivity, INACTIVITY_TIMEOUT_MS); // Set a new one
    // console.log("Inactivity timer has been reset."); // Uncomment for debugging
}

async function restartBot(reason) {
    console.log(`[SYSTEM] Restarting bot. Reason: ${reason}`);
    clearTimeout(inactivityTimer);
    if (browser) {
        try {
            await browser.close();
        } catch (e) {
            console.warn("Could not close browser during restart, it might have already crashed.");
        }
    }
    // Wait a few seconds before starting again to avoid spamming restarts
    setTimeout(startBot, 5000);
}


// --- MAIN BOT LOGIC ---
async function startBot() {
    console.log("Launching headless browser... This may take a moment.");
    try {
        browser = await puppeteer.launch({
            executablePath: '/usr/bin/chromium',
            headless: "new",
            timeout: 60000,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
        });
        page = await browser.newPage();
        console.log("Navigating to Drednot.io invite link...");
        await page.goto('https://drednot.io/invite/wQcS5UHUS5wkGVCKvSDyTMa_', { waitUntil: 'networkidle2', timeout: 60000 });
        console.log("Page loaded. Looking for initial pop-ups...");
        try {
            await page.waitForSelector('.modal-container .btn-green', { timeout: 10000 });
            await page.click('.modal-container .btn-green');
            console.log("Clicked 'Accept' on the notice.");
            const playAnonymouslyButton = await page.waitForSelector('xpath///button[contains(., "Play Anonymously")]', { timeout: 10000 });
            await playAnonymouslyButton.click();
            console.log("Clicked 'Play Anonymously'.");
        } catch (e) {
            console.log("No initial pop-ups found, or already in game. Continuing...");
        }
        await page.waitForSelector('#chat-input', { timeout: 60000 });
        console.log("✅ Guest joined successfully! Bot is in-game.");
        queueReply("In-Game Client Online.");
        
        // NEW: Start the inactivity timer for the first time
        resetInactivityTimer();

        await page.exposeFunction('onCommandDetected', processRemoteCommand);
        await page.evaluate((ZWSP) => { /* ... NO CHANGES IN THIS FUNCTION ... */
            const chatContent = document.getElementById("chat-content");
            const allCommands = ["bal", "balance", "craft", "cs", "csb", "crateshopbuy", "daily", "eat", "flip", "gather", "info", "inv", "inventory", "lb", "leaderboard", "m", "market", "marketbuy", "marketcancel", "marketsell", "mb", "mc", "ms", "n", "next", "p", "pay", "previous", "recipes", "slots", "smelt", "timers", "traitroll", "traits", "verify", "work"];
            const observer = new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === 1 && node.tagName === "P") {
                            const pText = node.textContent || ""; if (pText.startsWith(ZWSP)) return;
                            const colonIdx = pText.indexOf(':'); if (colonIdx === -1) return;
                            const bdiElement = node.querySelector("bdi"); if (!bdiElement) return;
                            let msgTxt = pText.substring(colonIdx + 1).trim();
                            if (msgTxt.startsWith('!')) {
                                let username = bdiElement.innerText.trim();
                                const parts = msgTxt.slice(1).trim().split(/ +/); const command = parts.shift().toLowerCase(); const args = parts;
                                if (allCommands.includes(command)) { window.onCommandDetected(command, username, args); }
                            }
                        }
                    });
                });
            });
            observer.observe(chatContent, { childList: true, subtree: true });
            console.log("In-page chat monitor has been activated.");
        }, ZWSP);
    } catch (error) {
        // MODIFIED: Use the new restart function for consistency
        restartBot(`A critical error occurred: ${error.message}`);
    }
}

// --- WEB SERVER FOR UPTIME ROBOT ---
const app = express();
const PORT = process.env.PORT || 8000;
app.get('/', (req, res) => {
  console.log("Ping received! Keeping the service alive.");
  res.status(200).send('Bot client is alive and running.');
});
app.listen(PORT, () => {
  console.log(`Health check server listening on port ${PORT}`);
  startBot();
});
