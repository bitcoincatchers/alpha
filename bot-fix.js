/**
 * REAL Telegram Bot for AlphaBot
 * This bot will listen to your Telegram messages and detect trading signals
 */

const { Telegraf } = require('telegraf');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database setup
const dbPath = path.join(__dirname, 'signals.db');
const db = new sqlite3.Database(dbPath);

// Initialize database
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS signals (
        id TEXT PRIMARY KEY,
        token_symbol TEXT,
        token_contract TEXT,
        signal_type TEXT DEFAULT 'BUY',
        confidence_score REAL DEFAULT 0.8,
        entry_mc INTEGER,
        raw_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        kol_name TEXT,
        chart_link TEXT,
        status TEXT DEFAULT 'active',
        roi_percentage INTEGER DEFAULT NULL,
        dexscreener_link TEXT DEFAULT NULL
    )`);
});

// Bot configuration
let bot = null;
let BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

console.log('🤖 AlphaBot Telegram Listener Starting...');
console.log('📁 Database path:', dbPath);

// NEW: Function to detect ROI updates from replies
function detectROIUpdate(message, replyToMessage = null) {
    console.log('💰 Checking for ROI update in message:', message.substring(0, 50));
    
    // Strategy 1: Look for "Nx" pattern with token symbol in same message
    const combinedMatch = message.match(/(\d+(?:\.\d+)?)\s*x.*\$([A-Za-z0-9]{1,20})/i) || 
                         message.match(/\$([A-Za-z0-9]{1,20}).*(\d+(?:\.\d+)?)\s*x/i);
    
    if (combinedMatch) {
        let multiplier, tokenSymbol;
        
        if (combinedMatch[2] && isNaN(combinedMatch[2])) {
            multiplier = parseFloat(combinedMatch[1]);
            tokenSymbol = combinedMatch[2].toUpperCase();
        } else {
            multiplier = parseFloat(combinedMatch[2]);
            tokenSymbol = combinedMatch[1].toUpperCase();
        }
        
        const roiPercentage = Math.round((multiplier - 1) * 100);
        console.log(`💰 ROI detected (combined): ${multiplier}x for $${tokenSymbol} = ${roiPercentage}% ROI`);
        return { tokenSymbol, roiPercentage };
    }
    
    // Strategy 2: Look for just "Nx" pattern (like "x5") and try to find token from reply or recent signals
    const simpleMatch = message.match(/x?(\d+(?:\.\d+)?)\s*x?/i);
    
    if (simpleMatch && (message.toLowerCase().includes('x') || parseFloat(simpleMatch[1]) > 1)) {
        const multiplier = parseFloat(simpleMatch[1]);
        
        // Skip if multiplier is too small (probably not ROI)
        if (multiplier < 1.1) {
            return null;
        }
        
        let tokenSymbol = null;
        
        // Try to get token from replied message
        if (replyToMessage) {
            const replyTokenMatch = replyToMessage.match(/\$([A-Za-z0-9]{1,20})/);
            if (replyTokenMatch) {
                tokenSymbol = replyTokenMatch[1].toUpperCase();
                console.log(`💰 Found token from reply: $${tokenSymbol}`);
            }
        }
        
        // If no token from reply, get most recent signal from database
        if (!tokenSymbol) {
            console.log('💰 No token in reply, will use most recent signal');
            // Return special object to indicate we need to find most recent token
            const roiPercentage = Math.round((multiplier - 1) * 100);
            return { tokenSymbol: 'RECENT', roiPercentage, multiplier };
        }
        
        const roiPercentage = Math.round((multiplier - 1) * 100);
        console.log(`💰 ROI detected (simple): ${multiplier}x for $${tokenSymbol} = ${roiPercentage}% ROI`);
        return { tokenSymbol, roiPercentage };
    }
    
    return null;
}

// NEW: Function to update ROI for a signal
function updateSignalROI(tokenSymbol, roiPercentage) {
    return new Promise((resolve, reject) => {
        let query, params;
        
        if (tokenSymbol === 'RECENT') {
            // Update most recent signal regardless of token
            query = `
                UPDATE signals 
                SET roi_percentage = ? 
                WHERE id = (
                    SELECT id FROM signals 
                    ORDER BY created_at DESC 
                    LIMIT 1
                )
            `;
            params = [roiPercentage];
            console.log(`💰 Updating ROI for most recent signal: ${roiPercentage}%`);
        } else {
            // Update most recent signal for specific token
            query = `
                UPDATE signals 
                SET roi_percentage = ? 
                WHERE token_symbol = ? 
                AND id = (
                    SELECT id FROM signals 
                    WHERE token_symbol = ? 
                    ORDER BY created_at DESC 
                    LIMIT 1
                )
            `;
            params = [roiPercentage, tokenSymbol, tokenSymbol];
            console.log(`💰 Updating ROI for $${tokenSymbol}: ${roiPercentage}%`);
        }
        
        const stmt = db.prepare(query);
        
        stmt.run(params, function(err) {
            if (err) {
                console.error('❌ Error updating ROI:', err);
                reject(err);
            } else if (this.changes > 0) {
                // Get the updated signal info
                db.get('SELECT token_symbol FROM signals ORDER BY created_at DESC LIMIT 1', (err, row) => {
                    if (err) {
                        console.error('❌ Error getting updated signal:', err);
                        resolve({ tokenSymbol: tokenSymbol === 'RECENT' ? 'RECENT' : tokenSymbol, roiPercentage });
                    } else {
                        const actualTokenSymbol = row ? row.token_symbol : (tokenSymbol === 'RECENT' ? 'RECENT' : tokenSymbol);
                        console.log(`✅ ROI updated for $${actualTokenSymbol}: ${roiPercentage}%`);
                        resolve({ tokenSymbol: actualTokenSymbol, roiPercentage });
                    }
                });
            } else {
                console.log(`⚠️ No signal found to update ROI`);
                resolve(null);
            }
        });
        
        stmt.finalize();
    });
}

function detectTradingSignal(message) {
    console.log('🔍 STRICT analyzing message for trading signals...');
    console.log('📝 Full message:', message);
    
    // STEP 1: MUST contain "trading alert" - MANDATORY for new signals
    const messageLower = message.toLowerCase();
    if (!messageLower.includes('trading alert')) {
        console.log('❌ Message does not contain "trading alert" - skipping');
        return null;
    }
    
    console.log('✅ Message contains "trading alert" - proceeding with detection');
    
    // STEP 2: Find token symbol - Must start with $
    let tokenSymbol = null;
    
    // Look for $TOKEN pattern
    const tokenMatch = message.match(/\$([A-Za-z0-9]{1,20})/);
    
    if (tokenMatch) {
        tokenSymbol = tokenMatch[1].toUpperCase();
        console.log(`✅ Token found: $${tokenSymbol}`);
    } else {
        console.log('❌ No token symbol with $ found');
        return null;
    }
    
    // STEP 3: Find contract address after "CA:" 
    let tokenContract = null;
    
    // Look for "CA:" followed by contract address
    const caMatch = message.match(/CA:\s*([A-Za-z0-9]{32,50})/i);
    
    if (caMatch) {
        tokenContract = caMatch[1].trim();
        console.log(`✅ Contract found after CA: ${tokenContract}`);
    } else {
        // Fallback: look for any long alphanumeric string that could be a contract
        const contractMatches = message.match(/\b[A-Za-z0-9]{32,50}\b/g);
        if (contractMatches && contractMatches.length > 0) {
            for (const contract of contractMatches) {
                // Filter out URLs and false positives
                if (!contract.includes('http') && 
                    !contract.includes('www') && 
                    !contract.includes('.com') &&
                    !contract.includes('dexscreener') &&
                    !contract.includes('dextools')) {
                    tokenContract = contract;
                    console.log(`✅ Contract found (fallback): ${contract}`);
                    break;
                }
            }
        }
        
        if (!tokenContract) {
            console.log('⚠️ No contract address found');
        }
    }
    
    // STEP 4: Find entry price after "entry price:"
    let entryPrice = null;
    
    // Look for "entry price:" followed by value with mc
    const entryMatch = message.match(/entry\s+price:\s*(\d+(?:\.\d+)?)\s*([kmKM]?)\s*mc/i);
    
    if (entryMatch) {
        const value = parseFloat(entryMatch[1]);
        const multiplier = entryMatch[2]?.toLowerCase();
        
        if (multiplier === 'k') {
            entryPrice = value * 1000;
        } else if (multiplier === 'm') {
            entryPrice = value * 1000000;
        } else {
            entryPrice = value;
        }
        
        console.log(`✅ Entry price found: ${entryPrice} (${entryMatch[0]})`);
    } else {
        console.log('⚠️ No entry price found after "entry price:"');
    }
    
    // STEP 5: Extract DexScreener link (optional)
    let dexscreenerLink = null;
    const linkMatch = message.match(/https:\/\/dexscreener\.com\/[^\s]+/i);
    if (linkMatch) {
        dexscreenerLink = linkMatch[0];
        console.log(`✅ DexScreener link found: ${dexscreenerLink}`);
    }
    
    // STEP 6: Create signal only if we have required fields
    if (tokenSymbol && tokenContract && entryPrice) {
        const signal = {
            id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9),
            token_symbol: tokenSymbol,
            token_contract: tokenContract,
            entry_mc: entryPrice,
            dexscreener_link: dexscreenerLink,
            raw_message: message,
            created_at: new Date().toISOString(),
            kol_name: 'Alex',
            status: 'detected'
        };
        
        console.log('📊 STRICT signal detected:', {
            symbol: signal.token_symbol,
            contract: signal.token_contract.substring(0, 20) + '...',
            entryMC: signal.entry_mc,
            link: signal.dexscreener_link ? 'Yes' : 'No'
        });
        
        return signal;
    }
    
    console.log('❌ Missing required fields for signal:', {
        hasSymbol: !!tokenSymbol,
        hasContract: !!tokenContract,
        hasEntryPrice: !!entryPrice
    });
    return null;
}

function detectTradingSignalWithReply(message, replyToMessage = null) {
    // STEP 0: Check if this is an ROI update first
    const roiUpdate = detectROIUpdate(message, replyToMessage);
    if (roiUpdate !== null) {
        console.log(`💰 ROI update detected: $${roiUpdate.tokenSymbol} = ${roiUpdate.roiPercentage}%`);
        
        // Update ROI and broadcast update
        updateSignalROI(roiUpdate.tokenSymbol, roiUpdate.roiPercentage).then((result) => {
            if (result && typeof global.broadcastNewSignal === 'function') {
                // Broadcast ROI update
                global.broadcastNewSignal({
                    type: 'roi_update',
                    token_symbol: result.tokenSymbol,
                    roi_percentage: result.roiPercentage,
                    updated_at: new Date().toISOString()
                });
            }
        });
        
        return null; // ROI updates are not new signals
    }
    
    // Continue with regular signal detection
    return detectTradingSignal(message);
}

function saveSignal(signal) {
    return new Promise((resolve, reject) => {
        const stmt = db.prepare(`
            INSERT INTO signals (id, token_symbol, token_contract, entry_mc, raw_message, created_at, kol_name, status, dexscreener_link)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        stmt.run([
            signal.id,
            signal.token_symbol,
            signal.token_contract,
            signal.entry_mc,
            signal.raw_message,
            signal.created_at,
            signal.kol_name,
            signal.status,
            signal.dexscreener_link
        ], function(err) {
            if (err) {
                console.error('❌ Database error:', err);
                reject(err);
            } else {
                console.log('✅ Signal saved to database:', signal.id);
                
                // Broadcast to connected web clients if function is available
                if (typeof global.broadcastNewSignal === 'function') {
                    try {
                        global.broadcastNewSignal(signal);
                        console.log('📡 Signal broadcasted to web clients');
                    } catch (error) {
                        console.error('❌ Error broadcasting signal:', error);
                    }
                }
                
                resolve(signal);
            }
        });
        
        stmt.finalize();
    });
}

function startBot(token) {
    if (bot) {
        console.log('🔄 Stopping existing bot...');
        bot.stop();
    }
    
    bot = new Telegraf(token);
    BOT_TOKEN = token;
    
    console.log('🚀 Starting Telegram bot...');
    
    // Listen to all messages
    bot.on('message', async (ctx) => {
        try {
            const message = ctx.message.text || ctx.message.caption || '';
            const chatId = ctx.chat.id;
            const chatTitle = ctx.chat.title || 'Direct Message';
            const from = ctx.from.first_name || ctx.from.username || 'Unknown';
            
            // Check if this is a reply to another message
            const replyToMessage = ctx.message.reply_to_message ? 
                (ctx.message.reply_to_message.text || ctx.message.reply_to_message.caption || '') : null;
            
            console.log(`📨 Message from ${from} in ${chatTitle}:`, message.substring(0, 100));
            if (replyToMessage) {
                console.log(`   ↳ Reply to:`, replyToMessage.substring(0, 100));
            }
            
            const signal = detectTradingSignalWithReply(message, replyToMessage);
            
            if (signal) {
                console.log('🎯 Signal detected and processing...');
                
                try {
                    await saveSignal(signal);
                    console.log('✅ Signal saved successfully');
                } catch (error) {
                    console.error('❌ Failed to save signal:', error);
                }
            }
            
        } catch (error) {
            console.error('❌ Error processing message:', error);
        }
    });
    
    // Start the bot
    bot.launch()
        .then(() => {
            console.log('✅ Bot is running and listening for messages!');
        })
        .catch((error) => {
            console.error('❌ Failed to start bot:', error);
        });
}

function getRecentSignals(limit = 20) {
    return new Promise((resolve, reject) => {
        db.all(
            'SELECT * FROM signals ORDER BY created_at DESC LIMIT ?',
            [limit],
            (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            }
        );
    });
}

function getBotStatus() {
    return {
        isRunning: !!bot,
        hasToken: !!BOT_TOKEN,
        uptime: bot ? 'Running' : 'Stopped',
        lastUpdate: new Date().toISOString()
    };
}

// Export functions for API integration
module.exports = {
    startBot,
    getRecentSignals,
    getBotStatus,
    detectTradingSignal,
    detectTradingSignalWithReply,
    saveSignal,
    detectROIUpdate,
    updateSignalROI
};

// If running directly, start with environment token
if (require.main === module) {
    if (BOT_TOKEN) {
        console.log('🚀 Starting bot with environment token...');
        startBot(BOT_TOKEN);
    } else {
        console.log('⚠️ No TELEGRAM_BOT_TOKEN found in environment');
        console.log('💡 Set your token: export TELEGRAM_BOT_TOKEN="your_token_here"');
        console.log('📖 Or call startBot("your_token") programmatically');
    }
}

// Graceful shutdown
process.once('SIGINT', () => {
    console.log('🛑 Shutting down bot...');
    if (bot) bot.stop('SIGINT');
    if (db) db.close();
});

process.once('SIGTERM', () => {
    console.log('🛑 Shutting down bot...');
    if (bot) bot.stop('SIGTERM');
    if (db) db.close();
});

console.log('🎯 Bot module loaded. Ready to detect signals!');