/**
 * 🎯 ALPHABOT POSITION MANAGER - ISOLATED POSITION LOGIC
 * 
 * Separates all position-related functionality:
 * - Real-time position tracking
 * - P&L calculations (mathematical precision)
 * - Position synchronization with blockchain
 * - Entry/Exit tracking
 * - Profit-taking logic
 * 
 * Benefits:
 * - Changes in trading won't break position tracking
 * - Changes in data fetching won't affect P&L calculations
 * - Easy to test individual position logic
 * - Consistent P&L across all systems
 * 
 * Author: Claude for Alex's AlphaBot
 * Created: 2025-08-25
 */

const dataProvider = require('./data-provider.js');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 💾 DATABASE CONNECTION for automated_trades queries
const dbPath = path.join(__dirname, 'alphabot_signals.db');
const db = new sqlite3.Database(dbPath);

class PositionManager {
    constructor() {
        // 💾 Database instance for automated_trades queries
        this.db = db;
        
        // 🤖 BOT SESSION TRACKING - Cache current session
        this.currentBotSession = null;
        this.sessionCacheExpiry = null;
        
        // 📊 POSITION TRACKING CONFIGURATION
        this.config = {
            // P&L calculation settings
            defaultEntryBuffer: 0.8, // Assume entry at 80% of signal MC if no data
            minPositionValueUsd: 1.0, // Hide positions under $1 USD (Alex's request)
            profitTakingThresholds: {
                conservative: 2.0,    // 2x market cap
                moderate: 3.0,        // 3x market cap
                aggressive: 5.0       // 5x market cap
            },
            
            // Position status definitions
            statusTypes: {
                ACTIVE: 'active',
                PENDING: 'pending',
                CLOSED: 'closed',
                ERROR: 'error'
            },
            
            // Position types
            positionTypes: {
                REAL_HOLDINGS: 'Real Holdings',
                LIMIT_ORDER: 'Limit Order',
                MARKET_ORDER: 'Market Order',
                PROFIT_TAKEN: 'Profit Taken'
            }
        };
        
        // 🧠 CALCULATION CACHE (separate from DataProvider cache)
        this.calculationCache = new Map();
        this.calculationCacheTTL = 10000; // 10 seconds for P&L calculations
        
        console.log('🎯 PositionManager initialized - Isolated position logic ready');
    }

    /**
     * 💎 GET ACTIVE POSITIONS - Main entry point for position data
     */
    async getActivePositions(userId, walletAddress) {
        try {
            console.log(`🎯 POSITION MANAGER: Getting active positions for user ${userId}`);
            
            // Get real blockchain holdings via DataProvider
            const blockchainPositions = await this._getBlockchainPositions(walletAddress);
            
            // Get database-tracked positions (limit orders, filled orders)
            const dbPositions = await this._getDatabasePositions(userId);
            
            // Merge and deduplicate positions
            const mergedPositions = this._mergePositions(blockchainPositions, dbPositions);
            
            // Calculate P&L for all positions
            const positionsWithPnL = await this._calculateAllPnL(mergedPositions);
            
            // 💎 FILTER: Hide positions under $1 USD value (as requested by Alex)
            const filteredPositions = this._filterPositionsByMinValue(positionsWithPnL, this.config.minPositionValueUsd);
            
            // Sort by value (highest first)
            const sortedPositions = this._sortPositions(filteredPositions);
            
            return {
                success: true,
                positions: sortedPositions,
                count: sortedPositions.length,
                summary: this._generatePositionSummary(sortedPositions),
                source: 'position-manager',
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            console.error('❌ PositionManager error:', error);
            throw error;
        }
    }

    /**
     * 🤖 GET CURRENT BOT SESSION
     */
    async _getCurrentBotSession() {
        try {
            // Cache session for 5 minutes to avoid repeated queries
            const now = Date.now();
            if (this.currentBotSession && this.sessionCacheExpiry && now < this.sessionCacheExpiry) {
                return this.currentBotSession;
            }
            
            const query = `SELECT * FROM bot_sessions ORDER BY session_start DESC LIMIT 1`;
            
            const session = await new Promise((resolve, reject) => {
                this.db.get(query, [], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });
            
            // Cache result for 5 minutes
            this.currentBotSession = session || { id: 1, session_start: new Date().toISOString() };
            this.sessionCacheExpiry = now + (5 * 60 * 1000); // 5 minutes
            
            console.log(`🤖 Current bot session: ${this.currentBotSession.id} (started: ${this.currentBotSession.session_start})`);
            
            return this.currentBotSession;
            
        } catch (error) {
            console.error('❌ Error getting current bot session:', error);
            // Fallback to session 1
            return { id: 1, session_start: new Date().toISOString() };
        }
    }

    /**
     * 📊 CALCULATE P&L - MATHEMATICALLY PRECISE
     */
    async calculatePnL(position, marketData, entryData = null) {
        try {
            console.log(`🎯 P&L START: ${position.symbol} - Source: ${position.source}, EntryValue: ${position.entryValue}`);
            
            const cacheKey = `pnl_${position.contractAddress}_${marketData?.price || 0}_${entryData?.entryMcap || 0}`;
            
            // Check calculation cache
            if (this._isValidCalculationCache(cacheKey)) {
                const cached = this.calculationCache.get(cacheKey);
                console.log(`⚡ P&L CACHE HIT: ${position.symbol}`);
                return cached.data;
            }
            
            console.log(`🧮 CALCULATING P&L: ${position.symbol}`);
            
            // Get current market data if not provided
            if (!marketData) {
                marketData = await dataProvider.getMarketData(position.contractAddress);
            }
            
            // Determine entry market cap
            let entryMcap = null;
            let entrySource = 'unknown';
            
            // PRIORITY 1: Use provided entryData (from API calls)
            if (entryData && entryData.entryMcap) {
                entryMcap = entryData.entryMcap;
                entrySource = 'provided';
                console.log(`✅ Using provided entry mcap for ${position.symbol}: $${entryMcap.toLocaleString()}`);
            } 
            // PRIORITY 2: Look for real entry_mcap from automated_trades table
            else {
                const realEntryMcap = await this._getRealEntryMcap(position);
                if (realEntryMcap && realEntryMcap > 0) {
                    entryMcap = realEntryMcap;
                    entrySource = 'automated_trade';
                    console.log(`🎯 REAL ENTRY MCAP FOUND: ${position.symbol} - $${entryMcap.toLocaleString()} (from actual purchase)`);
                }
                // PRIORITY 3: Use order target (limit orders)
                else if (position.target_market_cap || position.entryMcap) {
                    entryMcap = position.target_market_cap || position.entryMcap;
                    entrySource = 'order_target';
                    console.log(`🔖 Using order target for ${position.symbol}: $${entryMcap.toLocaleString()}`);
                }
                // PRIORITY 4: NO MORE FAKE ESTIMATES - Show as Hold Position
                else {
                    entryMcap = null;
                    entrySource = 'no_entry_data';
                    console.log(`❌ NO ENTRY DATA for ${position.symbol} - Will show as holdings`);
                }
            }
            
            // Calculate P&L if we have the necessary data
            let pnlData = null;
            
            if (entryMcap && marketData && (marketData.marketCap || marketData.price)) {
                const currentMcap = marketData.marketCap || marketData.price;
                
                // 🎯 MATHEMATICALLY CORRECT P&L CALCULATION
                const mcapChange = currentMcap - entryMcap;
                const mcapChangePercent = ((currentMcap - entryMcap) / entryMcap) * 100;
                
                // 💰 REAL POSITION VALUE CALCULATION
                let currentValueUsd = 0;
                
                console.log(`🔍 VALUE CALC CHECK: ${position.symbol} - Source: ${position.source}, RealBalance: ${position.realBalance}, Price: ${marketData?.price}, EntryValue: ${position.entryValue}`);
                
                if (position.realBalance && marketData.price) {
                    // Standard calculation for blockchain positions
                    currentValueUsd = position.realBalance * marketData.price;
                    console.log(`💰 BLOCKCHAIN VALUE: ${position.symbol} - ${position.realBalance} * ${marketData.price} = $${currentValueUsd.toFixed(2)}`);
                } else if (position.source === 'database-order') {
                    // Special calculation for filled orders: estimate value based on SOL spent and market cap change
                    const solToUsdRate = 150; // Approximate SOL price (could be made dynamic)
                    const entryValueUsd = position.entryValue * solToUsdRate;
                    
                    console.log(`🔍 ORDER DEBUG: ${position.symbol} - Source: ${position.source}, EntryValue: ${position.entryValue}, EntryMcap: ${position.entryMcap}, CurrentMcap: ${currentMcap}`);
                    
                    if (position.entryMcap && currentMcap && position.entryMcap > 0) {
                        // Calculate value based on market cap change
                        const mcapMultiplier = currentMcap / position.entryMcap;
                        currentValueUsd = entryValueUsd * mcapMultiplier;
                        console.log(`💰 ORDER VALUE: ${position.symbol} - Entry: $${entryValueUsd.toFixed(2)} (${position.entryValue} SOL) -> Current: $${currentValueUsd.toFixed(2)} (${mcapMultiplier.toFixed(2)}x)`);
                    } else {
                        // Fallback: use entry value if no market cap data
                        currentValueUsd = entryValueUsd;
                        console.log(`💰 ORDER VALUE (fallback): ${position.symbol} - $${currentValueUsd.toFixed(2)}`);
                    }
                } else {
                    console.log(`🚫 NO VALUE CALC: ${position.symbol} - Source: ${position.source}, HasRealBalance: ${!!position.realBalance}, HasPrice: ${!!marketData?.price}, HasEntryValue: ${!!position.entryValue}`);
                }
                
                // 🚫 NO FAKE P&L - We don't know entry price without real entry data
                const pnlUsd = 0; // Can't calculate without real entry data
                const entryValueUsd = currentValueUsd; // Show current value as entry (no P&L)
                
                // Determine if profitable
                const isProfit = mcapChangePercent > 0;
                
                // Calculate entry value based on position type
                let finalEntryValueUsd = 0;
                if (position.source === 'database-order' && position.entryValue) {
                    finalEntryValueUsd = position.entryValue * 150; // SOL to USD approximation
                } else {
                    finalEntryValueUsd = currentValueUsd; // Fallback for other positions
                }
                
                console.log(`💎 SAVING P&L DATA: ${position.symbol} - currentValueUsd: $${currentValueUsd.toFixed(2)}, entryValueUsd: $${finalEntryValueUsd.toFixed(2)}`);
                
                pnlData = {
                    // Core P&L metrics
                    pnlPercentage: mcapChangePercent,
                    pnlUsd: pnlUsd,
                    currentValueUsd: currentValueUsd,
                    entryValueUsd: finalEntryValueUsd,
                    
                    // Market cap data
                    entryMarketCap: entryMcap,
                    currentMarketCap: currentMcap,
                    marketCapChange: mcapChange,
                    marketCapChangePercent: mcapChangePercent,
                    
                    // Status indicators
                    isProfit: isProfit,
                    entrySource: entrySource,
                    
                    // Profit-taking analysis
                    profitTakingStatus: this._analyzeProfitTaking(mcapChangePercent),
                    
                    // Formatting helpers
                    pnlDisplay: `${isProfit ? '+' : ''}${mcapChangePercent.toFixed(2)}%`,
                    pnlUsdDisplay: `${isProfit ? '+' : ''}$${pnlUsd.toFixed(2)}`,
                    pnlColor: isProfit ? 'text-green-400' : 'text-red-400',
                    pnlIcon: isProfit ? '▲' : '▼',
                    
                    // Calculation metadata
                    calculationMethod: 'position-manager-precise',
                    timestamp: new Date().toISOString()
                };
                
                console.log(`✅ P&L calculated for ${position.symbol}: ${pnlData.pnlDisplay} (${entrySource} entry)`);
                
            } else {
                // 💰 SMART P&L CALCULATION using 24h price change
                let currentValueUsd = 0;
                
                if (position.realBalance && marketData?.price) {
                    // Standard calculation for blockchain positions
                    currentValueUsd = position.realBalance * marketData.price;
                } else if (position.source === 'database-order' && position.entryValue) {
                    // Special calculation for filled orders
                    const solToUsdRate = 150; // Approximate SOL price
                    currentValueUsd = position.entryValue * solToUsdRate; // Use SOL spent as base value
                    console.log(`💰 ORDER VALUE (24h): ${position.symbol} - ${position.entryValue} SOL * ${solToUsdRate} = $${currentValueUsd.toFixed(2)}`);
                } else {
                    console.log(`💰 SKIPPED VALUE CALC: ${position.symbol} - Source: ${position.source}, EntryValue: ${position.entryValue}, RealBalance: ${position.realBalance}`);
                }
                
                // 📈 Use 24h price change as reference for P&L calculation
                let pnlPercentage = 0;
                let pnlUsd = 0;
                let pnlColor = 'text-blue-400';
                let pnlIcon = '📎';
                let pnlDisplay = 'Holdings';
                let pnlUsdDisplay = 'Hold Position';
                
                if (marketData && marketData.priceChange24h !== undefined) {
                    pnlPercentage = marketData.priceChange24h;
                    pnlUsd = (pnlPercentage / 100) * currentValueUsd;
                    
                    // 🎨 Color and icon based on performance
                    if (pnlPercentage > 0) {
                        pnlColor = 'text-green-400';
                        pnlIcon = '▲';
                        pnlDisplay = `+${pnlPercentage.toFixed(2)}%`;
                        pnlUsdDisplay = `+$${Math.abs(pnlUsd).toFixed(2)}`;
                    } else if (pnlPercentage < 0) {
                        pnlColor = 'text-red-400';
                        pnlIcon = '▼';
                        pnlDisplay = `${pnlPercentage.toFixed(2)}%`;
                        pnlUsdDisplay = `-$${Math.abs(pnlUsd).toFixed(2)}`;
                    } else {
                        pnlDisplay = '0.00%';
                        pnlUsdDisplay = '$0.00';
                    }
                    
                    console.log(`📈 ${position.symbol}: 24h P&L = ${pnlDisplay} (${pnlUsdDisplay})`);
                } else {
                    console.log(`📎 ${position.symbol}: No 24h data - showing as holdings`);
                }
                
                pnlData = {
                    // ✅ REAL VALUES based on 24h change
                    pnlPercentage: pnlPercentage,
                    pnlUsd: pnlUsd,
                    currentValueUsd: currentValueUsd,
                    entryValueUsd: currentValueUsd - pnlUsd, // Estimated entry value
                    
                    // 📋 DISPLAY VALUES with real P&L
                    pnlDisplay: pnlDisplay,
                    pnlUsdDisplay: pnlUsdDisplay,
                    pnlColor: pnlColor,
                    pnlIcon: pnlIcon,
                    
                    // ℹ️ STATUS
                    entrySource: '24h_reference',
                    calculationMethod: 'smart-pnl-24h',
                    timestamp: new Date().toISOString()
                };
                
                console.log(`📈 ${position.symbol}: Smart P&L calculated using 24h change`);
            }
            
            // Cache the calculation
            this._setCalculationCache(cacheKey, pnlData);
            
            return pnlData;
            
        } catch (error) {
            console.error(`❌ P&L calculation error for ${position.symbol}:`, error);
            
            // Return error P&L structure
            return {
                pnlPercentage: 0,
                pnlUsd: 0,
                currentValueUsd: 0,
                pnlDisplay: 'Error',
                pnlUsdDisplay: 'Error',
                pnlColor: 'text-red-400',
                pnlIcon: '❌',
                error: error.message,
                calculationMethod: 'error'
            };
        }
    }

    /**
     * 🎯 CHECK PROFIT TAKING OPPORTUNITIES
     */
    async checkProfitTaking(positions, strategy = 'moderate') {
        try {
            console.log(`🎯 CHECKING PROFIT TAKING: ${strategy} strategy for ${positions.length} positions`);
            
            const threshold = this.config.profitTakingThresholds[strategy] || 2.0;
            const opportunities = [];
            
            for (const position of positions) {
                if (position.pnl && position.pnl.marketCapChangePercent) {
                    const currentRatio = (position.pnl.currentMarketCap / position.pnl.entryMarketCap);
                    
                    if (currentRatio >= threshold) {
                        const opportunity = {
                            position: position,
                            currentRatio: currentRatio,
                            threshold: threshold,
                            profitPotential: position.pnl.pnlUsd,
                            recommendedAction: 'SELL_PARTIAL', // Sell 50% by default
                            urgency: currentRatio >= (threshold * 1.5) ? 'HIGH' : 'MEDIUM',
                            message: `${position.symbol} reached ${currentRatio.toFixed(2)}x (target: ${threshold}x)`
                        };
                        
                        opportunities.push(opportunity);
                        console.log(`🚀 PROFIT OPPORTUNITY: ${opportunity.message}`);
                    }
                }
            }
            
            return {
                success: true,
                opportunities: opportunities,
                count: opportunities.length,
                strategy: strategy,
                threshold: threshold,
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            console.error('❌ Profit taking check error:', error);
            throw error;
        }
    }

    /**
     * 📈 SYNC WITH BLOCKCHAIN - Ensure positions match reality
     */
    async syncWithBlockchain(userId, walletAddress) {
        try {
            console.log(`🔄 SYNCING POSITIONS: User ${userId} with blockchain`);
            
            // Get fresh data from blockchain (force refresh)
            const blockchainData = await dataProvider.getWalletBalance(walletAddress, true);
            
            if (!blockchainData.success) {
                throw new Error('Failed to fetch blockchain data');
            }
            
            // Convert blockchain tokens to positions format
            const syncedPositions = [];
            
            for (const token of blockchainData.tokens) {
                // Get market data for each token
                const marketData = await dataProvider.getMarketData(token.mint);
                
                const position = {
                    id: `synced-${token.symbol}`,
                    symbol: token.symbol,
                    contractAddress: token.mint,
                    type: this.config.positionTypes.REAL_HOLDINGS,
                    status: this.config.statusTypes.ACTIVE,
                    
                    // Blockchain data
                    realBalance: token.balance,
                    balanceFormatted: token.balanceFormatted,
                    
                    // Market data
                    marketData: marketData,
                    
                    // Metadata
                    source: 'blockchain-sync',
                    lastSynced: new Date().toISOString()
                };
                
                // Calculate P&L
                position.pnl = await this.calculatePnL(position, marketData);
                
                syncedPositions.push(position);
            }
            
            console.log(`✅ SYNC COMPLETE: ${syncedPositions.length} positions synced`);
            
            return {
                success: true,
                syncedPositions: syncedPositions,
                count: syncedPositions.length,
                walletAddress: walletAddress,
                syncTime: new Date().toISOString()
            };
            
        } catch (error) {
            console.error(`❌ Blockchain sync error:`, error);
            throw error;
        }
    }

    // =================== PRIVATE METHODS ===================

    /**
     * 🏗️ GET BLOCKCHAIN POSITIONS
     */
    async _getBlockchainPositions(walletAddress, userId = 'toto') {
        try {
            const positionsData = await dataProvider.getPositionsData(walletAddress);
            const allPositions = positionsData.positions || [];
            
            // 🤖 Check if bot session filtering is active
            const sessionRestartMarker = await this._checkSessionRestartMarker();
            
            if (!sessionRestartMarker) {
                // No session filtering - return all positions
                return allPositions;
            }
            
            console.log(`🤖 Session filtering active - filtering positions from before ${sessionRestartMarker.hidden_at}`);
            
            // 🎯 Only show positions that correspond to signals from current session
            // OR positions that were acquired after bot restart
            const currentSession = await this._getCurrentBotSession();
            
            // Get contracts from current session signals
            const currentSessionSignals = await this._getCurrentSessionContracts(currentSession.id);
            
            // Filter positions: only show if they match current session signals
            const filteredPositions = allPositions.filter(position => {
                const contract = position.contractAddress;
                
                // Check if this contract has a signal in current session
                const hasCurrentSessionSignal = currentSessionSignals.includes(contract);
                
                if (hasCurrentSessionSignal) {
                    console.log(`✅ Keeping position ${position.symbol} - has signal in current session`);
                    return true;
                } else {
                    console.log(`👁️ Filtering out position ${position.symbol} - from previous session`);
                    return false;
                }
            });
            
            console.log(`🎯 Filtered positions: ${filteredPositions.length}/${allPositions.length} (session ${currentSession.id})`);
            
            return filteredPositions;
            
        } catch (error) {
            console.error('❌ Error getting blockchain positions:', error);
            return [];
        }
    }
    
    /**
     * 🤖 Check if session restart marker exists
     */
    async _checkSessionRestartMarker() {
        try {
            const query = `
                SELECT * FROM hidden_positions 
                WHERE user_id = 'auto-session-restart' 
                AND contract_address = 'ALL_EXISTING_POSITIONS'
                ORDER BY hidden_at DESC 
                LIMIT 1
            `;
            
            return await new Promise((resolve, reject) => {
                this.db.get(query, [], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });
            
        } catch (error) {
            console.error('❌ Error checking session restart marker:', error);
            return null;
        }
    }
    
    /**
     * 🎯 Get contracts from current session signals
     */
    async _getCurrentSessionContracts(sessionId) {
        try {
            const query = `
                SELECT DISTINCT token_contract 
                FROM signals 
                WHERE bot_session_id >= ? 
                AND status = 'active'
                AND token_contract IS NOT NULL
            `;
            
            const rows = await new Promise((resolve, reject) => {
                this.db.all(query, [sessionId], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            });
            
            const contracts = rows.map(row => row.token_contract);
            console.log(`🎯 Current session contracts (${sessionId}):`, contracts.length);
            
            return contracts;
            
        } catch (error) {
            console.error('❌ Error getting current session contracts:', error);
            return [];
        }
    }

    /**
     * 🗃️ GET DATABASE POSITIONS (from limit orders, filled orders)
     */
    async _getDatabasePositions(userId) {
        try {
            console.log(`📊 Getting database positions for user ${userId} (session-aware)`);
            
            // 🤖 Get current bot session
            const currentSession = await this._getCurrentBotSession();
            
            // 📊 Query signals from current session only
            const signalQuery = `
                SELECT DISTINCT 
                    s.*,
                    hp.id as is_hidden
                FROM signals s
                LEFT JOIN hidden_positions hp ON (
                    hp.contract_address = s.token_contract 
                    AND (hp.user_id = ? OR hp.user_id = 'auto-session')
                )
                WHERE s.status = 'active' 
                AND s.bot_session_id >= ?
                AND hp.id IS NULL
                ORDER BY s.created_at DESC
            `;
            
            const signals = await new Promise((resolve, reject) => {
                this.db.all(signalQuery, [userId, currentSession.id], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            });
            
            console.log(`📊 Found ${signals.length} signals from current bot session (ID: ${currentSession.id})`);
            
            // 🎯 ALSO GET FILLED LIMIT ORDERS (like USAI order)
            const filledOrdersQuery = `
                SELECT DISTINCT 
                    lo.*,
                    hp.id as is_hidden
                FROM limit_orders lo
                LEFT JOIN hidden_positions hp ON (
                    hp.contract_address = lo.contract_address 
                    AND (hp.user_id = ? OR hp.user_id = 'auto-session')
                )
                WHERE lo.user_id = ? 
                AND lo.status = 'filled'
                AND hp.id IS NULL
                ORDER BY lo.filled_at DESC
            `;
            
            const filledOrders = await new Promise((resolve, reject) => {
                this.db.all(filledOrdersQuery, [userId, userId], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            });
            
            console.log(`💰 Found ${filledOrders.length} filled orders for user ${userId}`);
            
            // 🎯 Convert signals to position format for tracking
            const signalPositions = signals.map(signal => ({
                id: `signal-${signal.id}`,
                symbol: signal.token_symbol,
                contractAddress: signal.token_contract,
                type: 'Signal Position',
                status: 'tracking',
                entryMcap: signal.entry_mc || 0,
                signalId: signal.id,
                signalDate: signal.created_at,
                botSession: currentSession.id,
                source: 'database-signal',
                priority: 2
            }));
            
            // 💰 Convert filled orders to position format
            const orderPositions = filledOrders.map(order => {
                const position = {
                    id: `order-${order.id}`,
                    symbol: order.token_symbol,
                    contractAddress: order.contract_address,
                    type: 'Filled Order',
                    status: 'filled',
                    // Don't set realBalance for orders - we don't know exact token amount
                    // realBalance: undefined, 
                    entryMcap: order.target_market_cap || 0, // Target market cap at entry
                    entryValue: order.amount_sol || 0, // SOL value of the order
                    orderId: order.id,
                    filledDate: order.filled_at,
                    transactionSignature: order.transaction_signature,
                    source: 'database-order',
                    priority: 1 // Higher priority than signals
                };
                
                console.log(`💰 ORDER POSITION: ${position.symbol} - Source: ${position.source}, EntryValue: ${position.entryValue} SOL, EntryMcap: ${position.entryMcap}`);
                return position;
            });
            
            // 🔀 Combine both types of positions
            const allDbPositions = [...orderPositions, ...signalPositions];
            
            console.log(`🎯 Database positions: ${allDbPositions.length} total (${filledOrders.length} filled orders + ${signals.length} signals)`);
            
            return allDbPositions;
            
        } catch (error) {
            console.error('❌ Error getting database positions:', error);
            return [];
        }
    }

    /**
     * 🔀 MERGE POSITIONS from different sources
     */
    _mergePositions(blockchainPositions, dbPositions) {
        try {
            const mergedMap = new Map();
            
            // Add blockchain positions (priority)
            for (const position of blockchainPositions) {
                const key = position.contractAddress || position.symbol;
                mergedMap.set(key, {
                    ...position,
                    source: 'blockchain',
                    priority: 1
                });
            }
            
            // Add database positions (if not already present)
            for (const position of dbPositions) {
                const key = position.contractAddress || position.symbol;
                if (!mergedMap.has(key)) {
                    // Preserve original source for special handling (e.g., 'database-order')
                    const finalSource = position.source || 'database';
                    mergedMap.set(key, {
                        ...position,
                        source: finalSource,
                        priority: 2
                    });
                    console.log(`🔀 MERGED DB POSITION: ${position.symbol} - Source: ${finalSource}`);
                }
            }
            
            const merged = Array.from(mergedMap.values());
            console.log(`🔀 MERGED POSITIONS: ${merged.length} total (${blockchainPositions.length} blockchain, ${dbPositions.length} database)`);
            
            return merged;
            
        } catch (error) {
            console.error('❌ Error merging positions:', error);
            return [...blockchainPositions, ...dbPositions];
        }
    }

    /**
     * 🧮 CALCULATE P&L FOR ALL POSITIONS
     */
    async _calculateAllPnL(positions) {
        try {
            console.log(`🧮 CALCULATING P&L for ${positions.length} positions`);
            
            const positionsWithPnL = [];
            
            for (const position of positions) {
                console.log(`🎯 CALC P&L: ${position.symbol} - HasMarketData: ${!!position.marketData}`);
                const pnlData = await this.calculatePnL(position, position.marketData);
                
                const enrichedPosition = {
                    ...position,
                    pnl: pnlData,
                    
                    // ✅ PRESERVE ORIGINAL VALUES from DataProvider
                    roi: pnlData.pnlDisplay || position.roi || 'Holdings',
                    pnlUsdDisplay: pnlData.pnlUsdDisplay || position.pnlUsdDisplay || 'Hold Position',
                    balanceUsd: position.balanceUsd || 'Calculating...', // 🚫 PRESERVE ORIGINAL - DON'T OVERWRITE
                    pnlColor: pnlData.pnlColor || position.pnlColor || 'text-blue-400',
                    pnlIcon: pnlData.pnlIcon || position.pnlIcon || '📎',
                    
                    // Market cap displays - preserve originals
                    entryMcap: position.entryMcap || 'Hold Position',
                    currentMcap: position.currentMcap || 'Loading...'
                };
                
                console.log(`💎 ENRICHED POSITION: ${enrichedPosition.symbol} - PnL.currentValueUsd: $${enrichedPosition.pnl?.currentValueUsd?.toFixed(2) || 'undefined'}`);
                positionsWithPnL.push(enrichedPosition);
            }
            
            console.log(`✅ P&L calculated for all positions`);
            return positionsWithPnL;
            
        } catch (error) {
            console.error('❌ Error calculating P&L for all positions:', error);
            return positions; // Return original positions if calculation fails
        }
    }

    /**
     * 📊 SORT POSITIONS by value/importance
     */
    _sortPositions(positions) {
        return positions.sort((a, b) => {
            // Sort by USD value (highest first)
            const aValue = a.pnl?.currentValueUsd || 0;
            const bValue = b.pnl?.currentValueUsd || 0;
            return bValue - aValue;
        });
    }

    /**
     * 💎 FILTER POSITIONS by minimum USD value
     * Added per Alex's request: Hide positions under $1 USD value
     */
    _filterPositionsByMinValue(positions, minValueUsd = 1.0) {
        const filteredPositions = positions.filter(position => {
            // 🎯 ALEX'S REQUEST: Filter by USD value of position
            // Use currentValueUsd from P&L calculation, fallback to 0 for holdings without entry data
            let currentValueUsd = 0;
            
            if (position.pnl && typeof position.pnl.currentValueUsd === 'number') {
                currentValueUsd = position.pnl.currentValueUsd;
            } else if (position.realBalance && position.currentPrice) {
                // Fallback calculation for holdings positions
                currentValueUsd = position.realBalance * position.currentPrice;
            }
            
            const shouldShow = currentValueUsd >= minValueUsd;
            
            if (!shouldShow) {
                console.log(`🚫 HIDING position ${position.symbol}: $${currentValueUsd.toFixed(2)} (under $${minValueUsd} threshold) - Source: ${position.source || 'unknown'}`);
            } else {
                console.log(`✅ SHOWING position ${position.symbol}: $${currentValueUsd.toFixed(2)} - Source: ${position.source || 'unknown'}`);
            }
            
            return shouldShow;
        });
        
        console.log(`💎 POSITION FILTER: ${filteredPositions.length}/${positions.length} positions shown (min: $${minValueUsd})`);
        return filteredPositions;
    }

    /**
     * 📈 GENERATE POSITION SUMMARY
     */
    _generatePositionSummary(positions) {
        try {
            let totalValue = 0;
            let totalPnL = 0;
            let profitablePositions = 0;
            
            for (const position of positions) {
                if (position.pnl) {
                    totalValue += position.pnl.currentValueUsd || 0;
                    totalPnL += position.pnl.pnlUsd || 0;
                    if (position.pnl.isProfit) {
                        profitablePositions++;
                    }
                }
            }
            
            const winRate = positions.length > 0 ? (profitablePositions / positions.length * 100) : 0;
            
            return {
                totalPositions: positions.length,
                totalValue: totalValue,
                totalPnL: totalPnL,
                profitablePositions: profitablePositions,
                losingPositions: positions.length - profitablePositions,
                winRate: winRate,
                
                // Formatted displays
                totalValueDisplay: `$${totalValue.toFixed(2)}`,
                totalPnLDisplay: `${totalPnL >= 0 ? '+' : ''}$${totalPnL.toFixed(2)}`,
                winRateDisplay: `${winRate.toFixed(1)}%`
            };
            
        } catch (error) {
            console.error('❌ Error generating summary:', error);
            return {
                totalPositions: positions.length,
                error: error.message
            };
        }
    }

    /**
     * 🎯 ANALYZE PROFIT TAKING STATUS
     */
    _analyzeProfitTaking(changePercent) {
        if (changePercent >= 500) return { status: 'URGENT_SELL', color: 'red' };
        if (changePercent >= 300) return { status: 'STRONG_SELL', color: 'orange' };
        if (changePercent >= 200) return { status: 'TAKE_PROFIT', color: 'yellow' };
        if (changePercent >= 100) return { status: 'MONITOR', color: 'green' };
        if (changePercent >= 0) return { status: 'HOLD', color: 'blue' };
        return { status: 'LOSS', color: 'red' };
    }

    /**
     * 🧠 CALCULATION CACHE METHODS
     */
    _isValidCalculationCache(key) {
        const cached = this.calculationCache.get(key);
        if (!cached) return false;
        
        const isValid = (Date.now() - cached.timestamp) < this.calculationCacheTTL;
        if (!isValid) {
            this.calculationCache.delete(key);
        }
        return isValid;
    }

    _setCalculationCache(key, data) {
        this.calculationCache.set(key, {
            data: data,
            timestamp: Date.now()
        });
    }

    /**
     * 🎯 GET REAL ENTRY MCAP from automated_trades table
     * This function searches for the actual market cap at time of purchase
     */
    async _getRealEntryMcap(position) {
        try {
            const contractAddress = position.contractAddress || position.mint || position.contract_address;
            const symbol = position.symbol;
            
            if (!contractAddress && !symbol) {
                console.log(`⚠️ No contract or symbol provided for position:`, position);
                return null;
            }
            
            console.log(`🔍 Searching for real entry mcap: ${symbol} (${contractAddress})`);
            
            // Query automated_trades table for entry_mcap
            const query = `
                SELECT entry_mcap, token_symbol, created_at 
                FROM automated_trades 
                WHERE (token_contract = ? OR token_symbol = ?) 
                AND entry_mcap > 0 
                AND status IN ('completed', 'pending')
                ORDER BY created_at DESC 
                LIMIT 1
            `;
            
            const result = await new Promise((resolve, reject) => {
                this.db.get(query, [contractAddress, symbol], (err, row) => {
                    if (err) {
                        console.error(`❌ Error querying automated_trades:`, err);
                        reject(err);
                    } else {
                        resolve(row);
                    }
                });
            });
            
            if (result && result.entry_mcap && result.entry_mcap > 0) {
                console.log(`🎯 Found real entry mcap: ${symbol} - $${result.entry_mcap.toLocaleString()} (trade date: ${result.created_at})`);
                return result.entry_mcap;
            } else {
                console.log(`❌ No real entry mcap found in automated_trades for ${symbol}`);
                return null;
            }
            
        } catch (error) {
            console.error(`❌ Error getting real entry mcap for ${position.symbol}:`, error);
            return null;
        }
    }
}

// EXPORT SINGLETON INSTANCE
const positionManager = new PositionManager();
module.exports = positionManager;