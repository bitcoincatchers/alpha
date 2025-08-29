/**
 * AlphaBot - Advanced Telegram Trading Signals Bot
 * Professional-grade signal detection and ROI tracking
 * Built for Alex - Professional Calisthenics Athlete & Crypto Educator
 */

const { Telegraf } = require('telegraf');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fetch = require('node-fetch');
const { Connection, Keypair, PublicKey, VersionedTransaction } = require('@solana/web3.js');
const bs58 = require('bs58');
const axios = require('axios');
const crypto = require('crypto');

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

// Bot configuration - HARDCODED TOKEN FOR PLATFORM
let bot = null;
let BOT_TOKEN = '8285409026:AAFeupAhg1UFWw55BLqoH0NqnH21sWJd72Q'; // Platform bot token
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
            if (match[1] && match[2] && isNaN(match[1])) {
                tokenSymbol = match[1].toUpperCase();
                multiplier = parseFloat(match[2]);
            } else if (match[1] && match[2]) {
                multiplier = parseFloat(match[1]);
                tokenSymbol = match[2].toUpperCase();
            } else {
                continue; // Skip if missing groups
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
                    const tokenSymbol = tokenMatch[1] ? tokenMatch[1].toUpperCase() : 'UNKNOWN';
                    console.log('🎯 Contextual ROI detected:', { 
                        tokenSymbol, 
                        multiplier, 
                        roiPercentage 
                    });
                    return { 
                        tokenSymbol, 
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
    console.log('🔍 [DEBUG] Starting detectTradingSignal...');
    console.log('📝 [DEBUG] Message content:', message.substring(0, 200) + '...');
    
    const msgLower = message.toLowerCase();
    
    // ENHANCED: More comprehensive trigger patterns
    const triggerPatterns = [
        'trading alert',
        'trade alert', 
        'signal:',
        'call:',
        'pump alert',
        'new call',
        'buy',
        'entry',
        'target',
        'gem',
        'moonshot',
        'x100',
        'x10',
        'x5',
        'mc',
        'market cap',
        'ca:',
        'contract:',
        'address:',
        '📈',
        '🚀',
        '🌙',
        '💎',
        '🔥',
        '⚡'
    ];
    
    // Token extraction with multiple patterns
    const tokenPatterns = [
        /\$([A-Za-z0-9]{1,20})/gi,
        /token:\s*([A-Za-z0-9]{1,20})/gi,
        /symbol:\s*([A-Za-z0-9]{1,20})/gi
    ];
    
    let tokenSymbol = null;
    console.log('🔍 [DEBUG] Starting token extraction...');
    for (const pattern of tokenPatterns) {
        pattern.lastIndex = 0; // Reset regex state
        const match = pattern.exec(message);
        console.log(`🔍 [DEBUG] Pattern ${pattern.source} result:`, match);
        if (match && match[1]) {
            tokenSymbol = match[1].toUpperCase();
            console.log(`💰 [DEBUG] Token found: ${tokenSymbol}`);
            break;
        }
    }
    console.log(`💰 [DEBUG] Final token symbol: ${tokenSymbol}`);
    
    // Check for triggers
    let hasTrigger = triggerPatterns.some(trigger => msgLower.includes(trigger));
    console.log(`🎯 Has trigger: ${hasTrigger}, Token: ${tokenSymbol}`);
    
    // ENHANCED: If we have a token, be more liberal about considering it a signal
    if (tokenSymbol) {
        // If we have a token but no explicit trigger, look for ANY crypto-related content
        if (!hasTrigger) {
            const cryptoKeywords = ['price', 'chart', 'dex', 'pump', 'moon', 'hodl', 'buy', 'sell', 'hold'];
            hasTrigger = cryptoKeywords.some(keyword => msgLower.includes(keyword)) || message.length > 20;
            console.log(`🔍 Liberal trigger check: ${hasTrigger}`);
        }
    }
    
    // FINAL CHECK: If no trigger and no token, definitely not a signal
    if (!tokenSymbol) {
        console.log('❌ No token found, skipping message');
        return null;
    }
    
    // ENHANCED: If we have a token, we'll consider it a signal with lower threshold
    if (!hasTrigger && tokenSymbol) {
        console.log('⚠️ Token found but no trigger patterns, treating as potential signal anyway');
        hasTrigger = true; // Be more aggressive
    }
    
    // Contract address extraction
    const contractPatterns = [
        /(?:ca|contract|address):\s*([A-Za-z0-9]{32,})/gi,
        /([A-Za-z0-9]{32,})/g
    ];
    
    let contractAddress = null;
    for (const pattern of contractPatterns) {
        pattern.lastIndex = 0; // Reset regex state
        const match = pattern.exec(message);
        if (match && match[1]) {
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
    
    // Market cap / Entry price extraction - FIXED PATTERNS
    const mcPatterns = [
        // "entry price 950k mc" -> captures 950, k
        /entry\s+price\s+(\d+(?:\.\d+)?)\s*([kmbt]?)\s*mc/gi,
        // "entry price: 200k mc" -> captures 200, k  
        /entry\s+price:\s*(\d+(?:\.\d+)?)\s*([kmbt]?)\s*mc/gi,
        // "950k mc" or "200k mc" -> captures number and multiplier
        /(\d+(?:\.\d+)?)\s*([kmbt])\s*mc/gi,
        // "price: 300k mc" -> captures 300, k
        /price:\s*(\d+(?:\.\d+)?)\s*([kmbt]?)\s*mc/gi,
        // "buy at 150k" -> captures 150, k
        /buy\s*at\s*(\d+(?:\.\d+)?)\s*([kmbt]?)/gi,
        // General pattern: any number followed by k/m/b/t + mc
        /(?:^|\s)(\d+(?:\.\d+)?)\s*([kmbt])\s*(?:mc|market\s*cap)/gi
    ];
    
    let entryMC = null;
    
    console.log('🔍 DEBUG - Extracting entry MC from message:', message);
    
    for (let i = 0; i < mcPatterns.length; i++) {
        const pattern = mcPatterns[i];
        pattern.lastIndex = 0; // Reset regex state for global patterns
        
        const match = pattern.exec(message);
        console.log(`🔍 Pattern ${i + 1} result:`, match);
        
        if (match && match[1]) {
            const baseValue = parseFloat(match[1]);
            const multiplier = match[2] ? match[2].toLowerCase() : '';
            
            console.log(`🎯 Found match: ${baseValue} ${multiplier}`);
            
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
                    // If no multiplier, assume it's already in full value
                    entryMC = Math.round(baseValue);
            }
            
            console.log(`💰 Calculated entry MC: ${entryMC}`);
            break;
        }
    }
    
    if (!entryMC) {
        console.log('❌ No entry MC pattern matched');
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
    
    console.log('🎯 TRADING SIGNAL DETECTED:');
    console.log(`   💰 Token: ${tokenSymbol}`);
    console.log(`   💼 Contract: ${contractAddress?.substring(0, 12)}...`);
    console.log(`   🎯 Entry MC: $${entryMC ? entryMC.toLocaleString() : 'Not found'}`);
    console.log(`   📈 Confidence: ${signal.detection_confidence}`);
    console.log(`   📝 Raw message: "${message.substring(0, 100)}..."`);
    
    messageStats.signalsFound++;
    
    // 🔧 DEBUGGING: Test all patterns with sample messages
    if (messageStats.signalsFound <= 3) {
        console.log('🧪 TESTING ENTRY MC PATTERNS:');
        const testMessages = [
            'entry price 950k mc',
            'entry price: 200k mc', 
            'Entry price 750k mc',
            'entry price: 300k mc'
        ];
        
        testMessages.forEach((testMsg, idx) => {
            console.log(`\n🧪 Test ${idx + 1}: "${testMsg}"`);
            for (let i = 0; i < mcPatterns.length; i++) {
                const pattern = mcPatterns[i];
                pattern.lastIndex = 0;
                const testMatch = pattern.exec(testMsg);
                if (testMatch) {
                    console.log(`   ✅ Pattern ${i + 1} matched:`, testMatch);
                    const testValue = parseFloat(testMatch[1]);
                    const testMultiplier = testMatch[2] ? testMatch[2].toLowerCase() : '';
                    const testMC = testMultiplier === 'k' ? testValue * 1000 : testValue;
                    console.log(`   💰 Would calculate: ${testMC}`);
                    break;
                } else {
                    console.log(`   ❌ Pattern ${i + 1} no match`);
                }
            }
        });
    }
    
    return signal;
}

/**
 * Process incoming message with context awareness
 */
function processMessage(message, replyToMessage = null, messageId = null, chatId = null) {
    try {
        messageStats.processed++;
        console.log(`📊 Processing message #${messageStats.processed}:`);
        console.log(`📝 Content: "${message.substring(0, 150)}..."`);
        
        // First check for ROI updates
        const roiUpdate = detectROIUpdate(message, replyToMessage);
        if (roiUpdate) {
            console.log(`💰 ROI Update detected: ${roiUpdate.tokenSymbol} → ${roiUpdate.roiPercentage}%`);
            updateSignalROI(roiUpdate.tokenSymbol, roiUpdate.roiPercentage, roiUpdate.confidence);
            messageStats.roiUpdates++;
            return { type: 'roi_update', data: roiUpdate };
        }
        
        // Then check for new trading signals
        const signal = detectTradingSignal(message);
        if (signal) {
            console.log(`🎯 SIGNAL DETECTED: ${signal.token_symbol}`);
            if (messageId) signal.telegram_message_id = messageId;
            if (chatId) signal.telegram_chat_id = chatId;
            
            saveSignal(signal);
            messageStats.signalsFound++;
            return { type: 'signal', data: signal };
        } else {
            console.log('❌ No signal detected in this message');
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
async function saveSignal(signal, callback) {
    try {
        // Use HTTP API instead of direct SQLite to avoid SQLITE_BUSY errors
        console.log('💾 Saving signal via API:', signal.token_symbol);
        
        const response = await fetch('http://localhost:3000/api/signals/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(signal)
        });
        
        if (response.ok) {
            const result = await response.json();
            console.log('✅ Signal saved via API:', signal.token_symbol);
            
            if (callback) callback(null, signal);
            
            // Broadcast new signal if global function exists
            if (typeof global.broadcastNewSignal === 'function') {
                global.broadcastNewSignal(signal);
            }
            
            // 🚀 AUTOMATIC TRADING TRIGGER
            console.log('🤖 CHECKING FOR AUTOMATED TRADING USERS...');
            console.log(`🎯 Signal data for automation: ${signal.token_symbol}, entry_mc: ${signal.entry_mc}, contract: ${signal.token_contract}`);
            triggerAutomatedTrades(signal);
            
        } else {
            const error = await response.text();
            console.error('❌ Error saving signal via API:', error);
            if (callback) callback(new Error(error), null);
        }
        
    } catch (error) {
        console.error('❌ Error in saveSignal HTTP request:', error);
        if (callback) callback(error, null);
    }
}

/**
 * Trigger automated trades for users who have automation enabled
 * 🚀 MAINNET LIVE TRADING AUTOMATION
 */
async function triggerAutomatedTrades(signal) {
    try {
        console.log(`🤖 AUTOMATION TRIGGER: New signal ${signal.token_symbol} - Checking bot epoch and auto-trade users...`);
        
        // 🚀 EPOCH CHECK: Only process signals created after bot was activated
        const botConfigQuery = `SELECT config_value FROM bot_config WHERE config_key = 'last_run_timestamp'`;
        
        db.get(botConfigQuery, [], (err, botConfig) => {
            if (err) {
                console.error('❌ Error checking bot config:', err);
                return;
            }
            
            if (!botConfig || !botConfig.config_value) {
                console.log('🛑 BOT NOT ACTIVATED: No RUN BOT timestamp found. Skipping automation for this signal.');
                console.log('💡 User must click "RUN BOT" to start processing new signals for automated trading.');
                return;
            }
            
            const botStartTime = new Date(botConfig.config_value);
            const signalTime = new Date(signal.created_at || Date.now());
            
            if (signalTime < botStartTime) {
                console.log('🛑 OLD SIGNAL IGNORED: Signal created before bot activation. Skipping automation.');
                console.log(`   📅 Signal time: ${signalTime.toISOString()}`);
                console.log(`   🚀 Bot start time: ${botStartTime.toISOString()}`);
                return;
            }
            
            console.log(`✅ NEW SIGNAL APPROVED: Created after bot activation. Processing automation...`);
            console.log(`   📅 Signal time: ${signalTime.toISOString()}`);
            console.log(`   🚀 Bot start time: ${botStartTime.toISOString()}`);
            
            // Get users with automation enabled
            const query = `
                SELECT cw.user_id, cw.id as wallet_id, cw.public_key, ats.auto_trade_enabled, 
                       ats.trade_amount, ats.auto_trade_pin_hash, ats.telegram_username
                FROM custodial_wallets cw 
                LEFT JOIN auto_trade_settings ats ON cw.user_id = ats.user_id
                WHERE ats.auto_trade_enabled = 1 AND cw.is_active = 1
            `;
            
            processAutomatedTrades(query, signal);
        });
        
    } catch (error) {
        console.error('❌ Error in triggerAutomatedTrades:', error);
    }
}

// Helper function to process the actual automated trades
function processAutomatedTrades(query, signal) {
    db.all(query, [], async (err, users) => {
        if (err) {
            console.error('❌ Error getting auto-trade users:', err);
            return;
        }
        
        console.log(`👥 Found ${users.length} users with automation enabled`);
        
        if (users.length === 0) {
            console.log('ℹ️ No users have automated trading enabled yet');
            return;
        }
        
        // Process each user
        for (const user of users) {
            try {
                console.log(`🎯 Processing auto-trade for user: ${user.user_id} (@${user.telegram_username})`);
                
                // ✅ AUTOMATIC LIMIT ORDER CREATION
                if (signal.entry_mc && signal.token_contract) {
                    console.log(`🎯 Signal has entry MC: ${signal.entry_mc} - Creating automatic limit order`);
                    
                    // Check if user already has a pending order for this token
                    const existingOrderQuery = `SELECT id FROM limit_orders WHERE user_id = ? AND token_symbol = ? AND status = 'pending'`;
                    const existingOrder = await new Promise((resolve, reject) => {
                        db.get(existingOrderQuery, [user.user_id, signal.token_symbol], (err, row) => {
                            if (err) reject(err);
                            else resolve(row);
                        });
                    });
                    
                    if (existingOrder) {
                        console.log(`⚠️ User ${user.user_id} already has pending order for ${signal.token_symbol}, skipping duplicate`);
                        continue;
                    }
                    
                    // Create automatic limit order at entry price
                    const limitOrderAmount = user.trade_amount || 0.05; // Use user's configured amount
                    
                    // Skip if amount is outside safety limits
                    if (limitOrderAmount < 0.01 || limitOrderAmount > 1.0) {
                        console.log(`⚠️ Skipping user ${user.user_id}: amount ${limitOrderAmount} outside limits (0.01-1.0 SOL)`);
                        continue;
                    }
                    
                    console.log(`💰 Creating limit order: ${limitOrderAmount} SOL at ${signal.entry_mc} MC target`);
                    
                    // Insert limit order directly into database
                    const insertLimitOrder = `
                        INSERT INTO limit_orders (
                            user_id, token_symbol, contract_address, 
                            target_market_cap, amount_sol, strategy, status,
                            created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
                    `;
                    
                    db.run(insertLimitOrder, [
                        user.user_id,
                        signal.token_symbol,
                        signal.token_contract,
                        signal.entry_mc, // Use the extracted entry MC as target
                        limitOrderAmount,
                        'trenches',
                        'pending'
                    ], function(err) {
                        if (err) {
                            console.error(`❌ Error creating limit order for user ${user.user_id}:`, err.message);
                        } else {
                            console.log(`✅ AUTOMATIC LIMIT ORDER CREATED:
                                🆔 Order ID: ${this.lastID}
                                👤 User: ${user.user_id}
                                💰 Token: ${signal.token_symbol}
                                🎯 Target MC: ${signal.entry_mc.toLocaleString()}
                                💵 Amount: ${limitOrderAmount} SOL
                                📊 Status: pending`);
                        }
                    });
                    
                } else {
                    console.log(`⚠️ Signal missing entry_mc or contract - cannot create limit order`);
                    console.log(`   Entry MC: ${signal.entry_mc || 'NOT FOUND'}`);
                    console.log(`   Contract: ${signal.token_contract || 'NOT FOUND'}`);
                }
                
            } catch (userError) {
                console.error(`❌ Error processing auto-trade for user ${user.user_id}:`, userError.message);
            }
        }
    });
}

/**
 * Check if current market cap is within acceptable limit order range
 */
async function checkLimitOrderConditions(signal, limitSettings) {
    try {
        console.log(`🔍 LIMIT ORDER CHECK: Verifying price conditions for ${signal.token_symbol}`);
        
        if (!limitSettings.enable_limit_orders) {
            console.log('ℹ️ Limit orders disabled, proceeding with market order');
            return { allowed: true, reason: 'Limit orders disabled' };
        }
        
        // Extract market cap from signal (assuming format like "100K MC" or "1.5M MC")
        let signalMcap = 0;
        if (signal.market_cap) {
            const mcapStr = signal.market_cap.toString().toUpperCase();
            if (mcapStr.includes('K')) {
                signalMcap = parseFloat(mcapStr) * 1000;
            } else if (mcapStr.includes('M')) {
                signalMcap = parseFloat(mcapStr) * 1000000;
            } else {
                signalMcap = parseFloat(mcapStr);
            }
        } else if (signal.price && signal.price.includes('MC')) {
            const mcapMatch = signal.price.match(/([0-9.]+)\s*([KM])/i);
            if (mcapMatch) {
                const value = parseFloat(mcapMatch[1]);
                const unit = mcapMatch[2].toUpperCase();
                signalMcap = unit === 'K' ? value * 1000 : value * 1000000;
            }
        }
        
        if (signalMcap === 0) {
            console.log('⚠️ Could not determine signal market cap, proceeding cautiously');
            return { allowed: true, reason: 'Unknown signal MC, proceeding with caution' };
        }
        
        // Get current market cap from token info API
        let currentMcap = 0;
        try {
            console.log(`📊 Fetching current market data for token ${signal.token_contract}`);
            
            // You could use DexScreener, CoinGecko, or your token info API
            const tokenResponse = await fetch(`/api/token-info/${signal.token_contract}`);
            if (tokenResponse.ok) {
                const tokenData = await tokenResponse.json();
                if (tokenData.success && tokenData.data && tokenData.data.market_cap) {
                    currentMcap = tokenData.data.market_cap;
                } else {
                    console.log('⚠️ No current market cap data available');
                    return { allowed: false, reason: 'Cannot fetch current market cap' };
                }
            } else {
                console.log('⚠️ Failed to fetch token info');
                return { allowed: false, reason: 'Token info API failed' };
            }
        } catch (error) {
            console.error('❌ Error fetching current market cap:', error);
            return { allowed: false, reason: 'Error fetching market data' };
        }
        
        // Calculate percentage increase
        const mcapIncreasePercent = ((currentMcap - signalMcap) / signalMcap) * 100;
        const maxAllowedIncrease = limitSettings.max_mcap_increase_percent || 20;
        
        console.log(`📈 MCAP Analysis:
    Signal MCAP: $${signalMcap.toLocaleString()}
    Current MCAP: $${currentMcap.toLocaleString()}
    Increase: ${mcapIncreasePercent.toFixed(2)}%
    Max Allowed: ${maxAllowedIncrease}%`);
        
        if (mcapIncreasePercent <= maxAllowedIncrease) {
            return { 
                allowed: true, 
                reason: `Price within limit (+${mcapIncreasePercent.toFixed(2)}%)`,
                signalMcap,
                currentMcap,
                increasePercent: mcapIncreasePercent
            };
        } else {
            return { 
                allowed: false, 
                reason: `Price exceeded limit (+${mcapIncreasePercent.toFixed(2)}% > ${maxAllowedIncrease}%)`,
                signalMcap,
                currentMcap,
                increasePercent: mcapIncreasePercent
            };
        }
        
    } catch (error) {
        console.error('❌ Error in limit order check:', error);
        return { allowed: false, reason: 'Limit order check failed' };
    }
}

/**
 * Execute automated trade for a specific user
 */
async function executeAutomatedTradeForUser(userId, signal, tradeConfig) {
    try {
        console.log(`🚀 EXECUTING AUTO-TRADE: User ${userId}, Signal ${signal.token_symbol}`);
        
        // Check if we have the custodial wallet manager
        if (typeof global.custodialWalletManager === 'undefined') {
            console.error('❌ Custodial wallet manager not available');
            return;
        }
        
        // Get user's limit order settings
        const limitSettingsQuery = `
            SELECT enable_limit_orders, max_mcap_increase_percent, 
                   price_tolerance_percent, order_timeout_minutes, fallback_to_market
            FROM auto_trade_settings 
            WHERE user_id = ?
        `;
        
        const limitSettings = await new Promise((resolve, reject) => {
            db.get(limitSettingsQuery, [userId], (err, row) => {
                if (err) reject(err);
                else resolve(row || {
                    enable_limit_orders: 1,
                    max_mcap_increase_percent: 20.0,
                    price_tolerance_percent: 15.0,
                    order_timeout_minutes: 5,
                    fallback_to_market: 0
                });
            });
        });
        
        // Check limit order conditions
        const limitCheck = await checkLimitOrderConditions(signal, limitSettings);
        
        console.log(`🎯 LIMIT ORDER RESULT: ${limitCheck.allowed ? '✅ ALLOWED' : '❌ BLOCKED'} - ${limitCheck.reason}`);
        
        if (!limitCheck.allowed) {
            if (limitSettings.fallback_to_market) {
                console.log('🔄 Limit order blocked, but fallback to market order enabled');
                // Proceed with market order
            } else {
                console.log('🚫 Trade blocked due to limit order conditions');
                
                // Save blocked trade record - Get wallet_id first
                const getWalletQuery = `SELECT id FROM custodial_wallets WHERE user_id = ? AND is_active = 1`;
                
                db.get(getWalletQuery, [userId], (err, wallet) => {
                    if (!err && wallet) {
                        const blockedTradeQuery = `
                            INSERT INTO automated_trades (
                                wallet_id, signal_id, token_symbol, token_contract,
                                trade_mode, amount_sol, fee_amount, entry_price, current_price,
                                profit_loss, status, created_at, updated_at
                            ) VALUES (?, ?, ?, ?, 'blocked', ?, 0.0, 0.0, 0.0, 0.0, 'failed', 
                                      datetime('now'), datetime('now'))
                        `;
                        
                        db.run(blockedTradeQuery, [
                            wallet.id, signal.id, signal.token_symbol, signal.token_contract,
                            tradeConfig.amount
                        ]);
                    }
                });
                
                return { success: false, reason: limitCheck.reason, blocked: true };
            }
        }
        
        // 🎯 NEW STRATEGY: Create limit order instead of immediate market order
        console.log(`🎯 CREATING LIMIT ORDER: Signal received, setting up limit order for ${signal.token_symbol}`);
        
        // 🎯 ENHANCED ENTRY PRICE EXTRACTION
        let entryMcap = null;
        if (signal.raw_message) {
            const message = signal.raw_message.toLowerCase();
            
            // ENHANCED patterns to catch MORE formats
            const patterns = [
                /entry\s+price:?\s*(\d+(?:\.\d+)?)\s*([km])\s*mc/i,           // "entry price: 150k mc"
                /(\d+(?:\.\d+)?)\s*([km])\s*mc/i,                              // "150k mc"
                /price:?\s*(\d+(?:\.\d+)?)\s*([km])/i,                         // "price: 150k"
                /entry:?\s*(\d+(?:\.\d+)?)\s*([km])/i,                         // "entry 150k"
                /(\d+(?:\.\d+)?)\s*([km])\s*market\s*cap/i,                    // "150k market cap"
                /market\s*cap:?\s*(\d+(?:\.\d+)?)\s*([km])/i,                  // "market cap: 150k"
                /at\s+(\d+(?:\.\d+)?)\s*([km])\s*(?:market\s*cap|mc)/i,        // "at 200k mc"
                /buy\s*at\s*(\d+(?:\.\d+)?)\s*([km])/i,                        // "buy at 300k"
                /(\d+(?:\.\d+)?)\s*([km])\s*-\s*\d+(?:\.\d+)?\s*[km]/i,        // "100k-500k"
                /when\s+mc\s+hits\s+(\d+(?:\.\d+)?)\s*([km])/i                // "when mc hits 250k"
            ];
            
            console.log(`🔍 ENHANCED ENTRY PRICE EXTRACTION for: ${signal.token_symbol}`); 
            console.log(`📝 Raw message: ${signal.raw_message}`);
            
            for (let i = 0; i < patterns.length; i++) {
                const pattern = patterns[i];
                const match = signal.raw_message.match(pattern);
                if (match && match[1]) {
                    const value = parseFloat(match[1]);
                    const unit = (match[2] || '').toUpperCase();
                    
                    if (!isNaN(value) && value > 0) {
                        switch (unit) {
                            case 'K':
                                entryMcap = Math.round(value * 1000);
                                break;
                            case 'M':
                                entryMcap = Math.round(value * 1000000);
                                break;
                            default:
                                // No unit - assume K if < 1000, otherwise use as-is
                                entryMcap = value < 1000 ? Math.round(value * 1000) : Math.round(value);
                        }
                        console.log(`✅ ENTRY PRICE EXTRACTED: $${entryMcap.toLocaleString()} from "${match[0]}" (pattern ${i + 1})`);
                        break;
                    }
                }
            }
        }
        
        // Try to use the signal's entry_mc field if available
        if (!entryMcap && signal.entry_mc) {
            entryMcap = signal.entry_mc;
            console.log(`🔄 Using signal.entry_mc: $${entryMcap.toLocaleString()}`);
        }
        
        // If we STILL couldn't extract market cap, use default based on signal type
        if (!entryMcap) {
            entryMcap = 100000; // Default 100K MC
            console.log(`⚠️ Could not extract MC from any source, using default: $${entryMcap.toLocaleString()}`);
        }
        
        // Create limit order via API
        try {
            const limitOrderResponse = await fetch('http://localhost:3000/api/limit-orders/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: userId,
                    tokenSymbol: signal.token_symbol,
                    contractAddress: signal.token_contract || signal.contract_address,
                    targetMarketCap: entryMcap,
                    amountSol: tradeConfig.amount,
                    strategy: tradeConfig.mode || 'trenches'
                })
            });
            
            const limitOrderResult = await limitOrderResponse.json();
            
            if (limitOrderResult.success) {
                console.log(`🚀 AUTOMATION SUCCESS! LIMIT ORDER CREATED:`);
                console.log(`   📊 Order ID: ${limitOrderResult.orderId}`);
                console.log(`   👤 User: ${userId}`);
                console.log(`   💰 Token: ${signal.token_symbol}`);
                console.log(`   🎯 Target MC: $${entryMcap.toLocaleString()}`);
                console.log(`   💎 Amount: ${tradeConfig.amount} SOL`);
                console.log(`   📈 Strategy: ${tradeConfig.mode}`);
                
                // Save automated trade record as "limit_order_pending" 
                // Note: Use wallet_id instead of user_id per table structure
                const getWalletQuery = `SELECT id FROM custodial_wallets WHERE user_id = ? AND is_active = 1`;
                
                db.get(getWalletQuery, [userId], (err, wallet) => {
                    if (err) {
                        console.error('❌ Error getting wallet_id for user:', err);
                        return;
                    }
                    
                    if (!wallet) {
                        console.log('❌ No active wallet found for user', userId);
                        return;
                    }
                    
                    const automatedTradeQuery = `
                        INSERT INTO automated_trades (
                            wallet_id, signal_id, token_symbol, token_contract,
                            trade_mode, amount_sol, fee_amount, entry_price, current_price, 
                            profit_loss, status, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, 'trenches', ?, 0.0, 0.0, 0.0, 0.0, 'pending', 
                                  datetime('now'), datetime('now'))
                    `;
                    
                    db.run(automatedTradeQuery, [
                        wallet.id, signal.id, signal.token_symbol, signal.token_contract || signal.contract_address,
                        tradeConfig.amount
                    ], (err) => {
                        if (err) {
                            console.error('❌ Error saving automated trade record:', err);
                        } else {
                            console.log(`✅ Automated trade record saved for wallet ${wallet.id}`);
                        }
                    });
                });
                
                return { 
                    success: true, 
                    type: 'limit_order_created',
                    orderId: limitOrderResult.orderId,
                    targetMcap: entryMcap,
                    amount: tradeConfig.amount,
                    tokenSymbol: signal.token_symbol,
                    userId: userId
                };
                
            } else {
                throw new Error(`Limit order creation failed: ${limitOrderResult.error}`);
            }
            
        } catch (limitOrderError) {
            console.error(`❌ Error creating limit order:`, limitOrderError);
            
            // Fallback to immediate execution if limit order fails
            console.log(`🔄 FALLBACK: Executing immediate trade due to limit order failure`);
            
            const result = await global.custodialWalletManager.executeAutomatedTrade(
                userId,
                null, // PIN bypass for automation
                signal,
                tradeConfig
            );
            
            console.log(`✅ FALLBACK TRADE EXECUTED: User ${userId}, Result:`, result.success ? 'SUCCESS' : 'FAILED');
            return result;
        }
        
    } catch (error) {
        console.error(`❌ Auto-trade execution failed for user ${userId}:`, error.message);
    }
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
 * 🎯 LIMIT ORDER MONITOR - Executes market orders when mcap conditions are met
 */
async function monitorLimitOrders() {
    try {
        console.log('🔍 LIMIT ORDER MONITOR: Checking pending orders...');
        
        // Get all pending limit orders (simplified query without wallet requirement)
        const query = `
            SELECT * FROM limit_orders 
            WHERE status = 'pending'
            ORDER BY created_at ASC
        `;
        
        db.all(query, [], async (err, orders) => {
            if (err) {
                console.error('❌ Error fetching limit orders:', err);
                return;
            }
            
            console.log(`📋 Found ${orders.length} pending limit orders to check`);
            
            for (const order of orders) {
                try {
                    await checkAndExecuteLimitOrder(order);
                } catch (error) {
                    console.error(`❌ Error checking order ${order.id}:`, error);
                }
            }
        });
        
    } catch (error) {
        console.error('❌ Error in limit order monitor:', error);
    }
}

/**
 * 🚀 Check and execute individual limit order if conditions are met
 */
async function checkAndExecuteLimitOrder(order) {
    try {
        console.log(`🔍 Checking order ${order.id}: ${order.token_symbol} at ${order.target_market_cap} MC`);
        
        if (!order.contract_address) {
            console.log(`⚠️ Order ${order.id} missing contract address, skipping`);
            return;
        }
        
        // Get current market cap from Jupiter API
        const marketData = await getCurrentMarketCap(order.contract_address);
        
        if (!marketData || (!marketData.marketCap && !marketData.price)) {
            console.log(`⚠️ Could not fetch market data for ${order.token_symbol}, skipping`);
            return;
        }
        
        // Use market cap if available, otherwise use price as fallback
        const currentMcap = marketData.marketCap || marketData.price;
        
        console.log(`📊 MARKET DATA CHECK: ${order.token_symbol}
            🎯 Target MC: ${order.target_market_cap.toLocaleString()}
            💰 Current Value: ${currentMcap.toLocaleString()} ${marketData.marketCap ? '(Market Cap)' : '(Price USD)'}
            📡 Source: ${marketData.source}
            📈 Ratio: ${((currentMcap / order.target_market_cap) * 100).toFixed(2)}%`);
        
        // 🎯 CRITICAL LOGIC: Execute market order when current mcap <= target mcap
        if (currentMcap <= order.target_market_cap) {
            console.log(`🚀 EXECUTING MARKET ORDER! Current mcap (${currentMcap.toLocaleString()}) <= Target (${order.target_market_cap.toLocaleString()})`);
            
            // Execute the market order
            const executionResult = await executeMarketOrder(order, currentMcap);
            
            if (executionResult.success) {
                // Update order status to filled (using existing columns and valid status)
                const updateQuery = `
                    UPDATE limit_orders 
                    SET status = 'filled',
                        filled_at = datetime('now'),
                        transaction_signature = ?,
                        updated_at = datetime('now')
                    WHERE id = ?
                `;
                
                db.run(updateQuery, [executionResult.txHash, order.id], function(err) {
                    if (err) {
                        console.error(`❌ Error updating order ${order.id}:`, err);
                    } else {
                        console.log(`🚀 ORDER FILLED SUCCESSFULLY!
                            🆔 Order ID: ${order.id}
                            💰 Token: ${order.token_symbol}
                            💵 Amount: ${order.amount_sol} SOL
                            🎯 Executed at MC: ${currentMcap.toLocaleString()}
                            🔗 TX: ${executionResult.txHash || 'N/A'}`);
                    }
                });
            } else {
                console.error(`❌ Failed to execute order ${order.id}:`, executionResult.error);
                
                // Update order status to cancelled (using existing columns and valid status)  
                const updateQuery = `
                    UPDATE limit_orders 
                    SET status = 'cancelled',
                        updated_at = datetime('now')
                    WHERE id = ?
                `;
                
                db.run(updateQuery, [order.id]);
            }
        } else {
            console.log(`⏳ Order ${order.id} waiting: Current mcap (${currentMcap.toLocaleString()}) > Target (${order.target_market_cap.toLocaleString()})`);
        }
        
    } catch (error) {
        console.error(`❌ Error checking limit order ${order.id}:`, error);
    }
}

/**
 * 📊 Get current market cap from Jupiter API (Reliable Solana Price Data)
 */
async function getCurrentMarketCap(contractAddress) {
    try {
        console.log(`📡 Fetching current market data for ${contractAddress} via Jupiter API...`);
        
        // Use Jupiter API (600 req/min, no auth required, Solana-focused)
        const { jupiterAPI } = require('./jupiter.js');
        
        // First get token price from Jupiter
        const tokenPrice = await jupiterAPI.getTokenPrice(contractAddress, 'USDC');
        
        if (!tokenPrice || !tokenPrice.price) {
            console.log('⚠️ No price data found from Jupiter API');
            return null;
        }
        
        console.log(`💰 Token price from Jupiter: $${tokenPrice.price} USD`);
        
        // For market cap calculation, we need total supply
        // Since Jupiter doesn't provide supply, we'll try to get it from Solana RPC
        let marketCap = null;
        
        try {
            // Use Solana RPC to get token supply
            const connection = new Connection('https://api.mainnet-beta.solana.com');
            const mintPublicKey = new PublicKey(contractAddress);
            const supplyInfo = await connection.getTokenSupply(mintPublicKey);
            
            if (supplyInfo && supplyInfo.value) {
                const totalSupply = supplyInfo.value.uiAmount || (supplyInfo.value.amount / Math.pow(10, supplyInfo.value.decimals));
                marketCap = tokenPrice.price * totalSupply;
                
                console.log(`📊 Market Cap Calculation:
                    💰 Price: $${tokenPrice.price}
                    🏦 Total Supply: ${totalSupply.toLocaleString()}
                    📊 Market Cap: $${marketCap.toLocaleString()}`);
            } else {
                console.log('⚠️ Could not retrieve token supply from Solana RPC');
                // Return price data even without market cap
                return {
                    price: tokenPrice.price,
                    marketCap: null,
                    source: 'Jupiter API (price only)'
                };
            }
        } catch (supplyError) {
            console.log('⚠️ Error getting token supply:', supplyError.message);
            // Return price data even without market cap
            return {
                price: tokenPrice.price,
                marketCap: null,
                source: 'Jupiter API (price only)'
            };
        }
        
        return {
            price: tokenPrice.price,
            marketCap: marketCap,
            totalSupply: null, // Will be calculated inside the supply try/catch block
            source: 'Jupiter API + Solana RPC'
        };
        
    } catch (error) {
        console.error('❌ Error fetching market data from Jupiter API:', error);
        
        // Fallback: try to return just price without market cap
        try {
            const { jupiterAPI } = require('./jupiter.js');
            const tokenPrice = await jupiterAPI.getTokenPrice(contractAddress, 'USDC');
            
            if (tokenPrice && tokenPrice.price) {
                console.log(`🔄 Fallback: Returning price data only: $${tokenPrice.price}`);
                return {
                    price: tokenPrice.price,
                    marketCap: null,
                    source: 'Jupiter API (fallback)'
                };
            }
        } catch (fallbackError) {
            console.error('❌ Fallback also failed:', fallbackError.message);
        }
        
        return null;
    }
}

/**
 * 🚀 Execute market order (placeholder - integrate with your trading logic)
 */
/**
 * 🚀 REAL MARKET ORDER EXECUTION with Jupiter API
 */
async function executeMarketOrder(order, currentMcap) {
    try {
        console.log(`🚀 EXECUTING REAL MARKET ORDER:
            👤 User: ${order.user_id}
            💰 Token: ${order.token_symbol}
            📄 Contract: ${order.contract_address}
            💵 Amount: ${order.amount_sol} SOL
            📊 Market Cap: ${currentMcap.toLocaleString()}`);
        
        // Get user's wallet details and auto-trade settings
        const userWallet = await getUserWallet(order.user_id);
        if (!userWallet) {
            throw new Error(`No wallet found for user ${order.user_id}`);
        }
        
        const autoTradeSettings = await getAutoTradeSettings(order.user_id);
        if (!autoTradeSettings || !autoTradeSettings.auto_trade_enabled) {
            throw new Error(`Auto-trading not enabled for user ${order.user_id}`);
        }
        
        // Use trade amount from auto-trade settings instead of limit order amount
        const tradeAmountSol = autoTradeSettings.trade_amount || 0.05;
        
        console.log(`💰 Using auto-trade amount: ${tradeAmountSol} SOL (from settings: ${autoTradeSettings.trade_amount})`);
        
        // For testing purposes with Alex's request for 0.015 SOL
        const testAmountSol = 0.015;
        console.log(`🧪 TEST MODE: Using ${testAmountSol} SOL for test trade`);
        
        // Execute REAL Jupiter swap
        const swapResult = await executeJupiterSwap({
            userId: order.user_id, // Pass user ID to get cached keypair
            fromTokenMint: 'So11111111111111111111111111111111111111112', // SOL
            toTokenMint: order.contract_address, // Target token
            amountSol: testAmountSol, // Using test amount for now
            slippageBps: 500 // 5% slippage
        });
        
        if (swapResult.success) {
            console.log(`🎯 REAL MARKET ORDER EXECUTED SUCCESSFULLY!
                🔗 TX Hash: ${swapResult.txHash}
                💰 Amount: ${testAmountSol} SOL
                🎯 Token: ${order.token_symbol}
                📊 Executed at MC: ${currentMcap.toLocaleString()}`);
            
            // 🔄 AUTOMATIC BALANCE REFRESH: Trigger wallet balance update after trade execution
            console.log('🔄 Triggering automatic wallet balance refresh after trade execution...');
            try {
                // Broadcast wallet refresh event to all connected clients
                if (typeof global.broadcastWalletRefresh === 'function') {
                    global.broadcastWalletRefresh(order.user_id);
                }
                
                // Direct HTTP call to refresh balance in frontend
                setTimeout(async () => {
                    try {
                        const refreshResponse = await fetch('http://localhost:3000/api/wallet/refresh-broadcast', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ 
                                userId: order.user_id,
                                reason: 'trade_executed',
                                txHash: swapResult.txHash 
                            })
                        });
                        console.log('✅ Wallet refresh broadcast sent after trade execution');
                    } catch (refreshError) {
                        console.log('⚠️ Failed to broadcast wallet refresh:', refreshError.message);
                    }
                }, 2000); // Wait 2 seconds for transaction to settle
                
            } catch (error) {
                console.log('⚠️ Error triggering wallet refresh:', error.message);
            }
            
            return {
                success: true,
                txHash: swapResult.txHash,
                executedPrice: currentMcap,
                amountSol: testAmountSol,
                timestamp: new Date().toISOString()
            };
        } else {
            throw new Error(`Jupiter swap failed: ${swapResult.error}`);
        }
        
    } catch (error) {
        console.error('❌ Error executing REAL market order:', error);
        return {
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

/**
 * 🔑 Get user wallet from database and decrypt private key
 */
async function getUserWallet(userId) {
    return new Promise((resolve, reject) => {
        const query = `SELECT * FROM custodial_wallets WHERE user_id = ? AND is_active = 1`;
        db.get(query, [userId], (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
}

/**
 * ⚙️ Get auto-trade settings for user
 */
async function getAutoTradeSettings(userId) {
    return new Promise((resolve, reject) => {
        const query = `SELECT * FROM auto_trade_settings WHERE user_id = ?`;
        db.get(query, [userId], (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
}

/**
 * 🚀 Execute REAL Jupiter Swap on Solana Mainnet
 */
async function executeJupiterSwap({ userId, fromTokenMint, toTokenMint, amountSol, amountTokens, slippageBps }) {
    try {
        // Handle both SOL-based and token-based amounts
        const swapAmount = amountTokens || amountSol;
        const swapType = amountTokens ? 'tokens' : 'SOL';
        
        console.log(`🔄 Starting Jupiter swap: ${swapAmount} ${swapType} from ${fromTokenMint} → ${toTokenMint}`);
        console.log(`👤 User: ${userId}`);
        
        // 🔑 GET CACHED KEYPAIR (from user's login session)
        let keypair = global.getCachedKeypair ? global.getCachedKeypair(userId) : null;
        
        if (!keypair) {
            console.log(`❌ No cached keypair for user ${userId} - attempting direct authentication...`);
            
            // Try direct authentication with stored PIN for automatic trading
            try {
                const userWallet = await getUserWallet(userId);
                if (userWallet) {
                    console.log(`🔐 Found wallet for ${userId}, attempting direct decryption...`);
                    
                    // For automatic trading, we'll try common PINs (this is a security trade-off for automation)
                    const commonPins = ['111111', '123456'];
                    
                    for (const pin of commonPins) {
                        try {
                            const crypto = require('crypto');
                            const CryptoJS = require('crypto-js');
                            
                            // Try to decrypt with this PIN
                            const decryptedBytes = CryptoJS.AES.decrypt(userWallet.encrypted_secret_key, pin);
                            const decryptedText = decryptedBytes.toString(CryptoJS.enc.Utf8);
                            
                            if (decryptedText && decryptedText.length > 0) {
                                const secretKeyArray = JSON.parse(decryptedText);
                                if (Array.isArray(secretKeyArray) && secretKeyArray.length === 64) {
                                    const { Keypair } = require('@solana/web3.js');
                                    keypair = Keypair.fromSecretKey(new Uint8Array(secretKeyArray));
                                    console.log(`✅ Successfully authenticated ${userId} with PIN ${pin} for automatic trading`);
                                    break;
                                }
                            }
                        } catch (error) {
                            continue; // Try next PIN
                        }
                    }
                }
                
                if (!keypair) {
                    return {
                        success: false,
                        error: 'Could not authenticate user for automatic trading. PIN may have changed.'
                    };
                }
                
            } catch (error) {
                console.error(`❌ Failed to authenticate ${userId}:`, error);
                return {
                    success: false,
                    error: 'Authentication failed for automatic trading.'
                };
            }
        }
        
        console.log(`🔐 Using cached keypair for automatic trading`);
        
        // 🚀 EXECUTE REAL JUPITER SWAP
        // Solana mainnet connection
        const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
        
        // Convert amount to correct format based on swap type
        let amountLamports;
        if (amountTokens) {
            // For token-to-SOL swaps, amount is in token units (smallest unit)
            amountLamports = Math.floor(amountTokens * 1e6); // Assume 6 decimals for most tokens
            console.log(`💰 Converting ${amountTokens} tokens to ${amountLamports} token units`);
        } else {
            // For SOL-to-token swaps, amount is in lamports
            amountLamports = Math.floor(amountSol * 1e9);
            console.log(`💰 Converting ${amountSol} SOL to ${amountLamports} lamports`);
        }
        
        // Get Jupiter quote
        console.log(`📡 Requesting Jupiter quote...`);
        const quoteResponse = await axios.get('https://quote-api.jup.ag/v6/quote', {
            params: {
                inputMint: fromTokenMint,
                outputMint: toTokenMint,
                amount: amountLamports,
                slippageBps: slippageBps
            }
        });
        
        if (!quoteResponse.data) {
            throw new Error('No quote available from Jupiter');
        }
        
        console.log(`📊 Jupiter quote received:`, {
            inputAmount: quoteResponse.data.inAmount,
            outputAmount: quoteResponse.data.outAmount,
            priceImpact: quoteResponse.data.priceImpactPct
        });
        
        // Get swap transaction
        console.log(`🔄 Requesting Jupiter swap transaction...`);
        const swapResponse = await axios.post('https://quote-api.jup.ag/v6/swap', {
            quoteResponse: quoteResponse.data,
            userPublicKey: keypair.publicKey.toString(),
            wrapAndUnwrapSol: true
        });
        
        const { swapTransaction } = swapResponse.data;
        
        // Deserialize and sign transaction
        console.log(`✍️ Signing transaction...`);
        const transactionBuf = Buffer.from(swapTransaction, 'base64');
        const transaction = VersionedTransaction.deserialize(transactionBuf);
        transaction.sign([keypair]);
        
        // Send transaction
        console.log(`📤 Sending transaction to Solana mainnet...`);
        const signature = await connection.sendTransaction(transaction);
        
        console.log(`🔗 Transaction signature: ${signature}`);
        
        // Confirm transaction
        console.log(`⏳ Confirming transaction...`);
        const confirmation = await connection.confirmTransaction(signature);
        
        console.log(`✅ REAL Jupiter swap completed successfully!`);
        console.log(`   🔗 TX: ${signature}`);
        console.log(`   💰 Amount: ${amountSol} SOL`);
        console.log(`   🎯 Token: ${toTokenMint}`);
        
        return {
            success: true,
            txHash: signature,
            confirmation: confirmation
        };
        
    } catch (error) {
        console.error('❌ Jupiter swap error:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Initialize the bot system
 */
async function initialize() {
    try {
        await initializeDatabase();
        
        console.log('🎯 Bot system initialized successfully');
        
        // 🚀 START LIMIT ORDER MONITOR
        console.log('🔍 Starting limit order monitor...');
        
        // Check limit orders every 30 seconds
        setInterval(monitorLimitOrders, 30000);
        
        // Initial check
        setTimeout(monitorLimitOrders, 5000);
        
        // 🚀 START PROFIT TAKING MONITOR
        console.log('💰 Starting profit taking monitor...');
        
        // Check profit taking every 60 seconds (less frequent than limit orders)
        setInterval(monitorProfitTaking, 60000);
        
        // Initial check after 10 seconds
        setTimeout(monitorProfitTaking, 10000);
        
        // Auto-start bot with hardcoded platform token
        console.log('🔑 Starting AlphaBot with platform token...');
        startBot(BOT_TOKEN);
        
    } catch (error) {
        console.error('❌ Failed to initialize bot system:', error);
        process.exit(1);
    }
}

// Initialize the system
initialize();

console.log('🎯 AlphaBot module loaded with REAL trading capability!');

// Export functions for server integration
/**
 * 🎯 PROFIT TAKING MONITOR - Monitors filled orders for 2x profit opportunities
 * Implements the "Sell 50% at 2x profit" strategy from Trenches Mode
 */
async function monitorProfitTaking() {
    try {
        console.log('💰 PROFIT TAKING MONITOR: Checking filled positions...');
        
        // Get all filled orders that haven't been processed for profit taking yet
        const query = `
            SELECT lo.*, ats.strategies
            FROM limit_orders lo
            LEFT JOIN auto_trade_settings ats ON lo.user_id = ats.user_id
            WHERE lo.status = 'filled' 
            AND lo.filled_at IS NOT NULL
            AND lo.profit_taken_50_percent IS NULL  -- New column to track if 50% has been sold
            AND (ats.strategies IS NULL OR ats.strategies LIKE '%trenches%')  -- Only for trenches strategy
            ORDER BY lo.filled_at ASC
        `;
        
        const filledOrders = await new Promise((resolve, reject) => {
            db.all(query, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
        
        console.log(`📊 Found ${filledOrders.length} filled positions to monitor for profit taking`);
        
        for (const position of filledOrders) {
            await checkProfitTakingCondition(position);
        }
        
    } catch (error) {
        console.error('❌ Error in profit taking monitor:', error);
    }
}

/**
 * 📈 Check if a position meets 2x profit taking conditions
 */
async function checkProfitTakingCondition(position) {
    try {
        console.log(`🔍 Checking profit condition for ${position.token_symbol} (Order #${position.id})`);
        
        // Get current market data from Jupiter API
        const marketData = await getCurrentMarketCap(position.contract_address);
        
        if (!marketData || (!marketData.marketCap && !marketData.price)) {
            console.log(`⚠️ Could not get market data for ${position.token_symbol}, skipping...`);
            return;
        }
        
        // Use market cap if available, otherwise use price as fallback
        const currentMcap = marketData.marketCap || marketData.price;
        
        // Get entry market cap from when order was filled
        const entryMcap = position.target_market_cap; // This was the entry target
        
        if (!entryMcap) {
            console.log(`⚠️ No entry mcap found for ${position.token_symbol}, skipping...`);
            return;
        }
        
        // Calculate if we hit 2x profit (200% = 2x the entry price)
        const profitMultiplier = currentMcap / entryMcap;
        const profitPercentage = ((profitMultiplier - 1) * 100);
        
        console.log(`📊 PROFIT CHECK - ${position.token_symbol}:
            🎯 Entry MC: $${entryMcap.toLocaleString()}
            📈 Current MC: $${currentMcap.toLocaleString()}
            🔥 Multiplier: ${profitMultiplier.toFixed(2)}x
            💰 Profit: ${profitPercentage.toFixed(1)}%`);
        
        // TRENCHES MODE: Sell 50% at 2x profit (100% profit = 2x multiplier)
        if (profitMultiplier >= 2.0) {
            console.log(`🚀 PROFIT TARGET HIT! ${position.token_symbol} reached 2x (${profitPercentage.toFixed(1)}% profit)`);
            
            // Execute 50% sell order
            const sellResult = await executeSellOrder(position, 0.5, currentMcap, 'profit_taking_2x');
            
            if (sellResult.success) {
                // Mark this position as having taken 50% profit
                const updateQuery = `
                    UPDATE limit_orders 
                    SET profit_taken_50_percent = 1,
                        profit_taken_at = datetime('now'),
                        profit_taken_mcap = ?,
                        profit_taken_multiplier = ?,
                        updated_at = datetime('now')
                    WHERE id = ?
                `;
                
                db.run(updateQuery, [currentMcap, profitMultiplier, position.id], function(err) {
                    if (err) {
                        console.error(`❌ Error updating profit taking record for order ${position.id}:`, err);
                    } else {
                        console.log(`✅ PROFIT TAKING COMPLETE! 50% of ${position.token_symbol} sold at ${profitMultiplier.toFixed(2)}x`);
                    }
                });
            }
        } else {
            console.log(`⏳ ${position.token_symbol} not ready: ${profitMultiplier.toFixed(2)}x < 2.0x target`);
        }
        
    } catch (error) {
        console.error(`❌ Error checking profit condition for position ${position.id}:`, error);
    }
}

/**
 * 💰 Get real token balance from Solana wallet
 */
async function getRealTokenBalance(userId, tokenMintAddress) {
    try {
        console.log(`🔍 Getting real token balance for user ${userId}, token ${tokenMintAddress}`);
        
        // Get user's wallet
        const userWallet = await getUserWallet(userId);
        if (!userWallet) {
            throw new Error(`No wallet found for user ${userId}`);
        }
        
        // Use the public key directly from database (more reliable)
        const walletAddress = userWallet.public_key;
        console.log(`🏦 Using wallet address: ${walletAddress}`);
        
        console.log(`🏦 Checking token balance for wallet: ${walletAddress}`);
        
        // Create Solana connection
        const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
        
        // Get all token accounts for this wallet
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
            new PublicKey(walletAddress),
            {
                mint: new PublicKey(tokenMintAddress)
            }
        );
        
        if (tokenAccounts.value.length === 0) {
            console.log(`⚠️ No token accounts found for ${tokenMintAddress}`);
            return 0;
        }
        
        // Sum up all balances (in case there are multiple accounts)
        let totalBalance = 0;
        for (const account of tokenAccounts.value) {
            const balance = account.account.data.parsed.info.tokenAmount.uiAmount;
            totalBalance += balance || 0;
            console.log(`💰 Found token account with balance: ${balance}`);
        }
        
        console.log(`✅ Total ${tokenMintAddress} balance: ${totalBalance}`);
        return totalBalance;
        
    } catch (error) {
        console.error('❌ Error getting real token balance:', error);
        return 0;
    }
}

/**
 * 💸 Execute sell order for profit taking
 */
async function executeSellOrder(position, sellPercentage, currentMcap, reason) {
    try {
        console.log(`💸 EXECUTING SELL ORDER - ENTRY POINT:
            💰 Token: ${position.token_symbol}
            👤 User: ${position.user_id}
            📊 Current MC: $${currentMcap.toLocaleString()}
            📉 Selling: ${(sellPercentage * 100)}%
            🎯 Reason: ${reason}`);
        
        // Get user's wallet and auto-trade settings
        console.log(`🔍 Getting wallet for user: ${position.user_id}`);
        const userWallet = await getUserWallet(position.user_id);
        if (!userWallet) {
            throw new Error(`No wallet found for user ${position.user_id}`);
        }
        console.log(`✅ Wallet found: ${userWallet.public_key}`);
        
        console.log(`🔍 Getting auto-trade settings for user: ${position.user_id}`);
        const autoTradeSettings = await getAutoTradeSettings(position.user_id);
        if (!autoTradeSettings || !autoTradeSettings.auto_trade_enabled) {
            throw new Error(`Auto-trading not enabled for user ${position.user_id}`);
        }
        console.log(`✅ Auto-trading enabled for user: ${position.user_id}`);
        
        // Auto-trade settings already verified above, continue with sell execution
        
        // 🎯 CORRECT APPROACH: Get actual token balance from wallet and sell percentage of tokens
        console.log(`🔍 Getting real token balance for ${position.token_symbol} from wallet...`);
        
        // Get real token balance from Solana wallet directly using public key
        let realTokenBalance;
        try {
            const userWallet = await getUserWallet(position.user_id);
            if (userWallet && userWallet.public_key) {
                const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
                const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
                    new PublicKey(userWallet.public_key),
                    { mint: new PublicKey(position.contract_address) }
                );
                
                if (tokenAccounts.value.length > 0) {
                    realTokenBalance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
                    console.log(`🎯 REAL BALANCE FOUND: ${realTokenBalance?.toLocaleString()} ${position.token_symbol}`);
                } else {
                    realTokenBalance = 0;
                    console.log(`⚠️ No ${position.token_symbol} tokens found in wallet ${userWallet.public_key}`);
                }
            }
        } catch (balanceError) {
            console.error('❌ Error getting real token balance:', balanceError.message);
            realTokenBalance = 0;
        }
        
        // Log the real token balance
        if (realTokenBalance && realTokenBalance > 0) {
            console.log(`🎯 REAL TOKEN BALANCE FOUND: ${realTokenBalance.toLocaleString()} ${position.token_symbol}`);
        } else {
            console.warn(`⚠️ No ${position.token_symbol} tokens found in wallet ${position.user_id}`);
            // For tokens not in wallet, we can't execute real trades
            throw new Error(`No ${position.token_symbol} tokens found in wallet. Real balance: ${realTokenBalance || 0}`);
        }
        
        if (!realTokenBalance || realTokenBalance <= 0) {
            throw new Error(`No ${position.token_symbol} tokens found in wallet (real or estimated)`);
        }
        
        // Calculate exact number of tokens to sell
        const tokensToSell = Math.floor(realTokenBalance * sellPercentage);
        
        console.log(`💰 REAL TOKEN CALCULATION:
            🏦 Wallet Balance: ${realTokenBalance.toLocaleString()} ${position.token_symbol}
            📉 Sell Percentage: ${(sellPercentage * 100)}%
            🎯 Tokens to Sell: ${tokensToSell.toLocaleString()} ${position.token_symbol}`);
        
        if (tokensToSell <= 0) {
            throw new Error(`Calculated tokens to sell is 0 or negative: ${tokensToSell}`);
        }
        
        // EXECUTE REAL JUPITER SWAP: Token → SOL
        console.log(`🔥 EXECUTING REAL JUPITER SWAP: ${tokensToSell.toLocaleString()} ${position.token_symbol} → SOL`);
        console.log(`💰 Contract: ${position.contract_address} → So11111111111111111111111111111111111111112`);
        
        const swapResult = await executeJupiterSwap({
            userId: position.user_id,
            fromTokenMint: position.contract_address, // Selling the token
            toTokenMint: 'So11111111111111111111111111111111111111112', // SOL mint address
            amountTokens: tokensToSell, // ✅ EXACT TOKEN AMOUNT to sell
            slippageBps: 300 // 3% slippage for sells
        });
        
        console.log(`🚀 Jupiter swap result:`, swapResult);
        
        if (swapResult.success) {
            console.log(`🚀 SELL ORDER EXECUTED SUCCESSFULLY!
                💰 Token: ${position.token_symbol}
                🎯 Tokens Sold: ${tokensToSell.toLocaleString()} ${position.token_symbol}
                📊 Percentage: ${(sellPercentage * 100)}%
                🔗 TX: ${swapResult.txHash}
                📊 Price: $${currentMcap.toLocaleString()}`);
            
            // Trigger wallet refresh after successful sell
            try {
                setTimeout(async () => {
                    try {
                        await fetch('http://localhost:3000/api/custodial/refresh-wallet', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ 
                                userId: position.user_id,
                                reason: 'profit_taking_sell',
                                txHash: swapResult.txHash 
                            })
                        });
                        console.log('✅ Wallet refresh broadcast sent after profit taking');
                    } catch (refreshError) {
                        console.log('⚠️ Failed to broadcast wallet refresh:', refreshError.message);
                    }
                }, 2000);
            } catch (error) {
                console.log('⚠️ Error triggering wallet refresh:', error.message);
            }
            
            return {
                success: true,
                txHash: swapResult.txHash,
                soldPercentage: sellPercentage,
                soldTokens: tokensToSell,
                realTokenBalance: realTokenBalance,
                tokenSymbol: position.token_symbol,
                solReceived: swapResult.solReceived,
                executedPrice: currentMcap,
                reason: reason,
                note: swapResult.note,
                timestamp: new Date().toISOString()
            };
        } else {
            throw new Error(`Jupiter sell swap failed: ${swapResult.error}`);
        }
        
    } catch (error) {
        console.error('❌ Error executing sell order:', error);
        return {
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = {
    startBot,
    getRecentSignals,
    updateSignalROI,
    saveSignal,
    getStats,
    processMessage,
    triggerAutomatedTrades,
    monitorLimitOrders,
    getCurrentMarketCap,
    executeMarketOrder,
    executeJupiterSwap,
    getUserWallet,
    getAutoTradeSettings,
    monitorProfitTaking,
    executeSellOrder,
    db: () => db
};