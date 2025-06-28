// puppeteer-bot.js (FINAL VERSION w/ SMART REJOIN & NEW HOURLY COMMAND)

const puppeteer = require('puppeteer-core');
const express = require('express');

// --- CONFIGURATION ---
const BOT_SERVER_URL = process.env.BOT_SERVER_URL;
const API_KEY = 'drednot123';
const MESSAGE_DELAY = 1200;
const ZWSP = '\u200B';
const INACTIVITY_TIMEOUT_MS = 2 * 60 * 1000;

if (!BOT_SERVER_URL) {
    console.error("CRITICAL: BOT_SERVER_URL environment variable is not set!");
    process.exit(1);
}
let messageQueue = [];
let isProcessingQueue = false;
let page;
let browser;
let inactivityTimer;
let currentShipId = null;

// --- HELPER & CORE FUNCTIONS ---
async function queueReply(message) {
    const MAX_CONTENT_LENGTH = 199;
    const splitLongMessage = (line) => { const chunks = []; const strLine = String(line); if (strLine.length <= MAX_CONTENT_LENGTH) { chunks.push(strLine); return chunks; } let remainingText = strLine; while (remainingText.length > 0) { if (remainingText.length <= MAX_CONTENT_LENGTH) { chunks.push(remainingText); break; } let breakPoint = remainingText.lastIndexOf(' ', MAX_CONTENT_LENGTH); if (breakPoint <= 0) breakPoint = MAX_CONTENT_LENGTH; chunks.push(remainingText.substring(0, breakPoint).trim()); remainingText = remainingText.substring(breakPoint).trim(); } return chunks; };
    const linesToProcess = Array.isArray(message) ? message : [message];
    linesToProcess.forEach(singleLine => { const messageChunks = splitLongMessage(singleLine); messageChunks.forEach(chunk => { if (chunk) { messageQueue.push(ZWSP + chunk); } }); });
    if (!isProcessingQueue) processQueue();
}
async function processQueue() {
    if (messageQueue.length === 0) { isProcessingQueue = false; return; } isProcessingQueue = true; const message = messageQueue.shift();
    try { await page.evaluate((msg) => { const chatBox = document.getElementById("chat"); const chatInp = document.getElementById("chat-input"); const chatBtn = document.getElementById("chat-send"); if (chatBox?.classList.contains('closed')) { chatBtn?.click(); } if (chatInp) { chatInp.value = msg; } chatBtn?.click(); }, message); console.log(`[BOT-SENT] ${message.substring(1)}`); } catch (error) { console.error(`Error sending message. Error: ${error.message}`); } setTimeout(processQueue, MESSAGE_DELAY);
}
async function processRemoteCommand(command, username, args) { resetInactivityTimer(); console.log(`[BOT-RECV] !${command} from ${username}`); try { const response = await fetch(BOT_SERVER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY }, body: JSON.stringify({ command, username, args }) }); const data = await response.json(); if (data.reply) { queueReply(data.reply); } } catch (error) { console.error("[API-ERROR] Failed to contact economy server:", error); } }

// --- RESTART/REJOIN LOGIC ---
function resetInactivityTimer() { clearTimeout(inactivityTimer); inactivityTimer = setTimeout(attemptSoftRejoin, INACTIVITY_TIMEOUT_MS); }

async function restartBot(reason) {
    console.log(`[SYSTEM] Performing a full, clean restart. Reason: ${reason}`);
    clearTimeout(inactivityTimer);
    if (browser) { try { await browser.close(); } catch (e) { /* Ignore errors */ } }
    setTimeout(startBot, 5000);
}

async function attemptSoftRejoin() {
    console.log(`[REJOIN] No activity for 2 minutes. Attempting a human-like rejoin...`);
    try {
        if (!currentShipId) {
            throw new Error("Cannot perform soft rejoin, no currentShipId is known.");
        }

        const disconnectPopup = await page.$('#disconnect-popup');
        if (disconnectPopup) {
            console.log("[REJOIN] Disconnect pop-up found. Clicking 'Return to Menu'.");
            await page.click('#disconnect-popup button');
        } else {
            console.log("[REJOIN] No disconnect pop-up. Clicking the main exit button.");
            await page.click('#exit_button');
        }

        console.log("[REJOIN] Waiting for shipyard menu...");
        await page.waitForSelector('#shipyard', { timeout: 10000 });

        console.log(`[REJOIN] Searching for ship ID: ${currentShipId}`);
        const successfullyClicked = await page.evaluate((shipId) => {
            const shipElements = document.querySelectorAll('.sy-id');
            const targetShip = Array.from(shipElements).find(el => el.textContent === shipId);
            if (targetShip) {
                targetShip.click();
                return true;
            }
            document.querySelector('#shipyard section:nth-of-type(3) .btn-small')?.click();
            return false;
        }, currentShipId);

        if (!successfullyClicked) {
            await new Promise(resolve => setTimeout(resolve, 500));
            const clickedOnSecondTry = await page.evaluate((shipId) => {
                 const shipElements = document.querySelectorAll('.sy-id');
                 const targetShip = Array.from(shipElements).find(el => el.textContent === shipId);
                 if (targetShip) {
                     targetShip.click();
                     return true;
                 }
                 return false;
            }, currentShipId);

            if (!clickedOnSecondTry) {
                 throw new Error(`Could not find ship ${currentShipId} in any list.`);
            }
        }
        
        await page.waitForSelector('#chat-input', { timeout: 60000 });
        console.log("✅ Soft rejoin successful! Back in the game.");
        resetInactivityTimer();

    } catch (error) {
        console.error(`[REJOIN] Soft rejoin failed: ${error.message}.`);
        await restartBot("Soft rejoin process failed.");
    }
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
        resetInactivityTimer();
        
        await page.exposeFunction('onCommandDetected', processRemoteCommand);
        await page.exposeFunction('onShipJoined', (shipId) => {
            if (shipId) {
                currentShipId = shipId;
                console.log(`[SYSTEM] Successfully joined ship. Stored ID: ${currentShipId}`);
            }
        });

        await page.evaluate((ZWSP) => {
            const chatContent = document.getElementById("chat-content");
            // ========================= THIS IS THE ONLY CHANGE =========================
            const allCommands = ["bal", "balance", "craft", "cs", "csb", "crateshopbuy", "daily", "eat", "flip", "gather", "hourly", "info", "inv", "inventory", "lb", "leaderboard", "m", "market", "marketbuy", "marketcancel", "marketsell", "mb", "mc", "ms", "n", "next", "p", "pay", "previous", "recipes", "slots", "smelt", "timers", "traitroll", "traits", "verify", "work"];
            // ===========================================================================
            const observer = new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === 1 && node.tagName === "P") {
                            const pText = node.textContent || "";
                            if (pText.includes("Joined ship '")) {
                                const match = pText.match(/{[A-Z\d]+}/);
                                if (match && match[0]) {
                                    window.onShipJoined(match[0]);
                                }
                            }
                            if (pText.startsWith(ZWSP)) return;
                            const colonIdx = pText.indexOf(':');
                            if (colonIdx === -1) return;
                            const bdiElement = node.querySelector("bdi");
                            if (!bdiElement) return;
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
        await restartBot(`A critical error occurred: ${error.message}`);
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
