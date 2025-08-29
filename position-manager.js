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
        // 📊 POSITION TRACKING CONFIGURATION
        this.config = {
            // P&L calculation settings
            defaultEntryBuffer: 0.8, // Assume entry at 80% of signal MC if no data
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
            
            // Sort by value (highest first)
            const sortedPositions = this._sortPositions(positionsWithPnL);
            
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
     * 📊 CALCULATE P&L - MATHEMATICALLY PRECISE
     */
    async calculatePnL(position, marketData, entryData = null) {
        try {
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
                else if (position.target_market_cap) {
                    entryMcap = position.target_market_cap;
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
                const currentValueUsd = position.realBalance && marketData.price ? 
                    position.realBalance * marketData.price : 0;
                
                // 🚫 NO FAKE P&L - We don't know entry price without real entry data
                const pnlUsd = 0; // Can't calculate without real entry data
                const entryValueUsd = currentValueUsd; // Show current value as entry (no P&L)
                
                // Determine if profitable
                const isProfit = mcapChangePercent > 0;
                
                pnlData = {
                    // Core P&L metrics
                    pnlPercentage: mcapChangePercent,
                    pnlUsd: pnlUsd,
                    currentValueUsd: currentValueUsd,
                    entryValueUsd: estimatedPositionSizeUsd,
                    
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
                const currentValueUsd = position.realBalance && marketData?.price ? 
                    position.realBalance * marketData.price : 0;
                
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
    async _getBlockchainPositions(walletAddress) {
        try {
            const positionsData = await dataProvider.getPositionsData(walletAddress);
            return positionsData.positions || [];
        } catch (error) {
            console.error('❌ Error getting blockchain positions:', error);
            return [];
        }
    }

    /**
     * 🗃️ GET DATABASE POSITIONS (from limit orders, filled orders)
     */
    async _getDatabasePositions(userId) {
        try {
            // This would typically query your SQLite database
            // For now, returning empty array - to be implemented based on your DB structure
            console.log(`📊 Getting database positions for user ${userId}`);
            
            // TODO: Implement database query for:
            // - Pending limit orders
            // - Filled orders that aren't reflected in blockchain yet
            // - Historical position data
            
            return [];
            
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
                    mergedMap.set(key, {
                        ...position,
                        source: 'database',
                        priority: 2
                    });
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