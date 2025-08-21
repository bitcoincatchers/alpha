/**
 * REAL Telegram Bot Runner for AlphaBot
 * This runs the actual bot that listens for trading signals
 */

const { Telegraf } = require('telegraf');
const { detectTradingSignal, saveSignal } = require('./bot.js');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
    console.error('❌ No bot token provided! Set TELEGRAM_BOT_TOKEN environment variable.');
    process.exit(1);
}

console.log('🤖 Starting AlphaBot Telegram Listener...');
console.log('🔑 Token:', BOT_TOKEN.substring(0, 10) + '...');

const bot = new Telegraf(BOT_TOKEN);

// Log all messages for debugging
bot.on('text', async (ctx) => {
    const message = ctx.message.text;
    const chatId = ctx.chat.id;
    const userName = ctx.from.username || ctx.from.first_name || 'Unknown';
    
    console.log('📨 New message from', userName, ':', message.substring(0, 100));
    
    // Try to detect trading signal
    try {
        const signal = detectTradingSignal(message);
        
        if (signal) {
            // Save to database
            saveSignal(signal);
            
            console.log('🎯 SIGNAL DETECTED AND SAVED!', {
                symbol: signal.token_symbol,
                contract: signal.token_contract ? signal.token_contract.substring(0, 20) + '...' : 'None',
                entryMC: signal.entry_mc
            });
            
            // Reply to confirm
            await ctx.reply(`🎯 Signal detected: $${signal.token_symbol}!\n\nEntry: ${signal.entry_mc ? Math.round(signal.entry_mc/1000) + 'K MC' : 'Unknown'}\nContract: ${signal.token_contract ? signal.token_contract.substring(0, 20) + '...' : 'None'}\n\n✅ Saved to AlphaBot database!`);
        } else {
            console.log('ℹ️ No signal detected in message');
        }
    } catch (error) {
        console.error('❌ Error processing message:', error);
    }
});

// Handle bot start
bot.start((ctx) => {
    ctx.reply(`🤖 AlphaBot is now active!
    
🎯 I'm monitoring this chat for trading signals.

📝 Send messages in this format:
trading alert: $TOKEN

CA: contract_address

Link: https://dexscreener.com/...

entry price: 100k mc

🚀 Signals will appear instantly on your dashboard!`);
});

// Error handling
bot.catch((err, ctx) => {
    console.error('❌ Bot error:', err);
});

// Start the bot
async function startBot() {
    try {
        console.log('🚀 Launching bot...');
        
        // Test bot token
        const me = await bot.telegram.getMe();
        console.log('✅ Bot connected:', me.username);
        
        // Start polling
        await bot.launch();
        console.log('🎯 Bot is now listening for messages!');
        console.log('📱 Send test message: "trading alert: $TEST\\n\\nCA: 5zTaLo9GKKLheAdHc28uJ4nBkemvskfjsjLyz9oFx4Dv\\n\\nentry price: 100k mc"');
        
        // Graceful shutdown
        process.once('SIGINT', () => bot.stop('SIGINT'));
        process.once('SIGTERM', () => bot.stop('SIGTERM'));
        
    } catch (error) {
        console.error('❌ Failed to start bot:', error.message);
        
        if (error.message.includes('401')) {
            console.error('🔑 Invalid bot token! Please check your token from @BotFather');
        }
        
        process.exit(1);
    }
}

startBot();