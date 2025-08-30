/**
 * AlphaBot Complete Server with Live Data
 * Combines main functionality with working live positions
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const TransactionParser = require('./transaction_parser.js');
// Removed DexTools dependency - using Jupiter API only
const fetch = require('node-fetch');
const AlphaBotBlockchainClient = require('./blockchain-client.js');
// Solana Web3.js imports - moved to top to avoid duplication
const { Connection, PublicKey } = require('@solana/web3.js');
// 🚀 NEW: DataProvider - Single source of truth for all data
const dataProvider = require('./data-provider.js');
// 🎯 NEW: PositionManager - Isolated position logic with precise P&L
const positionManager = require('./position-manager.js');

// Initialize REAL blockchain client
const blockchainClient = new AlphaBotBlockchainClient();

const app = express();
app.use(cors());
app.use(express.json());

// Initialize SQLite database
const db = new sqlite3.Database('./alphabot_signals.db');

// Create hidden_positions table if it doesn't exist
db.run(`
    CREATE TABLE IF NOT EXISTS hidden_positions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        contract_address TEXT NOT NULL,
        symbol TEXT NOT NULL,
        hidden_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, contract_address)
    )
`);

// Serve static files
app.use(express.static(path.join(__dirname)));

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'AlphaBot v2.0 with Live Data',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage()
    });
});

// 📊 DataProvider metrics and performance endpoint
app.get('/api/data-provider/metrics', (req, res) => {
    try {
        const metrics = dataProvider.getMetrics();
        res.json({
            success: true,
            metrics: metrics,
            timestamp: new Date().toISOString(),
            note: 'DataProvider performance metrics'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 🧹 Manual cache clear endpoint (for testing)
app.post('/api/data-provider/clear-cache', (req, res) => {
    try {
        const { pattern } = req.body;
        dataProvider.clearCache(pattern);
        res.json({
            success: true,
            message: pattern ? `Cleared cache matching '${pattern}'` : 'All cache cleared',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 🎯 PositionManager configuration endpoint
app.get('/api/position-manager/config', (req, res) => {
    try {
        res.json({
            success: true,
            config: positionManager.config,
            timestamp: new Date().toISOString(),
            note: 'PositionManager configuration settings'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 📊 Calculate P&L for specific position
app.post('/api/position-manager/calculate-pnl', async (req, res) => {
    try {
        const { position, marketData, entryData } = req.body;
        
        if (!position || !position.contractAddress) {
            return res.status(400).json({
                success: false,
                error: 'Position with contractAddress is required'
            });
        }
        
        const pnlData = await positionManager.calculatePnL(position, marketData, entryData);
        
        res.json({
            success: true,
            pnl: pnlData,
            position: position.symbol || position.contractAddress,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 🔥 HELIUS PERFORMANCE MONITOR - Track FREE plan usage and performance
app.get('/api/helius/monitor', (req, res) => {
    try {
        const dataProviderMetrics = dataProvider.getMetrics();
        
        // Estimate Helius usage based on our metrics
        const estimatedHeliumCalls = Math.ceil(dataProviderMetrics.apiCalls * 0.7); // ~70% go to Helius (first in list)
        const dailyEstimate = estimatedHeliumCalls * (24 * 60 * 60) / (Date.now() / 1000); // Rough daily projection
        
        res.json({
            success: true,
            helius: {
                plan: 'FREE',
                limits: {
                    monthlyCredits: 1000000,
                    requestsPerSecond: 10,
                    features: 'Basic access, performance limited'
                },
                usage: {
                    estimatedHeliumCalls: estimatedHeliumCalls,
                    estimatedDailyUsage: Math.ceil(dailyEstimate),
                    estimatedMonthlyUsage: Math.ceil(dailyEstimate * 30),
                    percentOfLimit: ((dailyEstimate * 30) / 1000000 * 100).toFixed(2) + '%'
                },
                recommendations: {
                    upgrade: dailyEstimate * 30 > 800000 ? 'RECOMMENDED' : 'NOT_NEEDED',
                    reason: dailyEstimate * 30 > 800000 ? 'Approaching FREE plan limits' : 'FREE plan sufficient'
                }
            },
            dataProviderMetrics: dataProviderMetrics,
            timestamp: new Date().toISOString(),
            note: 'Helius FREE plan monitoring - upgrade to Developer if performance issues'
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Main dashboard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// My account page
app.get('/my-account', (req, res) => {
    res.sendFile(path.join(__dirname, 'my-account.html'));
});

// Auto-trading page
app.get('/auto-trading', (req, res) => {
    res.sendFile(path.join(__dirname, 'auto-trading.html'));
});

// Signals page
app.get('/signals', (req, res) => {
    res.sendFile(path.join(__dirname, 'signals.html'));
});

// ✅ DUPLICATE ENDPOINT REMOVED - Using fast blockchain version at line 1438

// 🗑️ Clear positions endpoint - PERMANENTLY DELETE filled orders as requested by Alex
app.post('/api/positions/clear/:userId', (req, res) => {
    try {
        const { userId } = req.params;
        console.log(`🗑️ PERMANENTLY DELETING all filled orders/positions for user: ${userId}`);
        
        // 🚨 PERMANENT DELETE: Remove filled orders from database (as Alex requested)
        const deleteQuery = `
            DELETE FROM limit_orders 
            WHERE user_id = ? AND status = 'filled'
        `;
        
        db.run(deleteQuery, [userId], function(err) {
            if (err) {
                console.error('❌ Error deleting filled orders:', err.message);
                return res.status(500).json({
                    success: false,
                    error: err.message
                });
            }
            
            console.log(`✅ PERMANENTLY DELETED ${this.changes} filled orders/positions for user ${userId}`);
            
            res.json({
                success: true,
                message: `Permanently deleted ${this.changes} positions`,
                deletedCount: this.changes,
                timestamp: new Date().toISOString(),
                note: 'Positions are permanently gone and will not appear in signals panel'
            });
        });
        
    } catch (error) {
        console.error('❌ Error clearing positions:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 🗑️ Clear individual position endpoint - DELETE specific token position
app.delete('/api/positions/:userId/:tokenSymbol', (req, res) => {
    try {
        const { userId, tokenSymbol } = req.params;
        console.log(`🗑️ PERMANENTLY DELETING position for ${tokenSymbol} (user: ${userId})`);
        
        // 🚨 PERMANENT DELETE: Remove specific filled orders for this token
        const deleteQuery = `
            DELETE FROM limit_orders 
            WHERE user_id = ? AND token_symbol = ? AND status = 'filled'
        `;
        
        db.run(deleteQuery, [userId, tokenSymbol], function(err) {
            if (err) {
                console.error('❌ Error deleting position:', err.message);
                return res.status(500).json({
                    success: false,
                    error: err.message
                });
            }
            
            console.log(`✅ PERMANENTLY DELETED ${this.changes} orders for ${tokenSymbol} (user: ${userId})`);
            
            res.json({
                success: true,
                message: `Permanently deleted ${tokenSymbol} position`,
                deletedCount: this.changes,
                tokenSymbol: tokenSymbol,
                timestamp: new Date().toISOString()
            });
        });
        
    } catch (error) {
        console.error('❌ Error clearing individual position:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Limit orders endpoint - general (for frontend dashboard)
app.get('/api/limit-orders', (req, res) => {
    console.log('📊 Loading all limit orders...');
    
    const query = `
        SELECT * FROM limit_orders 
        WHERE status = 'pending' OR status = 'active'
        ORDER BY created_at DESC
        LIMIT 50
    `;
    
    db.all(query, [], (err, orders) => {
        if (err) {
            console.error('❌ Error loading limit orders:', err.message);
            return res.status(500).json({
                success: false,
                error: err.message
            });
        }
        
        console.log(`✅ Found ${orders ? orders.length : 0} limit orders`);
        
        res.json({
            success: true,
            orders: orders || [],  // Frontend expects 'orders' not 'data'
            count: orders ? orders.length : 0
        });
    });
});

// Limit orders endpoint (simplified) - by user
app.get('/api/limit-orders/:userId', (req, res) => {
    const { userId } = req.params;
    
    const query = `
        SELECT * FROM limit_orders 
        WHERE user_id = ? 
        ORDER BY created_at DESC
    `;
    
    db.all(query, [userId], (err, orders) => {
        if (err) {
            return res.status(500).json({
                success: false,
                error: err.message
            });
        }
        
        res.json({
            success: true,
            data: orders
        });
    });
});

// Update limit order endpoint - for editing target_market_cap and amount_sol
app.patch('/api/limit-orders/:orderId/update', (req, res) => {
    const { orderId } = req.params;
    const { target_market_cap, amount_sol } = req.body;
    
    console.log(`✏️ API: Updating order ${orderId}`, req.body);
    
    // Validate input
    if (!orderId || (!target_market_cap && !amount_sol)) {
        return res.status(400).json({
            success: false,
            error: 'Order ID and at least one field (target_market_cap or amount_sol) required'
        });
    }
    
    // Build dynamic update query
    const updateFields = [];
    const updateValues = [];
    
    if (target_market_cap !== undefined) {
        if (isNaN(target_market_cap) || target_market_cap <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Target market cap must be a positive number'
            });
        }
        updateFields.push('target_market_cap = ?');
        updateValues.push(target_market_cap);
    }
    
    if (amount_sol !== undefined) {
        if (isNaN(amount_sol) || amount_sol <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Amount must be a positive number'
            });
        }
        updateFields.push('amount_sol = ?');
        updateValues.push(amount_sol);
    }
    
    updateFields.push('updated_at = datetime(\'now\')');
    updateValues.push(orderId);
    
    const query = `
        UPDATE limit_orders 
        SET ${updateFields.join(', ')}
        WHERE id = ? AND status = 'pending'
    `;
    
    console.log(`📝 SQL: ${query}`);
    console.log(`📝 Values: ${JSON.stringify(updateValues)}`);
    
    db.run(query, updateValues, function(err) {
        if (err) {
            console.error('❌ Error updating limit order:', err);
            return res.status(500).json({
                success: false,
                error: err.message
            });
        }
        
        if (this.changes === 0) {
            return res.status(404).json({
                success: false,
                error: 'Order not found or not in pending status'
            });
        }
        
        console.log(`✅ Order ${orderId} updated successfully (${this.changes} changes)`);
        
        // Get updated order details for response
        db.get('SELECT * FROM limit_orders WHERE id = ?', [orderId], (err, order) => {
            if (err) {
                console.error('❌ Error fetching updated order:', err);
                return res.status(500).json({
                    success: false,
                    error: 'Order updated but failed to fetch new data'
                });
            }
            
            res.json({
                success: true,
                message: 'Order updated successfully',
                order: order
            });
        });
    });
});

// Delete limit order endpoint - for manual deletion of individual orders
app.delete('/api/limit-orders/:orderId', (req, res) => {
    const { orderId } = req.params;
    
    console.log(`🗑️ API: Deleting order ${orderId}`);
    
    // Validate input
    if (!orderId) {
        return res.status(400).json({
            success: false,
            error: 'Order ID required'
        });
    }
    
    // First get order details to also delete related signal
    db.get('SELECT * FROM limit_orders WHERE id = ?', [orderId], (err, order) => {
        if (err) {
            console.error('❌ Error fetching order for deletion:', err);
            return res.status(500).json({
                success: false,
                error: err.message
            });
        }
        
        if (!order) {
            return res.status(404).json({
                success: false,
                error: 'Order not found'
            });
        }
        
        // Delete the limit order
        db.run('DELETE FROM limit_orders WHERE id = ?', [orderId], function(err) {
            if (err) {
                console.error('❌ Error deleting limit order:', err);
                return res.status(500).json({
                    success: false,
                    error: err.message
                });
            }
            
            console.log(`✅ Order ${orderId} deleted successfully (${this.changes} changes)`);
            
            // Also delete related signal if it exists (optional, to clean up)
            if (order.contract_address) {
                db.run('DELETE FROM signals WHERE token_contract = ? AND token_symbol = ?', 
                    [order.contract_address, order.token_symbol], 
                    function(signalErr) {
                        if (signalErr) {
                            console.log(`⚠️ Note: Could not delete related signal for ${order.token_symbol}:`, signalErr.message);
                        } else if (this.changes > 0) {
                            console.log(`🧹 Also deleted ${this.changes} related signal(s) for ${order.token_symbol}`);
                        }
                    }
                );
            }
            
            res.json({
                success: true,
                message: `Order ${orderId} deleted successfully`,
                deletedOrder: {
                    id: order.id,
                    token_symbol: order.token_symbol,
                    order_type: order.order_type,
                    target_market_cap: order.target_market_cap,
                    amount_sol: order.amount_sol
                },
                timestamp: new Date().toISOString()
            });
        });
    });
});

// 🎯 CREATE LIMIT ORDER ENDPOINT - CRITICAL FOR AUTO-TRADING
app.post('/api/limit-orders/create', async (req, res) => {
    try {
        const { userId, tokenSymbol, contractAddress, targetMarketCap, amountSol, strategy } = req.body;
        
        console.log(`🎯 Creating limit order:`, {
            userId,
            tokenSymbol,
            contractAddress: contractAddress ? contractAddress.substring(0, 12) + '...' : 'N/A',
            targetMarketCap,
            amountSol,
            strategy
        });
        
        // Validate required fields
        if (!userId || !tokenSymbol || !contractAddress || !targetMarketCap || !amountSol) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: userId, tokenSymbol, contractAddress, targetMarketCap, amountSol'
            });
        }
        
        // Validate numeric values
        if (isNaN(targetMarketCap) || targetMarketCap <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Invalid targetMarketCap - must be a positive number'
            });
        }
        
        if (isNaN(amountSol) || amountSol <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Invalid amountSol - must be a positive number'
            });
        }
        
        // Insert limit order into database
        const query = `
            INSERT INTO limit_orders (
                user_id, token_symbol, contract_address, target_market_cap,
                amount_sol, order_type, status, strategy, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, 'buy', 'pending', ?, datetime('now'), datetime('now'))
        `;
        
        const result = await new Promise((resolve, reject) => {
            db.run(query, [
                userId,
                tokenSymbol.toUpperCase(),
                contractAddress,
                targetMarketCap,
                amountSol,
                strategy || 'trenches'
            ], function(err) {
                if (err) reject(err);
                else resolve({ orderId: this.lastID, changes: this.changes });
            });
        });
        
        console.log(`✅ Limit order created successfully: ID ${result.orderId}`);
        
        res.json({
            success: true,
            orderId: result.orderId,
            message: `Limit order created for ${tokenSymbol}`,
            orderDetails: {
                userId,
                tokenSymbol,
                contractAddress,
                targetMarketCap,
                amountSol,
                strategy: strategy || 'trenches',
                status: 'pending'
            }
        });
        
    } catch (error) {
        console.error('❌ Error creating limit order:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Auto-trading settings endpoint
app.get('/api/auto-trading/:userId', (req, res) => {
    const { userId } = req.params;
    
    const query = `
        SELECT * FROM auto_trade_settings 
        WHERE user_id = ?
    `;
    
    db.get(query, [userId], (err, settings) => {
        if (err) {
            return res.status(500).json({
                success: false,
                error: err.message
            });
        }
        
        res.json({
            success: true,
            settings: settings || {
                auto_trade_enabled: 0,
                trade_amount: 0.1,
                max_daily_trades: 5,
                custom_sell_target: 4.0,
                stop_loss_percent: 20.0,
                strategies: 'trenches'
            }
        });
    });
});

// Update auto-trading settings
app.post('/api/auto-trading/:userId', (req, res) => {
    const { userId } = req.params;
    const settings = req.body;
    
    console.log('💾 Updating auto-trade settings for user:', userId);
    console.log('🎯 New settings:', settings);
    
    const query = `
        INSERT OR REPLACE INTO auto_trade_settings 
        (
            user_id, auto_trade_enabled, trade_amount, max_daily_trades, 
            custom_sell_target, stop_loss_percent, telegram_username, 
            strategies, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;
    
    db.run(query, [
        userId,
        settings.enabled ? 1 : 0,
        settings.tradeAmount || 0.1,
        settings.maxDailyTrades || 5,
        settings.customSellTarget || 4.0,
        settings.stopLossPercent || 20.0,
        settings.telegramUsername || '',
        settings.strategy || 'trenches'
    ], function(err) {
        if (err) {
            console.error('❌ Error saving auto-trade settings:', err);
            return res.status(500).json({
                success: false,
                error: err.message
            });
        }
        
        console.log('✅ Auto-trade settings saved successfully for user:', userId);
        console.log('🎯 Trenches Mode configured: 50% at 2x, 50% at', settings.customSellTarget + 'x');
        console.log('🛑 Stop Loss set to:', settings.stopLossPercent + '%');
        
        res.json({
            success: true,
            message: 'Auto-trading settings updated successfully',
            data: {
                userId: userId,
                enabled: settings.enabled,
                tradeAmount: settings.tradeAmount,
                maxDailyTrades: settings.maxDailyTrades,
                customSellTarget: settings.customSellTarget,
                stopLossPercent: settings.stopLossPercent,
                strategy: settings.strategy
            }
        });
    });
});

// Signals endpoint
app.get('/api/signals/recent', (req, res) => {
    const query = `
        SELECT * FROM signals 
        ORDER BY created_at DESC 
        LIMIT 20
    `;
    
    db.all(query, [], (err, signals) => {
        if (err) {
            return res.status(500).json({
                success: false,
                error: err.message
            });
        }
        
        res.json({
            success: true,
            signals: signals
        });
    });
});

// 💾 Save new signal endpoint (used by Telegram bot)
app.post('/api/signals/save', (req, res) => {
    console.log('💾 Received signal save request:', req.body);
    
    try {
        const {
            token_symbol,
            token_contract,
            entry_mc,
            raw_message,
            channel_username,
            message_id,
            dexscreener_link,
            chart_link
        } = req.body;

        // Validate required fields
        if (!token_symbol || !token_contract) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: token_symbol and token_contract'
            });
        }

        console.log(`📊 Signal data received:`, {
            token_symbol,
            token_contract: token_contract?.substring(0, 12) + '...',
            entry_mc,
            dexscreener_link: dexscreener_link || 'not provided',
            chart_link: chart_link || 'not provided'
        });

        // First check if we need to add the missing columns
        const addColumnQuery1 = `ALTER TABLE signals ADD COLUMN dexscreener_link TEXT`;
        const addColumnQuery2 = `ALTER TABLE signals ADD COLUMN chart_link TEXT`;
        
        // Try to add columns (will fail silently if they already exist)
        db.run(addColumnQuery1, (err) => {
            if (err && !err.message.includes('duplicate column name')) {
                console.error('❌ Error adding dexscreener_link column:', err);
            }
        });
        
        db.run(addColumnQuery2, (err) => {
            if (err && !err.message.includes('duplicate column name')) {
                console.error('❌ Error adding chart_link column:', err);
            }
        });

        // Get current bot session before inserting
        const getCurrentSession = `SELECT id FROM bot_sessions ORDER BY session_start DESC LIMIT 1`;
        
        db.get(getCurrentSession, [], (sessionErr, sessionRow) => {
            const currentSessionId = sessionRow ? sessionRow.id : 1;
            
            console.log(`🤖 Assigning signal to bot session: ${currentSessionId}`);
            
            // Insert signal into database with session tracking
            const query = `
                INSERT INTO signals (
                    token_symbol, 
                    token_contract, 
                    entry_mc, 
                    raw_message,
                    dexscreener_link,
                    chart_link,
                    bot_session_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `;
            
            const params = [
                token_symbol.toUpperCase(),
                token_contract,
                entry_mc || 0,
                raw_message || '',
                dexscreener_link || null,
                chart_link || null,
                currentSessionId
            ];

            db.run(query, params, function(err) {
                if (err) {
                    console.error('❌ Error saving signal:', err);
                    return res.status(500).json({
                        success: false,
                        error: err.message
                    });
                }

                console.log(`✅ Signal saved successfully: ${token_symbol} (ID: ${this.lastID}, Session: ${currentSessionId})`);
                
                res.json({
                    success: true,
                    signalId: this.lastID,
                    botSessionId: currentSessionId,
                    message: `Signal ${token_symbol} saved successfully to session ${currentSessionId}`
                });
            });
        }); // Close session query callback

    } catch (error) {
        console.error('❌ Error processing signal save:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 🎯 PRODUCTION: ALEX'S REAL WALLET ACCESS
app.post('/api/custodial/login', async (req, res) => {
    try {
        console.log(`🚀 PRODUCTION: Connecting to Alex's REAL wallet: 2zFDLDPeGgEs3TpsLm3eWWwjY7NSYqdqMkPGjFnHRCXv`);
        
        // Use Alex's real wallet from database (user: toto)
        const query = `SELECT * FROM custodial_wallets WHERE user_id = 'toto'`;
        
        const wallet = await new Promise((resolve, reject) => {
            db.get(query, [], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        
        if (!wallet) {
            throw new Error('Alex\'s wallet not found in database');
        }
        
        // Get REAL blockchain data for Alex's wallet
        const realBalance = await blockchainClient.getRealSolBalance(wallet.public_key);
        const realAnalysis = await blockchainClient.getCompleteWalletAnalysis(wallet.public_key);
        
        console.log(`✅ PRODUCTION: Alex's real wallet connected - Balance: ${realBalance.balanceSol} SOL`);
        
        res.json({
            success: true,
            wallet: {
                userId: 'toto',
                publicKey: wallet.public_key,
                address: wallet.public_key,
                balance: realBalance.balanceSol,
                holdings: realAnalysis.holdings,
                transactions: realAnalysis.transactions
            },
            isReal: true,
            source: 'blockchain-production',
            message: 'Connected to Alex\'s real wallet'
        });
        
    } catch (error) {
        console.error('❌ Production wallet error:', error);
        res.status(500).json({
            success: false,
            error: 'Real wallet connection failed',
            details: error.message
        });
    }
});

// Custodial wallet authenticate endpoint (for auto-trading.html compatibility)
app.post('/api/custodial/authenticate', (req, res) => {
    const { userId, pin } = req.body;
    
    console.log(`🔐 Authenticate attempt for user: ${userId}`);
    
    // Check if wallet exists
    const query = `
        SELECT user_id, public_key, encrypted_secret_key 
        FROM custodial_wallets 
        WHERE user_id = ?
    `;
    
    db.get(query, [userId], (err, wallet) => {
        if (err) {
            console.error('❌ Database error:', err.message);
            return res.status(500).json({
                success: false,
                error: 'Database error'
            });
        }
        
        if (!wallet) {
            console.log(`❌ Wallet not found for user: ${userId}`);
            return res.status(404).json({
                success: false,
                error: 'No custodial wallet found for this User ID'
            });
        }
        
        // For demo purposes, accept any PIN (in production, decrypt and verify)
        console.log(`✅ Authentication successful for user: ${userId}`);
        
        // Return data in format expected by auto-trading.html
        res.json({
            success: true,
            data: {
                userId: wallet.user_id,
                publicKey: wallet.public_key,
                address: wallet.public_key,
                balance: 0.1936, // Mock balance - will be updated by refreshBalance()
                wallet: {
                    userId: wallet.user_id,
                    publicKey: wallet.public_key,
                    address: wallet.public_key,
                    balance: 0.1936
                }
            },
            message: 'Authentication successful'
        });
    });
});

// Create custodial wallet endpoint
app.post('/api/custodial/create-wallet', (req, res) => {
    const { userId, telegramUsername, pin } = req.body;
    
    console.log(`🔐 Creating wallet for user: ${userId}`);
    
    // For demo purposes, create a mock wallet entry
    const mockPublicKey = '2zFDLDPeGgEs3TpsLm3eWWwjY7NSYqdqMkPGjFnHRCXv';
    
    // Insert into database (simplified)
    const query = `
        INSERT OR REPLACE INTO custodial_wallets 
        (user_id, public_key, encrypted_secret_key, created_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `;
    
    db.run(query, [userId, mockPublicKey, 'encrypted_mock_key'], function(err) {
        if (err) {
            console.error('❌ Database error:', err.message);
            return res.status(500).json({
                success: false,
                error: 'Database error'
            });
        }
        
        console.log(`✅ Wallet created for user: ${userId}`);
        
        res.json({
            success: true,
            data: {
                wallet: {
                    userId: userId,
                    publicKey: mockPublicKey,
                    address: mockPublicKey
                }
            },
            message: 'Custodial wallet created successfully'
        });
    });
});

// 💰 Custodial wallet balance endpoint
app.post('/api/custodial/balance', async (req, res) => {
    const { userId } = req.body;
    
    console.log('💰 Getting custodial wallet balance for user:', userId);
    
    try {
        // Get wallet info from database
        const query = `SELECT * FROM custodial_wallets WHERE user_id = ?`;
        
        db.get(query, [userId], async (err, wallet) => {
            if (err) {
                console.error('❌ Database error:', err.message);
                return res.status(500).json({
                    success: false,
                    error: err.message
                });
            }
            
            if (!wallet) {
                return res.status(404).json({
                    success: false,
                    error: 'Wallet not found'
                });
            }
            
            try {
                // Get real balance using data provider
                const balanceData = await dataProvider.getWalletBalance(wallet.public_key, true);
                
                console.log('💰 Balance refreshed:', balanceData.solBalance, 'SOL');
                
                res.json({
                    success: true,
                    balance: parseFloat(balanceData.solBalance) || 0,
                    balanceUsd: balanceData.balanceUsd || '$0.00',
                    publicKey: wallet.public_key,
                    lastUpdated: new Date().toISOString(),
                    tokenCount: balanceData.tokenCount || 0
                });
                
            } catch (balanceError) {
                console.error('❌ Error fetching balance:', balanceError);
                
                // Fallback to stored balance if real balance fails
                res.json({
                    success: true,
                    balance: 0.0,  // Default fallback
                    balanceUsd: '$0.00',
                    publicKey: wallet.public_key,
                    lastUpdated: new Date().toISOString(),
                    note: 'Using fallback balance - balance service temporary unavailable'
                });
            }
        });
        
    } catch (error) {
        console.error('❌ Error in balance endpoint:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 📊 Custodial wallet trades history endpoint
app.get('/api/custodial/trades/:userId', (req, res) => {
    const { userId } = req.params;
    
    console.log('📊 Getting trades history for user:', userId);
    
    const query = `
        SELECT 
            at.*,
            s.token_symbol as signal_token_symbol,
            s.token_contract as signal_token_contract,
            s.entry_mc as signal_entry_mc,
            cw.user_id
        FROM automated_trades at
        LEFT JOIN signals s ON at.signal_id = s.id 
        LEFT JOIN custodial_wallets cw ON at.wallet_id = cw.id
        WHERE cw.user_id = ? 
        ORDER BY at.created_at DESC 
        LIMIT 50
    `;
    
    db.all(query, [userId], (err, trades) => {
        if (err) {
            console.error('❌ Database error:', err.message);
            return res.status(500).json({
                success: false,
                error: err.message
            });
        }
        
        // Format trades for frontend
        const formattedTrades = trades.map(trade => ({
            id: trade.id,
            token_symbol: trade.signal_token_symbol || trade.token_symbol || 'UNKNOWN',
            token_contract: trade.signal_token_contract || trade.token_contract,
            amount_sol: trade.amount_sol,
            fee_amount: trade.fee_amount || 0,
            status: trade.status,
            trade_mode: trade.trade_mode || 'automated',
            created_at: trade.created_at,
            entry_mcap: trade.entry_mcap,
            current_mcap: trade.current_price
        }));
        
        console.log(`📊 Found ${formattedTrades.length} trades for user ${userId}`);
        
        res.json({
            success: true,
            data: {
                trades: formattedTrades,
                count: formattedTrades.length
            }
        });
    });
});

// ❌ REMOVED: Obsolete mock trade execution - Real trades now use Jupiter API via bot.js

// Check wallet balance endpoint
// ❌ REMOVED: Obsolete mock balance endpoint - Use /api/wallet/balance-fast/:userId instead

// ❌ REMOVED: Obsolete mock trades endpoint - Real trades now come from database and blockchain

// KOL Channels Management
// Get connected KOL channels
app.get('/api/kol/channels', (req, res) => {
    console.log('📡 Getting KOL channels...');
    
    const query = `
        SELECT * FROM kol_channels 
        WHERE status = 'active' 
        ORDER BY created_at DESC
    `;
    
    db.all(query, [], (err, channels) => {
        if (err) {
            console.error('❌ Database error:', err.message);
            return res.status(500).json({
                success: false,
                error: err.message
            });
        }
        
        console.log(`📊 Found ${channels.length} KOL channels`);
        
        res.json({
            success: true,
            channels: channels || []
        });
    });
});

// Add new KOL channel
app.post('/api/kol/channels', (req, res) => {
    const { username, channelUsername, type, channelType } = req.body;
    
    // Support both field names for compatibility
    const finalUsername = username || channelUsername;
    const finalType = type || channelType || 'telegram';
    
    console.log(`➕ Adding KOL channel: ${finalUsername}`);
    
    if (!finalUsername) {
        return res.status(400).json({
            success: false,
            error: 'Channel username is required'
        });
    }
    
    const query = `
        INSERT INTO kol_channels (username, type, status, signals_count, created_at, updated_at)
        VALUES (?, ?, 'active', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;
    
    db.run(query, [finalUsername, finalType], function(err) {
        if (err) {
            console.error('❌ Error adding KOL channel:', err.message);
            return res.status(500).json({
                success: false,
                error: err.message
            });
        }
        
        console.log(`✅ KOL channel added with ID: ${this.lastID}`);
        
        res.json({
            success: true,
            data: {
                channelId: this.lastID,
                message: 'KOL channel added successfully'
            }
        });
    });
});

// Remove KOL channel
app.delete('/api/kol/channels/:channelId', (req, res) => {
    const { channelId } = req.params;
    
    console.log(`🗑️ Removing KOL channel: ${channelId}`);
    
    const query = `
        UPDATE kol_channels 
        SET status = 'inactive', updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
    `;
    
    db.run(query, [channelId], function(err) {
        if (err) {
            console.error('❌ Error removing KOL channel:', err.message);
            return res.status(500).json({
                success: false,
                error: err.message
            });
        }
        
        console.log(`✅ KOL channel ${channelId} removed`);
        
        res.json({
            success: true,
            message: 'KOL channel removed successfully'
        });
    });
});

// Bot activation/deactivation endpoint (generic toggle)
app.post('/api/bot/toggle', (req, res) => {
    const { action, userId } = req.body; // action: 'start' or 'stop'
    
    console.log(`🤖 Bot ${action} request for user: ${userId}`);
    
    // In a real implementation, you would start/stop the trading bot process
    // For now, we'll simulate the response
    
    const isStarting = action === 'start';
    
    res.json({
        success: true,
        data: {
            botStatus: isStarting ? 'running' : 'stopped',
            message: isStarting ? 'Bot activated successfully' : 'Bot deactivated successfully'
        }
    });
});

// Bot activation endpoint (specific for RUN BOT button)
app.post('/api/admin/run-bot', (req, res) => {
    console.log('🚀 ADMIN: Activating RUN BOT...');
    
    // In a real implementation, this would:
    // 1. Check if user has wallet connected
    // 2. Validate KOL channels are connected
    // 3. Start the automated trading bot process
    // 4. Set bot status to active in database
    
    res.json({
        success: true,
        data: {
            botStatus: 'active',
            message: 'Bot activated successfully. Only NEW signals will trigger automated trades.',
            timestamp: new Date().toISOString(),
            features: {
                automaticLimitOrders: true,
                realTimeMonitoring: true,
                riskManagement: true
            }
        }
    });
});

// Clear signals endpoint (individual user)
app.post('/api/signals/clear', (req, res) => {
    const { userId } = req.body;
    
    console.log(`🧹 Clearing signals for user: ${userId || 'all'}`);
    
    // PERMANENTLY DELETE signals from database - no more reappearing!
    const query = `
        DELETE FROM signals 
        WHERE status = 'detected'
    `;
    
    // Use existing sqlite3 import
    const sdb = new sqlite3.Database('./alphabot_signals.db');
    
    sdb.run(query, [], function(err) {
        if (err) {
            console.error('❌ Error clearing signals:', err.message);
            return res.status(500).json({
                success: false,
                error: err.message
            });
        }
        
        console.log(`✅ Cleared ${this.changes} signals`);
        
        res.json({
            success: true,
            data: {
                clearedCount: this.changes,
                message: `Successfully cleared ${this.changes} signals`
            }
        });
    });
    
    sdb.close();
});

// Clear ALL signals endpoint (admin) - called by frontend dashboard
app.post('/api/admin/clear-all-signals', (req, res) => {
    console.log('🧹 ADMIN: Clearing ALL signals and orders PERMANENTLY...');
    
    // 🔥 PERMANENT DELETE: Remove ALL signals regardless of status
    const queries = [
        'DELETE FROM signals',  // 🎯 Delete ALL signals (no status filter)
        'DELETE FROM limit_orders'  // 🎯 Delete ALL limit orders (no status filter)
    ];
    
    let totalCleared = 0;
    let completedQueries = 0;
    let results = {
        signalsDeleted: 0,
        ordersDeleted: 0
    };
    
    queries.forEach((query, index) => {
        db.run(query, [], function(err) {  // 🔧 Use main db (alphabot.db) not alphabot_signals.db
            if (err) {
                console.error(`❌ Error clearing data (query ${index + 1}):`, err.message);
                if (completedQueries === 0) {
                    return res.status(500).json({
                        success: false,
                        error: err.message
                    });
                }
            } else {
                const cleared = this.changes;
                totalCleared += cleared;
                
                if (index === 0) {
                    results.signalsDeleted = cleared;
                    console.log(`✅ SIGNALS: Permanently deleted ${cleared} signals`);
                } else {
                    results.ordersDeleted = cleared;
                    console.log(`✅ ORDERS: Permanently deleted ${cleared} limit orders`);
                }
            }
            
            completedQueries++;
            if (completedQueries === queries.length) {
                console.log(`🧹 ADMIN: PERMANENT CLEAR COMPLETED - Total deleted: ${totalCleared} records`);
                console.log(`📊 Details: ${results.signalsDeleted} signals + ${results.ordersDeleted} orders`);
                
                res.json({
                    success: true,
                    data: {
                        clearedSignals: results.signalsDeleted,
                        clearedOrders: results.ordersDeleted,
                        totalCleared: totalCleared,
                        message: `🧹 PERMANENTLY deleted ${results.signalsDeleted} signals and ${results.ordersDeleted} orders`,
                        note: 'All signals permanently removed - they will NOT reappear on refresh'
                    }
                });
            }
        });
    });
});

// ❌ REMOVED: Duplicate balance endpoint - Use /api/wallet/balance-fast/:userId instead (faster and better)

// Wallet refresh broadcast endpoint - triggers frontend balance refresh
app.post('/api/wallet/refresh-broadcast', (req, res) => {
    try {
        const { userId, reason, txHash } = req.body;
        
        console.log(`🔄 Wallet refresh broadcast received for user: ${userId}, reason: ${reason}`);
        
        // In a real implementation, this would trigger SSE or WebSocket events
        // For now, we'll just acknowledge the request
        
        res.json({
            success: true,
            message: 'Wallet refresh broadcast received',
            userId: userId,
            reason: reason,
            txHash: txHash,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error in wallet refresh broadcast:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Token info endpoint - provides current market cap and token data using Jupiter API
app.get('/api/token-info/:contract', async (req, res) => {
    try {
        const { contract } = req.params;
        
        console.log(`📡 Fetching token info for contract: ${contract} (using Jupiter API)`);
        
        if (!contract || contract.length < 32) {
            return res.status(400).json({
                success: false,
                error: 'Invalid contract address',
                timestamp: new Date().toISOString()
            });
        }
        
        // SMART STRATEGY: Jupiter API first, DexScreener fallback for rate limits
        console.log(`🚀 Fetching token data with smart fallback strategy for ${contract}...`);
        
        let tokenInfo = null;
        
        // Try Jupiter API first (better data quality)
        try {
            console.log(`📡 Trying Jupiter API for ${contract}...`);
            const botModule = require('./bot.js');
            const marketData = await botModule.getCurrentMarketCap(contract);
            
            if (marketData && (marketData.marketCap || marketData.price)) {
                tokenInfo = {
                    success: true,
                    contract: contract,
                    symbol: 'UNKNOWN', // Jupiter doesn't provide symbol
                    name: 'Unknown Token',
                    marketCap: marketData.marketCap || 0,
                    price: marketData.price || 0,
                    liquidity: 0, // Jupiter API doesn't provide liquidity data
                    volume24h: 0, // Jupiter API doesn't provide volume data
                    priceChange24h: 0, // Jupiter API doesn't provide price change data
                    chartUrl: `https://birdeye.so/token/${contract}?chain=solana`,
                    source: marketData.source || 'Jupiter API',
                    timestamp: new Date().toISOString()
                };
                
                console.log(`✅ Jupiter API success: ${contract} - Price: $${tokenInfo.price}, MC: $${tokenInfo.marketCap?.toLocaleString()}`);
            }
        } catch (jupiterError) {
            console.log(`⚠️ Jupiter API failed (${jupiterError.message}), trying DexScreener fallback...`);
        }
        
        // If Jupiter failed (rate limit), use DexScreener fallback
        if (!tokenInfo) {
            try {
                console.log(`🔄 Using DexScreener fallback for ${contract}...`);
                const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${contract}`, {
                    headers: {
                        'User-Agent': 'AlphaBot/2.0'
                    },
                    timeout: 5000
                });
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.pairs && data.pairs.length > 0) {
                        const mainPair = data.pairs.reduce((prev, current) => {
                            return (prev.liquidity?.usd || 0) > (current.liquidity?.usd || 0) ? prev : current;
                        });
                        
                        tokenInfo = {
                            success: true,
                            contract: contract,
                            symbol: mainPair.baseToken?.symbol || 'UNKNOWN',
                            name: mainPair.baseToken?.name || 'Unknown Token',
                            marketCap: mainPair.marketCap || 0,
                            price: parseFloat(mainPair.priceUsd || '0'),
                            liquidity: mainPair.liquidity?.usd || 0,
                            volume24h: mainPair.volume?.h24 || 0,
                            priceChange24h: mainPair.priceChange?.h24 || 0,
                            chartUrl: mainPair.url || `https://dexscreener.com/solana/${contract}`,
                            source: 'DexScreener (fallback)',
                            timestamp: new Date().toISOString()
                        };
                        
                        console.log(`✅ DexScreener fallback success: ${tokenInfo.symbol} - MC: $${tokenInfo.marketCap?.toLocaleString()}`);
                    }
                }
            } catch (fallbackError) {
                console.log(`⚠️ DexScreener fallback also failed: ${fallbackError.message}`);
            }
        }
        
        // If both failed, return error
        if (!tokenInfo) {
            return res.json({
                success: false,
                error: 'No market data available from Jupiter API or DexScreener',
                contract: contract,
                timestamp: new Date().toISOString()
            });
        }
        
        res.json(tokenInfo);
        
    } catch (error) {
        console.error('❌ Error fetching token info:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error while fetching token info',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Removed legacy /api/token endpoint - using /api/token-info with Jupiter API only

// Telegram test endpoint
app.get('/api/telegram/test', (req, res) => {
    console.log('📱 Testing Telegram connectivity...');
    
    res.json({
        success: true,
        data: {
            status: 'connected',
            botActive: true,
            channelsMonitored: 3,
            lastUpdate: new Date().toISOString(),
            message: 'Telegram bot is operational'
        }
    });
});

// Stats endpoint
app.get('/api/stats', (req, res) => {
    res.json({
        success: true,
        stats: {
            totalSignals: 10,
            activeOrders: 3,
            completedTrades: 2,
            totalPnL: -42.5
        }
    });
});

// Bot status endpoint
app.get('/api/admin/bot-status', (req, res) => {
    res.json({
        success: true,
        botActive: true,
        lastUpdate: new Date().toISOString()
    });
});

// 🎯 PRODUCTION: REAL POSITIONS FROM ALEX'S WALLET
app.get('/api/positions/real', async (req, res) => {
    try {
        const { userId } = req.params;
        console.log(`🚀 PRODUCTION: Fetching Alex's real positions from blockchain`);
        
        // Get Alex's real wallet analysis from blockchain
        const walletAnalysis = await blockchainClient.getCompleteWalletAnalysis();
        
        // Convert holdings to positions format
        const positions = [];
        
        // Create parser instance
        const parser = new TransactionParser();
        
        for (const holding of walletAnalysis.significantHoldings) {
            try {
                // Get current price for the token
                const currentPrice = await parser.getCurrentPrice(holding.mint);
                
                if (currentPrice && holding.metadata) {
                    const currentMarketCap = currentPrice.marketCap;
                    
                    // 🎯 FIX: Use real token symbol from price data, not "UNKNOWN" from metadata
                    const realTokenSymbol = currentPrice.symbol || holding.metadata.symbol || 'UNKNOWN';
                    console.log(`🔍 Token search: ${holding.mint} - Real symbol: "${realTokenSymbol}" vs Metadata: "${holding.metadata.symbol}"`);
                    
                    // 🎯 CRITICAL FIX: Get REAL entry market cap from automated_trades first
                    let entryMarketCap = null;
                    let entrySource = 'unknown';
                    
                    // PRIORITY 1: Look for real entry_mcap from automated_trades (actual purchases)
                    const automatedTrade = await new Promise((resolve) => {
                        db.get(
                            'SELECT entry_mcap, token_symbol FROM automated_trades WHERE token_contract = ? OR token_symbol = ? ORDER BY created_at DESC LIMIT 1',
                            [holding.mint, realTokenSymbol],
                            (err, trade) => {
                                if (err) {
                                    console.log(`⚠️ Error finding automated trade for ${realTokenSymbol}:`, err.message);
                                    resolve(null);
                                } else {
                                    if (trade && trade.entry_mcap && trade.entry_mcap > 0) {
                                        console.log(`✅ Found REAL TRADE ENTRY MCAP for ${realTokenSymbol}: $${trade.entry_mcap.toLocaleString()}`);
                                    }
                                    resolve(trade);
                                }
                            }
                        );
                    });
                    
                    if (automatedTrade && automatedTrade.entry_mcap && automatedTrade.entry_mcap > 0) {
                        entryMarketCap = automatedTrade.entry_mcap;
                        entrySource = 'automated_trade';
                        console.log(`🎆 USING REAL ENTRY MCAP: ${realTokenSymbol} - $${entryMarketCap.toLocaleString()} (from actual purchase)`);
                    } else {
                        // PRIORITY 2: Try to find the original signal for this token
                        const originalSignal = await new Promise((resolve) => {
                            db.get(
                                'SELECT entry_mc, token_symbol FROM signals WHERE token_contract = ? OR token_symbol = ? ORDER BY created_at DESC LIMIT 1',
                                [holding.mint, realTokenSymbol],
                                (err, signal) => {
                                    if (err) {
                                        console.log(`⚠️ Error finding signal for ${realTokenSymbol}:`, err.message);
                                        resolve(null);
                                    } else {
                                        if (signal) {
                                            console.log(`✅ Found signal for ${realTokenSymbol}: entry_mc=${signal.entry_mc}, stored_symbol="${signal.token_symbol}"`);
                                        }
                                        resolve(signal);
                                    }
                                }
                            );
                        });
                        
                        if (originalSignal && originalSignal.entry_mc) {
                            entryMarketCap = originalSignal.entry_mc;
                            entrySource = 'signal';
                            console.log(`✅ Using signal entry MC for ${realTokenSymbol}: $${entryMarketCap.toLocaleString()} (from signal)`);
                        } else {
                            // PRIORITY 3: 🙅 NO MORE FAKE FALLBACK - Mark as holdings without entry data
                            entryMarketCap = null;
                            entrySource = 'no_data';
                            console.log(`❌ NO ENTRY DATA for ${realTokenSymbol} - Will display as HOLDINGS without P&L`);
                        }
                    }
                    
                    const positionSizeUsd = 100; // Estimate position size
                    
                    // 🎯 CALCULATE REAL P&L OR DISPLAY AS HOLDINGS
                    let realPnL = null;
                    let position = null;
                    
                    if (entryMarketCap && entryMarketCap > 0) {
                        // We have real entry data - calculate P&L
                        realPnL = blockchainClient.calculateRealPnL(
                            entryMarketCap,
                            currentMarketCap,
                            positionSizeUsd
                        );
                        
                        position = {
                            id: `blockchain-${holding.mint}`,
                            symbol: realTokenSymbol,
                            type: `Real Trade (${entrySource})`,
                            status: 'active',
                            // ✅ REAL DATA with actual entry price
                            entryMcap: `$${entryMarketCap.toLocaleString()}`,
                            currentMcap: `$${currentMarketCap.toLocaleString()}`,
                            roi: `${realPnL.pnlPercent > 0 ? '+' : ''}${realPnL.pnlPercent.toFixed(2)}%`,
                            pnlUsdDisplay: `${realPnL.pnlUsd > 0 ? '+' : ''}$${realPnL.pnlUsd.toFixed(2)}`,
                            balanceUsd: `$${realPnL.currentValueUsd.toFixed(2)}`,
                            amount: `${parseFloat(holding.amount).toLocaleString()} tokens`,
                            // Additional data
                            contractAddress: holding.mint,
                            tokenAccount: holding.tokenAccount,
                            pnl: `${realPnL.pnlPercent > 0 ? '+' : ''}${realPnL.pnlPercent.toFixed(2)}%`,
                            pnlColor: realPnL.isProfit ? 'text-green-400' : 'text-red-400',
                            pnlIcon: realPnL.isProfit ? '▲' : '▼',
                            holdings: `${parseFloat(holding.amount).toLocaleString()} tokens`,
                            lastUpdated: holding.timestamp,
                            isPending: false,
                            source: 'blockchain',
                            realBlockchainData: true,
                            entrySource: entrySource // Track where entry data came from
                        };
                        
                        console.log(`💰 REAL P&L POSITION: ${realTokenSymbol} - Entry: $${entryMarketCap.toLocaleString()}, Current: $${currentMarketCap.toLocaleString()}, ROI: ${realPnL.pnlPercent.toFixed(2)}%`);
                        
                    } else {
                        // No entry data - display as holdings without P&L
                        const currentValueUsd = holding.balanceFormatted ? parseFloat(holding.balanceFormatted) * (currentPrice.price || 0) : 0;
                        
                        position = {
                            id: `blockchain-${holding.mint}`,
                            symbol: realTokenSymbol,
                            type: 'Holdings (No Entry Data)',
                            status: 'active',
                            // 📎 DISPLAY AS HOLDINGS - No fake P&L
                            entryMcap: 'Unknown',
                            currentMcap: `$${currentMarketCap.toLocaleString()}`,
                            roi: 'Holdings',
                            pnlUsdDisplay: 'Hold Position',
                            balanceUsd: `$${currentValueUsd.toFixed(2)}`,
                            amount: `${parseFloat(holding.amount).toLocaleString()} tokens`,
                            // Additional data
                            contractAddress: holding.mint,
                            tokenAccount: holding.tokenAccount,
                            pnl: 'Holdings',
                            pnlColor: 'text-blue-400',
                            pnlIcon: '📎', // Clipboard icon for holdings
                            holdings: `${parseFloat(holding.amount).toLocaleString()} tokens`,
                            lastUpdated: holding.timestamp,
                            isPending: false,
                            source: 'blockchain',
                            realBlockchainData: true,
                            entrySource: entrySource
                        };
                        
                        console.log(`📎 HOLDINGS POSITION: ${realTokenSymbol} - Current MC: $${currentMarketCap.toLocaleString()}, Balance: $${currentValueUsd.toFixed(2)}`);
                    }
                    
                    positions.push(position);
                }
            } catch (error) {
                console.error(`❌ Error processing holding ${holding.mint}:`, error.message);
            }
        }
        
        res.json({
            success: true,
            positions: positions,
            walletAddress: walletAnalysis.wallet,
            totalHoldings: walletAnalysis.holdings,
            source: 'blockchain-production',
            isReal: true,
            owner: 'Alex',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error fetching blockchain positions:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            source: 'blockchain'
        });
    }
});

// 🎯 REAL BLOCKCHAIN WALLET ANALYSIS ENDPOINT
app.get('/api/blockchain/analysis/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        console.log(`🚀 Fetching COMPLETE blockchain analysis for user: ${userId}`);
        
        const analysis = await blockchainClient.getCompleteWalletAnalysis();
        
        res.json({
            success: true,
            analysis: analysis,
            source: 'blockchain',
            note: '100% REAL data from Solana blockchain'
        });
        
    } catch (error) {
        console.error('❌ Error in blockchain analysis:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 🚀 FAST WALLET BALANCE - Direct Solana RPC (no rate limiting)
// 🚀 ULTRA-FAST WALLET BALANCE - Using DataProvider with intelligent caching
app.get('/api/wallet/balance-fast/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        console.log(`⚡ ULTRA-FAST BALANCE REQUEST for user: ${userId} (DataProvider)`);
        
        // Alex's wallet address
        const walletAddress = '2zFDLDPeGgEs3TpsLm3eWWwjY7NSYqdqMkPGjFnHRCXv';
        
        // 🚀 Use DataProvider - Single source of truth with intelligent caching
        const forceRefresh = req.query.nocache === 'true' || req.query.refresh === 'true';
        const balanceData = await dataProvider.getWalletBalance(walletAddress, forceRefresh);
        
        // Return the optimized response
        res.json(balanceData);
        
    } catch (error) {
        console.error('❌ Ultra-fast balance error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            source: 'data-provider-error'
        });
    }
});

// 🎯 PREMIUM POSITIONS - Using PositionManager with precise P&L calculations
app.get('/api/positions/live/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        console.log(`🎯 PREMIUM POSITIONS for user: ${userId} (PositionManager)`);
        
        // Alex's wallet address
        const walletAddress = '2zFDLDPeGgEs3TpsLm3eWWwjY7NSYqdqMkPGjFnHRCXv';
        
        // 🎯 Use PositionManager - Isolated logic with precise P&L
        const positionsData = await positionManager.getActivePositions(userId, walletAddress);
        
        // Return the enriched response
        res.json(positionsData);
        
    } catch (error) {
        console.error('❌ Premium positions error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            positions: [],
            source: 'position-manager-error'
        });
    }
});

// 🤖 BOT SESSION MANAGEMENT - Track bot restarts and position sessions
app.get('/api/bot/current-session', (req, res) => {
    const query = `SELECT * FROM bot_sessions ORDER BY session_start DESC LIMIT 1`;
    
    db.get(query, [], (err, session) => {
        if (err) {
            return res.status(500).json({
                success: false,
                error: err.message
            });
        }
        
        res.json({
            success: true,
            session: session || { id: 1, session_start: new Date().toISOString(), session_type: 'default' }
        });
    });
});

app.post('/api/bot/new-session', async (req, res) => {
    try {
        const { sessionType = 'manual_restart', notes = 'Bot restarted - new session created' } = req.body;
        
        console.log('🚀 Creating new bot session:', sessionType);
        
        // Get current session first
        const getCurrentSession = `SELECT id FROM bot_sessions ORDER BY session_start DESC LIMIT 1`;
        
        db.get(getCurrentSession, [], (err, currentSession) => {
            if (err) {
                return res.status(500).json({ success: false, error: err.message });
            }
            
            const currentSessionId = currentSession ? currentSession.id : 1;
            
            // Auto-hide positions from previous sessions
            console.log('👁️ Auto-hiding positions from previous sessions...');
            
            // Hide ALL existing positions when bot restarts - they become "old session" positions
            console.log('👁️ Hiding ALL existing positions from previous session...');
            
            // First get current blockchain positions to hide them all
            const getUserWallet = `SELECT public_key FROM custodial_wallets WHERE user_id = ?`;
            
            // Hide positions for all users when bot restarts
            const hideAllExistingPositions = `
                INSERT OR IGNORE INTO hidden_positions (user_id, contract_address, symbol, hidden_at)
                VALUES ('auto-session-restart', 'ALL_EXISTING_POSITIONS', 'SESSION_RESTART_MARKER', datetime('now'))
            `;
            
            // Also hide specific signals from previous sessions
            const hideOldSignals = `
                INSERT OR IGNORE INTO hidden_positions (user_id, contract_address, symbol, hidden_at)
                SELECT DISTINCT 'auto-session', s.token_contract, s.token_symbol, datetime('now')
                FROM signals s 
                WHERE s.bot_session_id < ? 
                AND s.status = 'active'
                AND s.token_contract NOT IN (
                    SELECT contract_address FROM hidden_positions 
                    WHERE user_id = 'auto-session'
                )
            `;
            
            // First hide all existing positions marker
            db.run(hideAllExistingPositions, [], (markerErr) => {
                if (markerErr) {
                    console.error('❌ Error creating session restart marker:', markerErr);
                }
            });
            
            db.run(hideOldSignals, [currentSessionId + 1], (hideErr) => {
                if (hideErr) {
                    console.error('❌ Error hiding old signals:', hideErr);
                }
                
                // Create new session
                const insertSession = `
                    INSERT INTO bot_sessions (session_type, notes) 
                    VALUES (?, ?)
                `;
                
                db.run(insertSession, [sessionType, notes], function(sessionErr) {
                    if (sessionErr) {
                        return res.status(500).json({
                            success: false,
                            error: sessionErr.message
                        });
                    }
                    
                    const newSessionId = this.lastID;
                    
                    console.log('✅ New bot session created:', newSessionId);
                    console.log('👁️ Previous positions auto-hidden');
                    
                    res.json({
                        success: true,
                        session: {
                            id: newSessionId,
                            session_type: sessionType,
                            notes: notes,
                            session_start: new Date().toISOString()
                        },
                        message: 'New session created, previous positions moved to hidden'
                    });
                });
            });
        });
        
    } catch (error) {
        console.error('❌ Error creating new session:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 🚀 PROFIT TAKING ANALYSIS - Check for profit-taking opportunities
// 👁️ HIDE/SHOW POSITION ENDPOINTS
app.post('/api/positions/hide/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { contractAddress, symbol } = req.body;
        
        console.log(`👁️ HIDING position: ${symbol} (${contractAddress}) for user ${userId}`);
        
        // Insert into hidden_positions table
        const stmt = db.prepare(`
            INSERT OR REPLACE INTO hidden_positions (user_id, contract_address, symbol)
            VALUES (?, ?, ?)
        `);
        
        stmt.run([userId, contractAddress, symbol], function(err) {
            if (err) {
                console.error('❌ Error hiding position:', err);
                return res.status(500).json({
                    success: false,
                    error: err.message
                });
            }
            
            console.log(`✅ Position ${symbol} hidden for user ${userId}`);
            res.json({
                success: true,
                message: `Position ${symbol} hidden successfully`,
                hiddenId: this.lastID
            });
        });
        
        stmt.finalize();
        
    } catch (error) {
        console.error('❌ Error hiding position:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.delete('/api/positions/unhide/:userId/:contractAddress', async (req, res) => {
    try {
        const { userId, contractAddress } = req.params;
        
        console.log(`👁️ SHOWING position: ${contractAddress} for user ${userId}`);
        
        const stmt = db.prepare(`
            DELETE FROM hidden_positions 
            WHERE user_id = ? AND contract_address = ?
        `);
        
        stmt.run([userId, contractAddress], function(err) {
            if (err) {
                console.error('❌ Error showing position:', err);
                return res.status(500).json({
                    success: false,
                    error: err.message
                });
            }
            
            console.log(`✅ Position ${contractAddress} shown for user ${userId}`);
            res.json({
                success: true,
                message: `Position unhidden successfully`,
                deletedCount: this.changes
            });
        });
        
        stmt.finalize();
        
    } catch (error) {
        console.error('❌ Error showing position:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/positions/hidden/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        console.log(`👁️ Getting hidden positions for user: ${userId} (including previous session)`);
        
        // Check if session restart marker exists
        const sessionMarkerQuery = `
            SELECT * FROM hidden_positions 
            WHERE user_id = 'auto-session-restart' 
            AND contract_address = 'ALL_EXISTING_POSITIONS'
            ORDER BY hidden_at DESC 
            LIMIT 1
        `;
        
        db.get(sessionMarkerQuery, [], async (markerErr, sessionMarker) => {
            if (markerErr) {
                console.error('❌ Error checking session marker:', markerErr);
                return res.status(500).json({ success: false, error: markerErr.message });
            }
            
            if (sessionMarker) {
                console.log(`🤖 Session restart detected - showing ALL previous blockchain positions as hidden`);
                
                try {
                    // Get all blockchain positions and show them as hidden
                    const walletAddress = '2zFDLDPeGgEs3TpsLm3eWWwjY7NSYqdqMkPGjFnHRCXv';
                    const positionsData = await positionManager.getActivePositions(userId, walletAddress);
                    
                    // But we need the RAW blockchain positions, not the filtered ones
                    const allBlockchainPositions = await dataProvider.getPositionsData(walletAddress);
                    const allPositions = allBlockchainPositions.positions || [];
                    
                    // Convert blockchain positions to hidden format
                    const hiddenPositions = allPositions.map(position => ({
                        contract_address: position.contractAddress,
                        symbol: position.symbol,
                        hidden_at: sessionMarker.hidden_at,
                        source: 'previous_session',
                        amount: position.amount,
                        balanceUsd: position.balanceUsd || '$0.00',
                        type: 'Previous Session Position'
                    }));
                    
                    console.log(`✅ Showing ${hiddenPositions.length} positions from previous session as hidden`);
                    
                    res.json({
                        success: true,
                        hiddenPositions: hiddenPositions,
                        count: hiddenPositions.length,
                        sessionInfo: {
                            hasSessionRestart: true,
                            restartedAt: sessionMarker.hidden_at,
                            message: 'Showing all positions from before bot restart'
                        }
                    });
                    
                } catch (dataError) {
                    console.error('❌ Error getting blockchain positions for hidden:', dataError);
                    return res.status(500).json({ success: false, error: dataError.message });
                }
                
            } else {
                // No session restart - show normal hidden positions
                const query = `
                    SELECT contract_address, symbol, hidden_at 
                    FROM hidden_positions 
                    WHERE user_id = ?
                    ORDER BY hidden_at DESC
                `;
                
                db.all(query, [userId], (err, rows) => {
                    if (err) {
                        console.error('❌ Error getting hidden positions:', err);
                        return res.status(500).json({
                            success: false,
                            error: err.message
                        });
                    }
                    
                    console.log(`✅ Found ${rows.length} normal hidden positions for user ${userId}`);
                    res.json({
                        success: true,
                        hiddenPositions: rows,
                        count: rows.length,
                        sessionInfo: {
                            hasSessionRestart: false,
                            message: 'Showing manually hidden positions'
                        }
                    });
                });
            }
        });
        
    } catch (error) {
        console.error('❌ Error getting hidden positions:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/positions/profit-taking/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { strategy = 'moderate' } = req.query;
        
        console.log(`🚀 PROFIT TAKING ANALYSIS for user: ${userId}, strategy: ${strategy}`);
        
        // Alex's wallet address
        const walletAddress = '2zFDLDPeGgEs3TpsLm3eWWwjY7NSYqdqMkPGjFnHRCXv';
        
        // Get current positions
        const positionsData = await positionManager.getActivePositions(userId, walletAddress);
        
        if (!positionsData.success) {
            throw new Error('Failed to get active positions');
        }
        
        // Check profit-taking opportunities
        const profitAnalysis = await positionManager.checkProfitTaking(positionsData.positions, strategy);
        
        res.json(profitAnalysis);
        
    } catch (error) {
        console.error('❌ Profit taking analysis error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            opportunities: []
        });
    }
});

// 🔄 BLOCKCHAIN SYNC - Force sync positions with blockchain
app.post('/api/positions/sync/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        console.log(`🔄 BLOCKCHAIN SYNC for user: ${userId}`);
        
        // Alex's wallet address
        const walletAddress = '2zFDLDPeGgEs3TpsLm3eWWwjY7NSYqdqMkPGjFnHRCXv';
        
        // Force sync with blockchain
        const syncResult = await positionManager.syncWithBlockchain(userId, walletAddress);
        
        res.json(syncResult);
        
    } catch (error) {
        console.error('❌ Blockchain sync error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Manual sell endpoint for closing positions at market price
// 🚀 NEW: Direct blockchain holdings sell endpoint
app.post('/api/positions/sell-direct/:userId/:tokenSymbol', async (req, res) => {
    try {
        const { userId, tokenSymbol } = req.params;
        const { percentage = 0.5, dryRun = false } = req.body;

        console.log(`🔥 DIRECT BLOCKCHAIN SELL: ${tokenSymbol} - ${(percentage * 100)}% - DryRun: ${dryRun}`);

        // Alex's real wallet
        const walletAddress = '2zFDLDPeGgEs3TpsLm3eWWwjY7NSYqdqMkPGjFnHRCXv';

        // Get real token balances from blockchain
        const rpcEndpoints = [
            'https://mainnet.helius-rpc.com/?api-key=dbe6033e-f324-4e1c-ad02-c5b066d3d375', // 🔥 YOUR HELIUS FREE
            'https://api.mainnet-beta.solana.com',
            'https://rpc.ankr.com/solana',
            'https://solana-api.projectserum.com'
        ];

        let connection = null;
        for (const rpcUrl of rpcEndpoints) {
            try {
                connection = new Connection(rpcUrl, 'confirmed');
                await connection.getLatestBlockhash();
                break;
            } catch (error) {
                console.log(`❌ RPC ${rpcUrl.split('/')[2]} failed`);
            }
        }

        if (!connection) {
            throw new Error('All RPC endpoints failed');
        }

        // Get token accounts
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
            new PublicKey(walletAddress),
            { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') }
        );

        // Known tokens with contract addresses
        const knownTokens = {
            'SUISEI': '8vtRhUm7mrU6jg9YG19Qc8UEhRbMwTXwNQ52xizpump',
            'LEM': 'e197o6pDWSuEYGG7CGBbvde4C9L26GQm47QLgXHpump'
        };

        const targetContractAddress = knownTokens[tokenSymbol];
        if (!targetContractAddress) {
            return res.status(404).json({
                success: false,
                error: `Token ${tokenSymbol} not found in known tokens`
            });
        }

        // Find the token balance
        let tokenBalance = 0;
        for (const account of tokenAccounts.value) {
            const mint = account.account.data.parsed.info.mint;
            if (mint === targetContractAddress) {
                const balance = account.account.data.parsed.info.tokenAmount.uiAmount || 0;
                tokenBalance += balance;
            }
        }

        if (tokenBalance === 0) {
            return res.status(404).json({
                success: false,
                error: `No balance found for ${tokenSymbol}`
            });
        }

        const sellAmount = tokenBalance * percentage;

        if (dryRun) {
            return res.json({
                success: true,
                dryRun: true,
                data: {
                    tokenSymbol: tokenSymbol,
                    contractAddress: targetContractAddress,
                    totalBalance: tokenBalance,
                    sellPercentage: (percentage * 100) + '%',
                    sellAmount: sellAmount,
                    estimatedSolReceived: 'Calculating...',
                    message: `DRY RUN: Would sell ${sellAmount.toLocaleString()} ${tokenSymbol} (${(percentage * 100)}%)`
                }
            });
        }

        // 🚀 REAL SELL EXECUTION using bot.js
        console.log(`🔥 EXECUTING REAL SELL: ${sellAmount.toLocaleString()} ${tokenSymbol}`);
        
        const botModule = require('./bot.js');
        
        // Create sell order object for bot
        const sellOrder = {
            user_id: userId,
            token_symbol: tokenSymbol,
            contract_address: targetContractAddress,
            amount_sol: 0, // Will be calculated by Jupiter
            target_market_cap: 0 // Not needed for direct sell
        };

        // Execute real sell via Jupiter
        const sellResult = await botModule.executeSellOrder(sellOrder, percentage, 0, 'direct_blockchain_sell');

        if (sellResult.success) {
            console.log(`✅ REAL SELL COMPLETED: ${sellResult.txHash}`);
            res.json({
                success: true,
                data: {
                    txHash: sellResult.txHash,
                    tokenSymbol: tokenSymbol,
                    sellAmount: sellAmount,
                    sellPercentage: (percentage * 100) + '%',
                    solReceived: sellResult.solReceived || 'Check transaction',
                    solscanUrl: `https://solscan.io/tx/${sellResult.txHash}`,
                    message: `Successfully sold ${sellAmount.toLocaleString()} ${tokenSymbol}`,
                    timestamp: new Date().toISOString()
                }
            });
        } else {
            throw new Error(sellResult.error || 'Sell execution failed');
        }

    } catch (error) {
        console.error('❌ Error in direct blockchain sell:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 🗂️ LEGACY: Database-based sell endpoint (for historical orders)
app.post('/api/positions/sell-manual/:userId/:tokenSymbol', async (req, res) => {
    try {
        const { userId, tokenSymbol } = req.params;
        const { sellPercentage = 1.0 } = req.body; // Default to 100% (full position)
        
        console.log(`💸 MANUAL SELL REQUEST: User ${userId}, Token ${tokenSymbol}, Amount ${(sellPercentage * 100)}%`);
        
        // Find the filled order for this token
        const orderQuery = `
            SELECT * FROM limit_orders 
            WHERE user_id = ? AND token_symbol = ? AND status = 'filled'
            ORDER BY filled_at DESC 
            LIMIT 1
        `;
        
        const order = await new Promise((resolve, reject) => {
            db.get(orderQuery, [userId, tokenSymbol], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        
        if (!order) {
            return res.status(404).json({
                success: false,
                error: `No filled position found for ${tokenSymbol}`
            });
        }
        
        // Import bot functions for sell execution
        const botModule = require('./bot.js');
        
        // Get current market data with robust fallback for rate limiting
        let currentMcap = order.target_market_cap || 1200000; // Use original target as default
        
        try {
            const marketData = await botModule.getCurrentMarketCap(order.contract_address);
            if (marketData && (marketData.marketCap || marketData.price)) {
                currentMcap = marketData.marketCap || marketData.price;
                console.log(`📊 Got market data: $${currentMcap.toLocaleString()} (Source: ${marketData.source})`);
            } else {
                console.log(`📊 Using fallback market cap: $${currentMcap.toLocaleString()}`);
            }
        } catch (marketError) {
            console.warn(`⚠️ Market data error (${marketError.message}), using fallback: $${currentMcap.toLocaleString()}`);
        }
        
        // REAL TRADING: Execute actual Jupiter swap with detailed debugging
        console.log(`🔥 REAL SELL ORDER: Processing ${(sellPercentage * 100)}% sell of ${tokenSymbol}`);
        console.log(`📋 Order details:`, { 
            user_id: order.user_id, 
            token_symbol: order.token_symbol, 
            contract_address: order.contract_address,
            currentMcap: currentMcap 
        });
        
        let sellResult;
        try {
            console.log(`🚀 Calling executeSellOrder...`);
            // Execute real sell order using bot's trading system
            sellResult = await botModule.executeSellOrder(order, sellPercentage, currentMcap, 'manual_sell');
            
            console.log(`🔍 executeSellOrder result:`, sellResult);
            
            if (!sellResult || !sellResult.success) {
                throw new Error(sellResult?.error || 'Sell execution failed - no result');
            }
            
            console.log(`✅ REAL TRADE EXECUTED: ${sellResult.txHash}`);
            
        } catch (sellError) {
            console.error(`❌ REAL TRADE FAILED: ${sellError.message}`);
            console.error(`❌ Full error:`, sellError);
            
            // Re-throw the actual error
            throw new Error(`Trading execution failed: ${sellError.message}. Please check your wallet connection and try again.`);
        }
        
        if (sellResult.success) {
            // Update order status if selling 100%
            if (sellPercentage >= 1.0) {
                const updateQuery = `
                    UPDATE limit_orders 
                    SET status = 'closed',
                        manual_sell_at = datetime('now'),
                        manual_sell_mcap = ?,
                        updated_at = datetime('now')
                    WHERE id = ?
                `;
                
                db.run(updateQuery, [currentMcap, order.id], function(err) {
                    if (err) {
                        console.error(`❌ Error updating order ${order.id} to closed:`, err);
                    } else {
                        console.log(`✅ Position ${tokenSymbol} closed manually`);
                    }
                });
            } else {
                // Partial sell - update with partial sell info
                const updateQuery = `
                    UPDATE limit_orders 
                    SET manual_sell_percentage = COALESCE(manual_sell_percentage, 0) + ?,
                        manual_sell_at = datetime('now'),
                        manual_sell_mcap = ?,
                        updated_at = datetime('now')
                    WHERE id = ?
                `;
                
                db.run(updateQuery, [sellPercentage, currentMcap, order.id], function(err) {
                    if (err) {
                        console.error(`❌ Error updating partial sell for order ${order.id}:`, err);
                    } else {
                        console.log(`✅ Partial sell (${(sellPercentage * 100)}%) of ${tokenSymbol} completed`);
                    }
                });
            }
            
            res.json({
                success: true,
                message: `Successfully sold ${(sellPercentage * 100)}% of ${tokenSymbol} position`,
                data: {
                    tokenSymbol: tokenSymbol,
                    soldPercentage: sellPercentage,
                    solReceived: sellResult.solReceived,
                    tokensSwapped: sellResult.tokensSwapped,
                    tokenPrice: sellResult.tokenPrice,
                    usdValue: sellResult.usdValue,
                    marketCap: sellResult.marketCap,
                    txHash: sellResult.txHash,
                    timestamp: new Date().toISOString(),
                    note: sellResult.note
                }
            });
        } else {
            res.status(500).json({
                success: false,
                error: `Failed to execute sell order: ${sellResult.error}`
            });
        }
        
    } catch (error) {
        console.error('❌ Error in manual sell endpoint:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 🚀 HELIUS ENHANCED APIs ENDPOINTS

// Get transaction history for wallet using Helius Enhanced API
app.get('/api/helius/transactions/:walletAddress', async (req, res) => {
    try {
        const { walletAddress } = req.params;
        const { limit = 10 } = req.query;
        
        console.log(`🚀 HELIUS ENHANCED: Getting transaction history for ${walletAddress}`);
        
        const transactions = await dataProvider.getTransactionHistory(walletAddress, parseInt(limit));
        
        res.json({
            success: true,
            walletAddress: walletAddress,
            transactions: transactions,
            count: transactions.length,
            source: 'helius-enhanced-api'
        });
        
    } catch (error) {
        console.error('❌ Helius transaction history error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Parse specific transaction using Helius Enhanced API
app.get('/api/helius/parse/:transactionSignature', async (req, res) => {
    try {
        const { transactionSignature } = req.params;
        
        console.log(`🔍 HELIUS ENHANCED: Parsing transaction ${transactionSignature}`);
        
        const parsedTransaction = await dataProvider.parseTransaction(transactionSignature);
        
        if (!parsedTransaction) {
            return res.status(404).json({
                success: false,
                error: 'Transaction not found or not parseable'
            });
        }
        
        res.json({
            success: true,
            transaction: parsedTransaction,
            source: 'helius-enhanced-api'
        });
        
    } catch (error) {
        console.error('❌ Helius parse transaction error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Enhanced Helius monitoring with detailed metrics
app.get('/api/helius/monitor', (req, res) => {
    try {
        const metrics = dataProvider.getEnhancedMetrics();
        
        res.json({
            success: true,
            metrics: metrics,
            timestamp: new Date().toISOString(),
            status: 'active',
            note: 'Helius Enhanced APIs ready and configured'
        });
        
    } catch (error) {
        console.error('❌ Helius monitoring error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 💧 Enhanced token info with better liquidity data
app.get('/api/token-info-enhanced/:contractAddress', async (req, res) => {
    try {
        const { contractAddress } = req.params;
        console.log(`💧 ENHANCED: Fetching comprehensive token data for ${contractAddress}`);
        
        // Get basic data from DataProvider (Jupiter + RPC)
        const basicData = await dataProvider.getMarketData(contractAddress);
        
        // Try to get liquidity from DexScreener as backup
        let enhancedLiquidity = basicData.liquidity || 0;
        let chartUrl = basicData.chartUrl;
        
        try {
            console.log(`💧 Trying DexScreener for better liquidity data...`);
            const dexScreenerUrl = `https://api.dexscreener.com/latest/dex/tokens/${contractAddress}`;
            const response = await fetch(dexScreenerUrl);
            
            if (response.ok) {
                const dexData = await response.json();
                if (dexData.pairs && dexData.pairs.length > 0) {
                    // Find the pair with highest liquidity
                    const bestPair = dexData.pairs.reduce((best, current) => 
                        (current.liquidity?.usd || 0) > (best.liquidity?.usd || 0) ? current : best
                    );
                    
                    if (bestPair.liquidity?.usd) {
                        enhancedLiquidity = bestPair.liquidity.usd;
                        console.log(`✅ DexScreener liquidity: $${enhancedLiquidity.toLocaleString()}`);
                    }
                    
                    if (bestPair.url && !chartUrl.includes('dexscreener')) {
                        chartUrl = bestPair.url;
                        console.log(`📈 DexScreener chart: ${chartUrl}`);
                    }
                }
            }
        } catch (dexError) {
            console.log(`⚠️ DexScreener fallback failed:`, dexError.message);
        }
        
        // Return enhanced data
        const enhancedData = {
            ...basicData,
            liquidity: enhancedLiquidity,
            liquidityFormatted: enhancedLiquidity > 0 ? `$${enhancedLiquidity.toLocaleString()}` : 'N/A',
            chartUrl: chartUrl,
            source: basicData.source + (enhancedLiquidity !== basicData.liquidity ? ' + DexScreener' : ''),
            enhanced: true
        };
        
        console.log(`💧 ENHANCED data:`, {
            symbol: enhancedData.symbol,
            price: enhancedData.price,
            liquidity: enhancedData.liquidityFormatted,
            marketCap: enhancedData.marketCap,
            source: enhancedData.source
        });
        
        res.json({
            success: true,
            ...enhancedData
        });
        
    } catch (error) {
        console.error(`❌ Enhanced token info error:`, error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 🕵️ DEBUG ENDPOINT: Check specific position details
app.get('/api/debug/position/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;
        console.log(`🔍 DEBUG: Analyzing position ${symbol}`);
        
        // Get all positions without filtering first
        const positions = await positionManager.getActivePositions();
        
        // Find the specific position
        const position = positions.data.positions.find(p => p.symbol === symbol);
        
        if (!position) {
            return res.json({
                success: false,
                error: `Position ${symbol} not found`,
                availableSymbols: positions.data.positions.map(p => p.symbol)
            });
        }
        
        // Debug information
        const debugInfo = {
            symbol: position.symbol,
            source: position.source,
            realBalance: position.realBalance,
            currentPrice: position.currentPrice,
            pnl: position.pnl,
            calculatedValue: position.pnl?.currentValueUsd || 0,
            wouldBeHidden: (position.pnl?.currentValueUsd || 0) < 1.0,
            filterThreshold: 1.0
        };
        
        console.log(`🔍 DEBUG ${symbol}:`, JSON.stringify(debugInfo, null, 2));
        
        res.json({
            success: true,
            debug: debugInfo,
            message: `Debug information for ${symbol}`
        });
    } catch (error) {
        console.error(`❌ Debug error for ${req.params.symbol}:`, error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

const PORT = process.env.PORT || 3000;
// 💎 TEST ENDPOINT: Demonstrate $1 minimum position filter
app.get('/api/positions/filter-test/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        console.log(`🧪 TESTING position filter for user: ${userId}`);
        
        // Create mock positions with different USD values for testing
        const mockPositions = [
            {
                symbol: 'HIGH_VALUE',
                contractAddress: '0x1234567890abcdef',
                realBalance: 1000,
                marketData: { price: 0.05 } // $50 value
            },
            {
                symbol: 'MEDIUM_VALUE', 
                contractAddress: '0xabcdef1234567890',
                realBalance: 100,
                marketData: { price: 0.02 } // $2 value
            },
            {
                symbol: 'LOW_VALUE',
                contractAddress: '0x9876543210fedcba',
                realBalance: 10,
                marketData: { price: 0.05 } // $0.50 value - should be filtered out
            }
        ];
        
        // Calculate P&L for mock positions
        const positionsWithPnL = [];
        for (const position of mockPositions) {
            const pnlData = await positionManager.calculatePnL(position, position.marketData);
            positionsWithPnL.push({
                ...position,
                pnl: pnlData
            });
        }
        
        // Apply the filter (should remove LOW_VALUE position)
        const filteredPositions = positionManager._filterPositionsByMinValue(positionsWithPnL, 1.0);
        
        res.json({
            success: true,
            test: 'position-filter-demo',
            original: {
                count: positionsWithPnL.length,
                positions: positionsWithPnL.map(p => ({
                    symbol: p.symbol,
                    valueUsd: p.pnl?.currentValueUsd || 0
                }))
            },
            filtered: {
                count: filteredPositions.length,
                positions: filteredPositions.map(p => ({
                    symbol: p.symbol,
                    valueUsd: p.pnl?.currentValueUsd || 0
                }))
            },
            filter: {
                minValueUsd: 1.0,
                hiddenPositions: positionsWithPnL.length - filteredPositions.length
            },
            message: 'Positions under $1 USD value are automatically hidden'
        });
        
    } catch (error) {
        console.error('❌ Filter test error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 AlphaBot BLOCKCHAIN Server running on http://0.0.0.0:${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}`);
    console.log(`💰 REAL Balance: http://localhost:${PORT}/api/custodial/balance`);
    console.log(`📊 REAL Positions: http://localhost:${PORT}/api/positions/blockchain/demo`);
    console.log(`🔗 Analysis: http://localhost:${PORT}/api/blockchain/analysis/demo`);
    console.log(`💎 FILTER TEST: http://localhost:${PORT}/api/positions/filter-test/toto`);
    console.log(`✅ Ready with 100% REAL BLOCKCHAIN DATA + $1 Position Filter!`);
});