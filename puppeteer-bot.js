// puppeteer-bot.js (FINAL VERSION w/ USERSCRIPT LOGIC)

const puppeteer = require('puppeteer-core');
const express = require('express');

// --- CONFIGURATION ---
const BOT_SERVER_URL = process.env.BOT_SERVER_URL;
const API_KEY = 'drednot123';
const MESSAGE_DELAY = 1200; // Increased delay slightly for stability
const ZWSP = '\u200B'; // Zero-Width Space to prevent self-triggering

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

    // THE FIX: Adopting the more robust message splitting from the userscript
    const splitLongMessage = (line) => {
        const chunks = [];
        const strLine = String(line);
        if (strLine.length <= MAX_LENGTH) {
            chunks.push(strLine);
            return chunks;
        }
        let remainingText = strLine;
        while (remainingText.length > 0) {
            if (remainingText.length <= MAX_LENGTH) {
                chunks.push(remainingText);
                break;
            }
            let breakPoint = remainingText.lastIndexOf(' ', MAX_LENGTH);
            if (breakPoint <= 0) breakPoint = MAX_LENGTH;
            chunks.push(remainingText.substring(0, breakPoint).trim());
            remainingText = remainingText.substring(breakPoint).trim();
        }
        return chunks;
    };

    const linesToProcess = Array.isArray(message) ? message : [message];
    linesToProcess.forEach(singleLine => {
        const messageChunks = splitLongMessage(singleLine);
        messageChunks.forEach(chunk => {
            if (chunk) {
                // THE FIX: Adding the Zero-Width-Space prefix to our messages
                messageQueue.push(ZWSP + chunk);
            }
        });
    });

    if (!isProcessingQueue) processQueue();
}

async function processQueue() {
    if (messageQueue.length === 0) { isProcessingQueue = false; return; }
    isProcessingQueue = true;
    const message = messageQueue.shift();

    try {
        // THE FIX: Replicating the userscript's send logic
        // 1. Check if chat is closed
        const isChatClosed = await page.evaluate(() => {
            const chatBox = document.querySelector('#chat');
            return chatBox ? chatBox.classList.contains('closed') : false;
        });

        // 2. If it's closed, click send once to open it
        if (isChatClosed) {
            await page.click('#chat-send');
            await new Promise(resolve => setTimeout(resolve, 100)); // Short delay for UI
        }

        // 3. Directly set the input value
        await page.evaluate((msg) => {
            const chatInput = document.querySelector('#chat-input');
            if (chatInput) chatInput.value = msg;
        }, message);

        // 4. Click send to submit the message
        await page.click('#chat-send');
        console.log(`[BOT-SENT] ${message.substring(1)}`); // Log without the ZWSP

    } catch (error) {
        console.error(`Error sending message. Error: ${error.message}`);
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
        if (data.reply) { queueReply(data.reply); }
    } catch (error) { console.error("[API-ERROR] Failed to contact economy server:", error); }
}

// --- MAIN BOT LOGIC ---
async function startBot() {
    console.log("Launching headless browser... This may take a moment.");
    let browser;
    try {
        browser = await puppeteer.launch({
            executablePath: '/usr/bin/chromium',
            headless: "new",
            timeout: 60000,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
        });

        page = await browser.newPage();
        // THE FIX: The new URL with your invite code
        console.log("Navigating to Drednot.io invite link...");
        await page.goto('https://drednot.io/invite/wQcS5UHUS5wkGVCKvSDyTMa_', { waitUntil: 'networkidle2', timeout: 60000 });
        console.log("Page loaded. Looking for initial pop-ups...");

        // This part is for the initial cookie/notice pop-ups
        try {
            await page.waitForSelector('.modal-container .btn-green', { timeout: 10000 });
            await page.click('.modal-container .btn-green');
            console.log("Clicked 'Accept' on the notice.");

            const playAnonymouslyButton = await page.waitForSelector('xpath///button[contains(., "Play Anonymously")]', { timeout: 10000 });
            await playAnonymouslyButton.click();
            console.log("Clicked 'Play Anonymously'.");
        } catch(e) {
            console.log("No initial pop-ups found, or already in game. Continuing...");
        }

        await page.waitForSelector('#chat-input', { timeout: 60000 });
        console.log("✅ Guest joined successfully! Bot is in-game.");
        queueReply("In-Game Client Online.");

        await page.exposeFunction('onCommandDetected', processRemoteCommand);

        // Chat monitor code
        await page.evaluate((ZWSP) => {
            const chatContent = document.getElementById("chat-content");
            const allCommands = ["bal","balance","craft","cs","csb","crateshopbuy","daily","eat","flip","gather","info","inv","inventory","lb","leaderboard","m","market","marketbuy","marketcancel","marketsell","mb","mc","ms","n","next","p","pay","previous","recipes","slots","smelt","timers","traitroll","traits","verify","work"];
            const observer = new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === 1 && node.tagName === "P") {
                            const pText = node.textContent || "";
                            if (pText.startsWith(ZWSP)) return; // Ignore our own ZWSP-prefixed messages

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
                                if (allCommands.includes(command)) { window.onCommandDetected(command, username, args); }
                            }
                        }
                    });
                });
            });
            observer.observe(chatContent, { childList: true, subtree: true });
            console.log("In-page chat monitor has been activated.");
        }, ZWSP); // Pass ZWSP into the evaluate function

    } catch (error) {
        console.error("❌ A critical error occurred during bot startup:", error);
        if (browser) await browser.close();
        console.log("Bot will attempt to restart in 1 minute...");
        setTimeout(startBot, 60000);
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
