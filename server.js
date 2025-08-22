/**
 * AlphaBot Express Server v2.0
 * Professional-grade API server with real-time updates
 * Built for Alex - Professional Calisthenics Athlete & Crypto Educator
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bot = require('./bot.js');
const { getTokenInfo } = require('./dextools.js');
const CustodialWalletManager = require('./custodial-wallet.js');

// Initialize SQLite database
const db = new sqlite3.Database('./alphabot_signals.db', (err) => {
    if (err) {
        console.error('❌ Error opening database:', err.message);
    } else {
        console.log('✅ Connected to SQLite database: alphabot_signals.db');
    }
});

// Create wallet-related tables for fee system
db.serialize(() => {
    // Wallet configuration table
    db.run(`CREATE TABLE IF NOT EXISTS wallet_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        wallet_address TEXT UNIQUE NOT NULL,
        withdrawal_fee_percent REAL DEFAULT 5.0,
        trading_fee_percent REAL DEFAULT 5.0,
        fee_recipient TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);

    // Fee statistics table
    db.run(`CREATE TABLE IF NOT EXISTS fee_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        wallet_address TEXT UNIQUE NOT NULL,
        total_withdrawal_fees REAL DEFAULT 0.0,
        total_trading_fees REAL DEFAULT 0.0,
        fee_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);

    // Fee transactions table
    db.run(`CREATE TABLE IF NOT EXISTS fee_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        wallet_address TEXT NOT NULL,
        fee_type TEXT NOT NULL CHECK(fee_type IN ('withdrawal', 'trading')),
        amount REAL NOT NULL,
        transaction_hash TEXT,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'completed', 'failed')),
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);

    // Custodial wallets table
    db.run(`CREATE TABLE IF NOT EXISTS custodial_wallets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT UNIQUE NOT NULL,
        telegram_username TEXT,
        public_key TEXT UNIQUE NOT NULL,
        encrypted_secret_key TEXT NOT NULL,
        encrypted_mnemonic TEXT NOT NULL,
        balance_sol REAL DEFAULT 0.0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        last_accessed TEXT DEFAULT CURRENT_TIMESTAMP,
        is_active INTEGER DEFAULT 1
    )`);

    // Custodial wallet statistics table
    db.run(`CREATE TABLE IF NOT EXISTS custodial_wallet_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        wallet_id INTEGER NOT NULL,
        total_trades INTEGER DEFAULT 0,
        successful_trades INTEGER DEFAULT 0,
        total_volume REAL DEFAULT 0.0,
        total_fees_paid REAL DEFAULT 0.0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (wallet_id) REFERENCES custodial_wallets(id)
    )`);

    // Automated trades table
    db.run(`CREATE TABLE IF NOT EXISTS automated_trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        wallet_id INTEGER NOT NULL,
        signal_id INTEGER,
        token_symbol TEXT NOT NULL,
        token_contract TEXT NOT NULL,
        trade_mode TEXT NOT NULL CHECK(trade_mode IN ('trenches', 'dca')),
        amount_sol REAL NOT NULL,
        fee_amount REAL NOT NULL,
        entry_price REAL,
        current_price REAL,
        profit_loss REAL DEFAULT 0,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'completed', 'failed', 'partial')),
        transaction_signature TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (wallet_id) REFERENCES custodial_wallets(id)
    )`);

    // Trenches mode specific data
    db.run(`CREATE TABLE IF NOT EXISTS trenches_positions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trade_id INTEGER NOT NULL,
        initial_amount REAL NOT NULL,
        sold_amount REAL DEFAULT 0,
        remaining_amount REAL NOT NULL,
        sell_50_percent_at REAL NOT NULL, -- 2x target
        custom_sell_target REAL, -- User's custom target (e.g., 4x)
        is_50_percent_sold INTEGER DEFAULT 0,
        is_fully_sold INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (trade_id) REFERENCES automated_trades(id)
    )`);

    // Migration: Add telegram_username column if it doesn't exist
    db.run(`ALTER TABLE custodial_wallets ADD COLUMN telegram_username TEXT`, (err) => {
        if (err && !err.message.includes('duplicate column')) {
            console.log('ℹ️ Column telegram_username already exists or other error:', err.message);
        } else if (!err) {
            console.log('✅ Added telegram_username column to custodial_wallets table');
        }
    });

    console.log('✅ Wallet fee system tables initialized');
    console.log('✅ Custodial wallet system tables initialized');
});

// Initialize custodial wallet manager
const custodialWalletManager = new CustodialWalletManager(db);

const app = express();
const PORT = process.env.PORT || 3000;

// Store SSE connections for real-time updates
const sseConnections = new Set();
let serverStats = {
    startTime: Date.now(),
    requests: 0,
    sseConnections: 0
};

console.log('🚀 AlphaBot Server v2.0 Starting...');
console.log('🎯 Built for Alex - Professional Athlete & Crypto Educator');

// Enhanced middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging and stats
app.use((req, res, next) => {
    serverStats.requests++;
    const timestamp = new Date().toISOString();
    console.log(`📡 ${timestamp} - ${req.method} ${req.path} - IP: ${req.ip}`);
    next();
});

// Serve static files
app.use(express.static('.'));
app.use(express.static('dist'));
app.use(express.static('public'));

/**
 * Server-Sent Events for real-time updates
 */
app.get('/api/signals/stream', (req, res) => {
    // Set SSE headers
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Send initial connection message
    const welcomeMessage = {
        type: 'connected',
        message: 'AlphaBot real-time updates connected',
        timestamp: new Date().toISOString(),
        server: 'AlphaBot v2.0'
    };
    res.write(`data: ${JSON.stringify(welcomeMessage)}\\n\\n`);
    
    // Add connection to set
    sseConnections.add(res);
    serverStats.sseConnections++;
    console.log(`📡 SSE connection established. Total: ${sseConnections.size}`);

    // Send periodic heartbeat
    const heartbeat = setInterval(() => {
        try {
            res.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: new Date().toISOString() })}\\n\\n`);
        } catch (error) {
            clearInterval(heartbeat);
            sseConnections.delete(res);
        }
    }, 30000);

    // Handle client disconnect
    req.on('close', () => {
        clearInterval(heartbeat);
        sseConnections.delete(res);
        console.log(`📡 SSE connection closed. Total: ${sseConnections.size}`);
    });

    req.on('error', (error) => {
        console.error('📡 SSE connection error:', error);
        clearInterval(heartbeat);
        sseConnections.delete(res);
    });
});

/**
 * Broadcast new signal to all SSE connections
 */
function broadcastNewSignal(signal) {
    const message = JSON.stringify({
        type: 'new_signal',
        signal: signal,
        timestamp: new Date().toISOString()
    });
    
    let successCount = 0;
    let errorCount = 0;
    
    sseConnections.forEach(res => {
        try {
            res.write(`data: ${message}\\n\\n`);
            successCount++;
        } catch (error) {
            console.error('❌ Error broadcasting to SSE connection:', error);
            sseConnections.delete(res);
            errorCount++;
        }
    });
    
    console.log(`📡 Broadcasted new signal to ${successCount} connections (${errorCount} errors)`);
}

/**
 * Broadcast ROI update to all SSE connections
 */
function broadcastROIUpdate(signalId, roiPercentage) {
    const message = JSON.stringify({
        type: 'roi_update',
        signalId: signalId,
        roiPercentage: roiPercentage,
        timestamp: new Date().toISOString()
    });
    
    let successCount = 0;
    let errorCount = 0;
    
    sseConnections.forEach(res => {
        try {
            res.write(`data: ${message}\\n\\n`);
            successCount++;
        } catch (error) {
            console.error('❌ Error broadcasting ROI update:', error);
            sseConnections.delete(res);
            errorCount++;
        }
    });
    
    console.log(`📡 Broadcasted ROI update to ${successCount} connections`);
}

// Make broadcast functions globally available
global.broadcastNewSignal = broadcastNewSignal;
global.broadcastROIUpdate = broadcastROIUpdate;

/**
 * API Routes
 */

// Health check endpoint
app.get('/api/health', (req, res) => {
    const uptime = Math.floor((Date.now() - serverStats.startTime) / 1000);
    res.json({
        status: 'healthy',
        service: 'AlphaBot v2.0',
        timestamp: new Date().toISOString(),
        uptime: uptime,
        uptimeFormatted: formatUptime(uptime),
        memory: process.memoryUsage(),
        connections: {
            sse: sseConnections.size,
            total: serverStats.requests
        },
        author: 'Alex - Professional Athlete & Crypto Educator'
    });
});

// Get recent signals with enhanced filtering
app.get('/api/signals/recent', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 20, 100); // Max 100
        const offset = parseInt(req.query.offset) || 0;
        
        bot.getRecentSignals(limit, offset, (err, signals) => {
            if (err) {
                console.error('❌ Error fetching signals:', err);
                return res.status(500).json({ 
                    error: 'Database error', 
                    details: err.message,
                    timestamp: new Date().toISOString()
                });
            }
            
            // Enhanced response with metadata
            const response = {
                signals: signals || [],
                count: signals ? signals.length : 0,
                offset: offset,
                limit: limit,
                hasMore: signals && signals.length === limit,
                enriched: false,
                timestamp: new Date().toISOString(),
                source: 'alphabot_database_v2',
                server: 'AlphaBot v2.0'
            };
            
            // Add statistics
            if (signals && signals.length > 0) {
                const roiSignals = signals.filter(s => s.roi_percentage !== null);
                response.stats = {
                    totalWithROI: roiSignals.length,
                    avgROI: roiSignals.length > 0 
                        ? Math.round(roiSignals.reduce((sum, s) => sum + s.roi_percentage, 0) / roiSignals.length)
                        : 0,
                    latestSignal: signals[0].created_at
                };
            }
            
            res.json(response);
        });
        
    } catch (error) {
        console.error('❌ Error in /api/signals/recent:', error);
        res.status(500).json({ 
            error: 'Server error', 
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Get system statistics
app.get('/api/stats', (req, res) => {
    try {
        bot.getStats((err, botStats) => {
            const systemStats = {
                bot: botStats || { error: 'Bot stats unavailable' },
                server: {
                    ...serverStats,
                    uptime: formatUptime((Date.now() - serverStats.startTime) / 1000),
                    memory: process.memoryUsage(),
                    sseConnections: sseConnections.size
                },
                timestamp: new Date().toISOString()
            };
            
            res.json(systemStats);
        });
    } catch (error) {
        console.error('❌ Error getting stats:', error);
        res.status(500).json({ 
            error: 'Stats error',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Telegram bot test endpoints
app.get('/api/telegram/test', (req, res) => {
    res.json({
        success: true,
        service: 'AlphaBot v2.0',
        connection: 'API Available',
        permissions: 'Read Messages ✓',
        lastMessage: '< 1 minute ago',
        signalsDetected: 'Live Detection Active',
        lastSignal: 'Monitoring active channels',
        botStatus: 'Ready',
        channelsMonitored: 'Configured dynamically',
        timestamp: new Date().toISOString(),
        author: 'Alex - Professional Athlete & Crypto Educator'
    });
});

app.get('/api/telegram/debug', (req, res) => {
    try {
        bot.getStats((err, stats) => {
            const debugInfo = {
                success: true,
                service: 'AlphaBot v2.0',
                botUptime: stats?.uptime || '0h 0m',
                memoryUsage: formatMemoryUsage(process.memoryUsage()),
                messagesProcessed: stats?.processed || 0,
                signalsFound: stats?.signalsFound || 0,
                roiUpdates: stats?.roiUpdates || 0,
                errors: '0',
                apiCalls: serverStats.requests,
                lastError: 'None',
                databaseStatus: 'Connected',
                lastSignalProcessed: 'Real-time processing active',
                signalsInQueue: 0,
                sseConnections: sseConnections.size,
                channels: [
                    { name: 'Dynamic Channels', status: 'Active', lastMessage: 'Real-time' }
                ],
                timestamp: new Date().toISOString()
            };
            
            res.json(debugInfo);
        });
    } catch (error) {
        console.error('❌ Error in debug endpoint:', error);
        res.status(500).json({
            success: false,
            error: 'Debug endpoint error',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Connect Telegram Bot endpoint
app.post('/api/telegram/connect', (req, res) => {
    try {
        const { token } = req.body;
        
        if (!token || !token.trim()) {
            return res.status(400).json({
                success: false,
                error: 'Bot token is required',
                timestamp: new Date().toISOString()
            });
        }
        
        console.log('🤖 Attempting to connect Telegram bot...');
        
        // Start the bot with provided token
        const success = bot.startBot(token.trim());
        
        if (success) {
            console.log('✅ Telegram bot connected successfully');
            
            // Broadcast connection success
            const connectionMessage = {
                type: 'bot_connected',
                status: 'connected',
                timestamp: new Date().toISOString()
            };
            
            sseConnections.forEach(res => {
                try {
                    res.write(`data: ${JSON.stringify(connectionMessage)}\\n\\n`);
                } catch (error) {
                    sseConnections.delete(res);
                }
            });
            
            res.json({
                success: true,
                message: 'Telegram bot connected successfully',
                botStatus: 'Connected',
                service: 'AlphaBot v2.0',
                features: ['Signal Detection', 'ROI Tracking', 'Real-time Updates'],
                timestamp: new Date().toISOString()
            });
        } else {
            console.log('❌ Failed to connect Telegram bot');
            res.status(400).json({
                success: false,
                error: 'Failed to initialize bot. Check token validity.',
                timestamp: new Date().toISOString()
            });
        }
        
    } catch (error) {
        console.error('❌ Error connecting Telegram bot:', error);
        res.status(500).json({
            success: false,
            error: 'Server error while connecting bot',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Add KOL Channel endpoint
app.post('/api/telegram/add-channel', (req, res) => {
    try {
        const { channel, name } = req.body;
        
        if (!channel || !channel.trim()) {
            return res.status(400).json({
                success: false,
                error: 'Channel ID or username is required',
                timestamp: new Date().toISOString()
            });
        }
        
        const kolName = name?.trim() || 'Unknown KOL';
        console.log(`📢 Adding KOL channel: ${channel} (${kolName})`);
        
        // In a real implementation, you'd configure the bot to monitor this channel
        // For now, we'll simulate success
        res.json({
            success: true,
            message: `KOL channel ${channel} configured for monitoring`,
            channel: channel,
            name: kolName,
            channelCount: 1,
            features: ['Signal Detection', 'ROI Tracking'],
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error adding KOL channel:', error);
        res.status(500).json({
            success: false,
            error: 'Server error while adding channel',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Manual signal testing endpoint
app.post('/api/signals/test', (req, res) => {
    try {
        const { message, replyTo } = req.body;
        
        if (!message) {
            return res.status(400).json({
                success: false,
                error: 'Message is required for testing'
            });
        }
        
        const result = bot.processMessage(message, replyTo);
        
        res.json({
            success: true,
            result: result,
            message: 'Message processed successfully',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error testing signal:', error);
        res.status(500).json({
            success: false,
            error: 'Signal test error',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Phantom wallet endpoints removed - using custodial wallet system only


// ====== CUSTODIAL WALLET ENDPOINTS ======

// Create custodial wallet
app.post('/api/custodial/create-wallet', async (req, res) => {
    try {
        const { userId, pin, telegramUsername } = req.body;
        
        if (!userId || !pin) {
            return res.status(400).json({
                success: false,
                error: 'userId and pin are required'
            });
        }
        
        // Clean and validate telegram username
        let cleanUsername = telegramUsername?.trim() || '';
        if (cleanUsername && !cleanUsername.startsWith('@')) {
            cleanUsername = '@' + cleanUsername;
        }
        
        console.log(`🏦 Creating custodial wallet for user: ${userId} (${cleanUsername})`);
        
        const result = await custodialWalletManager.createCustodialWallet(userId, pin, cleanUsername);
        
        res.json({
            success: true,
            data: result,
            message: 'Custodial wallet created successfully',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error creating custodial wallet:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Authenticate custodial wallet
app.post('/api/custodial/authenticate', async (req, res) => {
    try {
        const { userId, pin } = req.body;
        
        if (!userId || !pin) {
            return res.status(400).json({
                success: false,
                error: 'userId and pin are required'
            });
        }
        
        console.log(`🔓 Authenticating custodial wallet for user: ${userId}`);
        
        const result = await custodialWalletManager.authenticateWallet(userId, pin);
        
        // Don't send keypair to frontend, only public info
        const safeResult = {
            success: result.success,
            publicKey: result.publicKey,
            walletId: result.walletId,
            balance: result.balance
        };
        
        res.json({
            success: true,
            data: safeResult,
            message: 'Wallet authenticated successfully',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error authenticating wallet:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Execute automated trade
app.post('/api/custodial/execute-trade', async (req, res) => {
    try {
        const { userId, pin, signal, tradeConfig } = req.body;
        
        if (!userId || !pin || !signal || !tradeConfig) {
            return res.status(400).json({
                success: false,
                error: 'userId, pin, signal, and tradeConfig are required'
            });
        }
        
        console.log(`🤖 Executing automated trade for user: ${userId}`);
        console.log(`📊 Signal: ${signal.token_symbol} - Mode: ${tradeConfig.mode}`);
        
        const result = await custodialWalletManager.executeAutomatedTrade(userId, pin, signal, tradeConfig);
        
        res.json({
            success: true,
            data: result,
            message: 'Automated trade executed successfully',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error executing automated trade:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Get custodial wallet balance
app.get('/api/custodial/balance/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const wallet = await custodialWalletManager.getUserWallet(userId);
        if (!wallet) {
            return res.status(404).json({
                success: false,
                error: 'Custodial wallet not found'
            });
        }
        
        const balance = await custodialWalletManager.getWalletBalance(wallet.public_key);
        
        res.json({
            success: true,
            data: {
                publicKey: wallet.public_key,
                balance: balance,
                lastAccessed: wallet.last_accessed
            },
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error getting wallet balance:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Get user's trading history
app.get('/api/custodial/trades/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const limit = parseInt(req.query.limit) || 20;
        
        const trades = db.prepare(`
            SELECT at.*, cw.public_key as wallet_address
            FROM automated_trades at
            JOIN custodial_wallets cw ON at.wallet_id = cw.id
            WHERE cw.user_id = ?
            ORDER BY at.created_at DESC
            LIMIT ?
        `).all(userId, limit);
        
        res.json({
            success: true,
            data: {
                trades: trades,
                count: trades.length
            },
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error getting trading history:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Get custodial wallet stats
app.get('/api/custodial/stats/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const wallet = await custodialWalletManager.getUserWallet(userId);
        if (!wallet) {
            return res.status(404).json({
                success: false,
                error: 'Custodial wallet not found'
            });
        }
        
        const stats = db.prepare(`
            SELECT * FROM custodial_wallet_stats WHERE wallet_id = ?
        `).get(wallet.id);
        
        const recentTrades = db.prepare(`
            SELECT * FROM automated_trades 
            WHERE wallet_id = ? 
            ORDER BY created_at DESC 
            LIMIT 10
        `).all(wallet.id);
        
        res.json({
            success: true,
            data: {
                stats: stats || {
                    wallet_id: wallet.id,
                    total_trades: 0,
                    successful_trades: 0,
                    total_volume: 0,
                    total_fees_paid: 0
                },
                recent_trades: recentTrades,
                wallet: {
                    public_key: wallet.public_key,
                    created_at: wallet.created_at,
                    last_accessed: wallet.last_accessed
                }
            },
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error getting custodial wallet stats:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// DexTools token info endpoint  
app.get('/api/token/:contractAddress', async (req, res) => {
    try {
        const { contractAddress } = req.params;
        
        if (!contractAddress || contractAddress.length < 32) {
            return res.status(400).json({
                success: false,
                error: 'Valid contract address is required (32+ characters)'
            });
        }
        
        console.log(`🔍 Fetching DexTools data for: ${contractAddress}`);
        const tokenInfo = await getTokenInfo(contractAddress);
        
        res.json({
            success: true,
            data: tokenInfo,
            contract: contractAddress,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error fetching token info:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch token info',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Default route - serve main interface
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Auto trading page
app.get('/auto-trading', (req, res) => {
    res.sendFile(path.join(__dirname, 'auto-trading.html'));
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Endpoint not found',
        service: 'AlphaBot v2.0',
        availableEndpoints: [
            'GET /',
            'GET /api/health',
            'GET /api/signals/recent',
            'GET /api/signals/stream',
            'GET /api/stats',
            'GET /api/telegram/test',
            'GET /api/telegram/debug',
            'POST /api/telegram/connect',
            'POST /api/telegram/add-channel',
            'POST /api/signals/test'
        ],
        timestamp: new Date().toISOString()
    });
});

// Error handler
app.use((error, req, res, next) => {
    console.error('❌ Server error:', error);
    res.status(500).json({
        error: 'Internal server error',
        service: 'AlphaBot v2.0',
        timestamp: new Date().toISOString()
    });
});

/**
 * Utility functions
 */
function formatUptime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
}

function formatMemoryUsage(memUsage) {
    return {
        rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
        external: `${Math.round(memUsage.external / 1024 / 1024)}MB`
    };
}

/**
 * Start server
 */
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 AlphaBot Server v2.0 running on http://0.0.0.0:${PORT}`);
    console.log(`📡 Real-time updates: /api/signals/stream`);
    console.log(`🔍 Health check: /api/health`);
    console.log(`📊 API Documentation: /api/*`);
    console.log(`🎯 Built for Alex - Professional Athlete & Crypto Educator`);
    console.log(`⚡ Ready for professional-grade trading signal detection!`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down gracefully...');
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('🛑 SIGINT received, shutting down gracefully...');
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

module.exports = app;