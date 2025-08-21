/**
 * AlphaBot - Advanced Telegram Trading Signals Bot
 * Professional-grade signal detection and ROI tracking
 * Built for Alex - Professional Calisthenics Athlete & Crypto Educator
 */

const { Telegraf } = require('telegraf');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database setup with robust error handling
const dbPath = path.join(__dirname, 'alphabot_signals.db');
let db;

function initializeDatabase() {
    return new Promise((resolve, reject) => {
        db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('❌ Database connection error:', err.message);
                reject(err);
            } else {
                console.log('✅ Connected to SQLite database:', dbPath);
                
                // Create tables with enhanced schema
                db.serialize(() => {
                    db.run(`CREATE TABLE IF NOT EXISTS signals (
                        id TEXT PRIMARY KEY,
                        token_symbol TEXT NOT NULL,
                        token_contract TEXT,
                        signal_type TEXT DEFAULT 'BUY',
                        confidence_score REAL DEFAULT 0.8,
                        entry_mc INTEGER,
                        raw_message TEXT NOT NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        kol_name TEXT DEFAULT 'Alex',
                        chart_link TEXT,
                        status TEXT DEFAULT 'active',
                        roi_percentage INTEGER DEFAULT NULL,
                        roi_updated_at DATETIME DEFAULT NULL,
                        dexscreener_link TEXT DEFAULT NULL,
                        telegram_message_id INTEGER,
                        telegram_chat_id INTEGER,
                        detection_confidence REAL DEFAULT 1.0
                    )`, (err) => {
                        if (err) {
                            console.error('❌ Error creating signals table:', err);
                            reject(err);
                        } else {
                            console.log('✅ Signals table initialized');
                            resolve();
                        }
                    });
                });
            }
        });
    });
}

// Bot configuration
let bot = null;
let BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
let connectedChannels = new Set();
let messageStats = {
    processed: 0,
    signalsFound: 0,
    roiUpdates: 0,
    startTime: Date.now()
};

console.log('🤖 AlphaBot v2.0 - Advanced Trading Signals Bot');
console.log('📁 Database path:', dbPath);
console.log('🎯 Built for Alex - Professional Athlete & Crypto Educator');

/**
 * Advanced ROI Detection System
 * Detects various patterns: x5, 10x, $TOKEN 5x, 5x $TOKEN, etc.
 */
function detectROIUpdate(message, replyToMessage = null) {
    console.log('💰 Analyzing message for ROI update...');
    
    const msgLower = message.toLowerCase();
    
    // Strategy 1: Combined patterns with token
    const combinedPatterns = [
        /(\d+(?:\.\d+)?)\s*x.*?\$([A-Za-z0-9]{1,20})/gi,
        /\$([A-Za-z0-9]{1,20}).*?(\d+(?:\.\d+)?)\s*x/gi,
        /(\d+(?:\.\d+)?)\s*x\s+([A-Za-z0-9]{1,20})/gi,
        /([A-Za-z0-9]{1,20})\s+(\d+(?:\.\d+)?)\s*x/gi
    ];
    
    for (const pattern of combinedPatterns) {
        const matches = [...message.matchAll(pattern)];
        for (const match of matches) {
            let multiplier, tokenSymbol;
            
            // Determine which group contains the multiplier vs token
            if (isNaN(match[1])) {
                tokenSymbol = match[1].toUpperCase();
                multiplier = parseFloat(match[2]);
            } else {
                multiplier = parseFloat(match[1]);
                tokenSymbol = match[2].toUpperCase();
            }
            
            if (multiplier >= 1.1 && multiplier <= 1000) {
                const roiPercentage = Math.round((multiplier - 1) * 100);
                console.log('🎯 Combined ROI pattern detected:', { tokenSymbol, multiplier, roiPercentage });
                return { tokenSymbol, roiPercentage, multiplier, confidence: 0.95 };
            }
        }
    }
    
    // Strategy 2: Simple multiplier patterns
    const simplePatterns = [
        /(?:^|\s)x?(\d+(?:\.\d+)?)\s*x(?:\s|$|!|\?|\.)/gi,
        /(?:^|\s)(\d+(?:\.\d+)?)\s*x(?:\s|$|!|\?|\.)/gi
    ];
    
    for (const pattern of simplePatterns) {
        const matches = [...message.matchAll(pattern)];
        for (const match of matches) {
            const multiplier = parseFloat(match[1]);
            
            if (multiplier >= 1.1 && multiplier <= 1000) {
                const roiPercentage = Math.round((multiplier - 1) * 100);
                console.log('🎯 Simple ROI pattern detected:', { multiplier, roiPercentage });
                return { tokenSymbol: 'RECENT', roiPercentage, multiplier, confidence: 0.8 };
            }
        }
    }
    
    // Strategy 3: Contextual analysis for replies
    if (replyToMessage && replyToMessage.includes('$')) {
        const tokenMatch = replyToMessage.match(/\$([A-Za-z0-9]{1,20})/i);
        if (tokenMatch) {
            const numberMatch = message.match(/(\d+(?:\.\d+)?)/);
            if (numberMatch) {
                const multiplier = parseFloat(numberMatch[1]);
                if (multiplier >= 1.1 && multiplier <= 1000) {
                    const roiPercentage = Math.round((multiplier - 1) * 100);
                    console.log('🎯 Contextual ROI detected:', { 
                        tokenSymbol: tokenMatch[1].toUpperCase(), 
                        multiplier, 
                        roiPercentage 
                    });
                    return { 
                        tokenSymbol: tokenMatch[1].toUpperCase(), 
                        roiPercentage, 
                        multiplier, 
                        confidence: 0.9 
                    };
                }
            }
        }
    }
    
    return null;
}

/**
 * Enhanced Trading Signal Detection
 * Supports multiple formats and languages
 */
function detectTradingSignal(message) {
    console.log('🔍 Analyzing message for trading signals...');
    
    const msgLower = message.toLowerCase();
    
    // Enhanced trigger patterns
    const triggerPatterns = [
        'trading alert',
        'trade alert',
        'signal:',
        'call:',
        'pump alert',
        'new call',
        '📈',
        '🚀',
        '🌙'
    ];
    
    let hasTrigger = triggerPatterns.some(trigger => msgLower.includes(trigger));
    
    // Token extraction with multiple patterns
    const tokenPatterns = [
        /\$([A-Za-z0-9]{1,20})/gi,
        /token:\s*([A-Za-z0-9]{1,20})/gi,
        /symbol:\s*([A-Za-z0-9]{1,20})/gi
    ];
    
    let tokenSymbol = null;
    for (const pattern of tokenPatterns) {
        const match = message.match(pattern);
        if (match) {
            tokenSymbol = match[1].toUpperCase();
            break;
        }
    }
    
    // If no explicit trigger but has token and pricing info, might be a signal
    if (!hasTrigger && tokenSymbol) {
        const pricingKeywords = ['mc', 'market cap', 'entry', 'price', 'buy at'];
        hasTrigger = pricingKeywords.some(keyword => msgLower.includes(keyword));
    }
    
    if (!hasTrigger || !tokenSymbol) {
        return null;
    }
    
    // Contract address extraction
    const contractPatterns = [
        /(?:ca|contract|address):\s*([A-Za-z0-9]{32,})/gi,
        /([A-Za-z0-9]{32,})/g
    ];
    
    let contractAddress = null;
    for (const pattern of contractPatterns) {
        const match = message.match(pattern);
        if (match) {
            // Validate it looks like a valid contract (32+ chars, alphanumeric)
            const addr = match[1];
            if (addr.length >= 32 && /^[A-Za-z0-9]+$/.test(addr)) {
                contractAddress = addr;
                break;
            }
        }
    }
    
    // DexScreener link extraction
    const linkPatterns = [
        /(?:link|chart|dex):\s*(https:\/\/dexscreener\.com\/[^\s]+)/gi,
        /(https:\/\/dexscreener\.com\/[^\s]+)/gi
    ];
    
    let dexscreenerLink = null;
    for (const pattern of linkPatterns) {
        const match = message.match(pattern);
        if (match) {
            dexscreenerLink = match[1];
            break;
        }
    }
    
    // Market cap / Entry price extraction
    const mcPatterns = [
        /(?:entry|price|mc|market\s*cap):\s*(\d+(?:\.\d+)?)\s*([kmbt]?)\s*(?:mc|market\s*cap)?/gi,
        /(\d+(?:\.\d+)?)\s*([kmbt]?)\s*mc/gi,
        /buy\s*at\s*(\d+(?:\.\d+)?)\s*([kmbt]?)/gi
    ];
    
    let entryMC = null;
    for (const pattern of mcPatterns) {
        const match = message.match(pattern);
        if (match) {
            const baseValue = parseFloat(match[1]);
            const multiplier = match[2] ? match[2].toLowerCase() : '';
            
            switch (multiplier) {
                case 'k':
                    entryMC = Math.round(baseValue * 1000);
                    break;
                case 'm':
                    entryMC = Math.round(baseValue * 1000000);
                    break;
                case 'b':
                    entryMC = Math.round(baseValue * 1000000000);
                    break;
                case 't':
                    entryMC = Math.round(baseValue * 1000000000000);
                    break;
                default:
                    entryMC = Math.round(baseValue);
            }
            break;
        }
    }
    
    // Generate unique signal ID
    const signalId = `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    
    const signal = {
        id: signalId,
        token_symbol: tokenSymbol,
        token_contract: contractAddress,
        signal_type: 'BUY',
        confidence_score: 0.85,
        entry_mc: entryMC,
        raw_message: message,
        created_at: new Date().toISOString(),
        kol_name: 'Alex',
        chart_link: null,
        status: 'detected',
        roi_percentage: null,
        dexscreener_link: dexscreenerLink,
        detection_confidence: hasTrigger ? 0.9 : 0.7
    };
    
    console.log('🎯 Trading signal detected:', {
        token: tokenSymbol,
        contract: contractAddress?.substring(0, 12) + '...',
        entry_mc: entryMC,
        confidence: signal.detection_confidence
    });
    
    messageStats.signalsFound++;
    
    return signal;
}

/**
 * Process incoming message with context awareness
 */
function processMessage(message, replyToMessage = null, messageId = null, chatId = null) {
    try {
        messageStats.processed++;
        
        // First check for ROI updates
        const roiUpdate = detectROIUpdate(message, replyToMessage);
        if (roiUpdate) {
            updateSignalROI(roiUpdate.tokenSymbol, roiUpdate.roiPercentage, roiUpdate.confidence);
            messageStats.roiUpdates++;
            return { type: 'roi_update', data: roiUpdate };
        }
        
        // Then check for new trading signals
        const signal = detectTradingSignal(message);
        if (signal) {
            if (messageId) signal.telegram_message_id = messageId;
            if (chatId) signal.telegram_chat_id = chatId;
            
            saveSignal(signal);
            return { type: 'signal', data: signal };
        }
        
        return null;
    } catch (error) {
        console.error('❌ Error processing message:', error);
        return null;
    }
}

/**
 * Update signal ROI with enhanced targeting
 */
function updateSignalROI(tokenSymbol, roiPercentage, confidence = 0.8, callback) {
    console.log(`💰 Updating ROI: ${tokenSymbol} → ${roiPercentage}% (confidence: ${confidence})`);
    
    let query, params;
    const updateTime = new Date().toISOString();
    
    if (tokenSymbol === 'RECENT') {
        // Update most recent signal
        query = `UPDATE signals 
                SET roi_percentage = ?, roi_updated_at = ? 
                WHERE id = (
                    SELECT id FROM signals 
                    ORDER BY created_at DESC 
                    LIMIT 1
                )`;
        params = [roiPercentage, updateTime];
    } else {
        // Update specific token (most recent of that token)
        query = `UPDATE signals 
                SET roi_percentage = ?, roi_updated_at = ? 
                WHERE token_symbol = ? 
                AND id = (
                    SELECT id FROM signals 
                    WHERE token_symbol = ? 
                    ORDER BY created_at DESC 
                    LIMIT 1
                )`;
        params = [roiPercentage, updateTime, tokenSymbol, tokenSymbol];
    }
    
    db.run(query, params, function(err) {
        if (err) {
            console.error('❌ Error updating ROI:', err);
            if (callback) callback(err, null);
        } else {
            console.log(`✅ ROI updated successfully. Changes: ${this.changes}`);
            if (callback) callback(null, { changes: this.changes, roiPercentage });
            
            // Broadcast ROI update if global function exists
            if (typeof global.broadcastROIUpdate === 'function') {
                // Find the signal that was updated to get its ID
                const findQuery = tokenSymbol === 'RECENT' 
                    ? `SELECT id FROM signals ORDER BY created_at DESC LIMIT 1`
                    : `SELECT id FROM signals WHERE token_symbol = ? ORDER BY created_at DESC LIMIT 1`;
                
                const findParams = tokenSymbol === 'RECENT' ? [] : [tokenSymbol];
                
                db.get(findQuery, findParams, (err, row) => {
                    if (!err && row) {
                        global.broadcastROIUpdate(row.id, roiPercentage);
                    }
                });
            }
        }
    });
}

/**
 * Save signal to database with error handling
 */
function saveSignal(signal, callback) {
    const query = `INSERT INTO signals (
        id, token_symbol, token_contract, signal_type, confidence_score, 
        entry_mc, raw_message, created_at, kol_name, chart_link, status, 
        roi_percentage, dexscreener_link, telegram_message_id, telegram_chat_id,
        detection_confidence
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
    const values = [
        signal.id, signal.token_symbol, signal.token_contract, signal.signal_type,
        signal.confidence_score, signal.entry_mc, signal.raw_message, signal.created_at,
        signal.kol_name, signal.chart_link, signal.status, signal.roi_percentage,
        signal.dexscreener_link, signal.telegram_message_id, signal.telegram_chat_id,
        signal.detection_confidence
    ];
    
    db.run(query, values, function(err) {
        if (err) {
            console.error('❌ Error saving signal:', err);
            if (callback) callback(err, null);
        } else {
            console.log('✅ Signal saved to database:', signal.token_symbol);
            if (callback) callback(null, signal);
            
            // Broadcast new signal if global function exists
            if (typeof global.broadcastNewSignal === 'function') {
                global.broadcastNewSignal(signal);
            }
        }
    });
}

/**
 * Get recent signals with pagination and filtering
 */
function getRecentSignals(limit = 20, offset = 0, callback) {
    const query = `SELECT * FROM signals 
                  ORDER BY created_at DESC 
                  LIMIT ? OFFSET ?`;
    
    db.all(query, [limit, offset], (err, rows) => {
        if (err) {
            console.error('❌ Error fetching signals:', err);
            if (callback) callback(err, null);
        } else {
            console.log(`📊 Retrieved ${rows.length} signals from database`);
            if (callback) callback(null, rows);
        }
    });
}

/**
 * Get system statistics
 */
function getStats(callback) {
    const uptimeMinutes = Math.floor((Date.now() - messageStats.startTime) / 60000);
    const uptimeHours = Math.floor(uptimeMinutes / 60);
    const uptimeDisplay = `${uptimeHours}h ${uptimeMinutes % 60}m`;
    
    const stats = {
        ...messageStats,
        uptime: uptimeDisplay,
        uptimeMs: Date.now() - messageStats.startTime,
        connectedChannels: connectedChannels.size,
        database: dbPath
    };
    
    if (callback) callback(null, stats);
    return stats;
}

/**
 * Start bot with enhanced error handling and reconnection
 */
function startBot(token) {
    if (!token) {
        console.log('⚠️ No token provided to startBot()');
        return false;
    }
    
    try {
        BOT_TOKEN = token;
        bot = new Telegraf(token);
        
        console.log('🔗 Initializing bot with token...');
        
        // Enhanced message handler
        bot.on('message', (ctx) => {
            try {
                const message = ctx.message.text || '';
                const replyToMessage = ctx.message.reply_to_message?.text || null;
                const messageId = ctx.message.message_id;
                const chatId = ctx.message.chat.id;
                
                if (message.trim().length === 0) return;
                
                console.log('📨 Processing message:', message.substring(0, 100) + '...');
                
                const result = processMessage(message, replyToMessage, messageId, chatId);
                
                if (result) {
                    console.log(`✅ Processed: ${result.type}`, 
                        result.type === 'signal' ? result.data.token_symbol : result.data);
                }
            } catch (error) {
                console.error('❌ Error in message handler:', error);
            }
        });
        
        // Error handlers
        bot.catch((err, ctx) => {
            console.error('❌ Bot error:', err);
            console.error('Context:', ctx.updateType, ctx.chat?.id);
        });
        
        // Start bot
        bot.launch();
        console.log('🚀 Bot launched successfully!');
        console.log('📡 Monitoring channels for trading signals...');
        
        // Graceful shutdown
        process.once('SIGINT', () => {
            console.log('🛑 Received SIGINT, stopping bot...');
            bot.stop('SIGINT');
        });
        
        process.once('SIGTERM', () => {
            console.log('🛑 Received SIGTERM, stopping bot...');
            bot.stop('SIGTERM');
        });
        
        return true;
        
    } catch (error) {
        console.error('❌ Failed to start bot:', error);
        return false;
    }
}

/**
 * Initialize the bot system
 */
async function initialize() {
    try {
        await initializeDatabase();
        
        console.log('🎯 Bot system initialized successfully');
        
        if (BOT_TOKEN) {
            console.log('🔑 Found bot token in environment, starting bot...');
            startBot(BOT_TOKEN);
        } else {
            console.log('⚠️ No TELEGRAM_BOT_TOKEN found in environment');
            console.log('💡 Set your token: export TELEGRAM_BOT_TOKEN="your_token_here"');
            console.log('📖 Or call startBot("your_token") programmatically');
        }
        
    } catch (error) {
        console.error('❌ Failed to initialize bot system:', error);
        process.exit(1);
    }
}

// Initialize the system
initialize();

console.log('🎯 AlphaBot module loaded and ready!');

// Export functions for server integration
module.exports = {
    startBot,
    getRecentSignals,
    updateSignalROI,
    saveSignal,
    getStats,
    processMessage,
    db: () => db
};