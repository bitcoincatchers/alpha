#!/usr/bin/env node

/**
 * SIMPLE Telegram Bot Starter for AlphaBot
 * Gets your token and starts the bot IMMEDIATELY
 */

const readline = require('readline');
const { execSync } = require('child_process');
const fs = require('fs');

console.log('🚀 AlphaBot Telegram Bot Setup');
console.log('==========================================');
console.log('');

// Check if we have a stored token
let storedToken = null;
try {
    if (fs.existsSync('.bot-token')) {
        storedToken = fs.readFileSync('.bot-token', 'utf8').trim();
        console.log('📱 Found stored bot token:', storedToken.substring(0, 10) + '...');
    }
} catch (error) {
    // No stored token
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function askForToken() {
    return new Promise((resolve) => {
        console.log('🤖 TELEGRAM BOT SETUP:');
        console.log('');
        console.log('1. Open Telegram and message @BotFather');
        console.log('2. Send: /newbot');
        console.log('3. Choose a name: AlphaBot');
        console.log('4. Choose a username: alphabot_yourname_bot');
        console.log('5. Copy your token here');
        console.log('');
        
        const question = storedToken ? 
            `Enter your bot token (or press ENTER to use stored token): ` :
            `Enter your Telegram bot token: `;
            
        rl.question(question, (token) => {
            if (!token && storedToken) {
                resolve(storedToken);
            } else if (token && token.length > 20) {
                // Save token
                fs.writeFileSync('.bot-token', token);
                resolve(token);
            } else {
                console.log('❌ Invalid token. Please try again.');
                rl.close();
                askForToken().then(resolve);
            }
        });
    });
}

async function startBot() {
    try {
        const token = await askForToken();
        rl.close();
        
        console.log('');
        console.log('🔥 STARTING BOT WITH TOKEN:', token.substring(0, 10) + '...');
        console.log('');
        
        // Set environment variable and start bot
        process.env.TELEGRAM_BOT_TOKEN = token;
        
        // Start the bot directly
        require('./bot-runner.js');
        
    } catch (error) {
        console.error('❌ Error starting bot:', error);
        process.exit(1);
    }
}

// Auto-start if token provided as argument
if (process.argv[2]) {
    console.log('🚀 Auto-starting with provided token...');
    process.env.TELEGRAM_BOT_TOKEN = process.argv[2];
    require('./bot-runner.js');
} else {
    startBot();
}