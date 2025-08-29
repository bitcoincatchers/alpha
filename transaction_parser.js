const { Connection, PublicKey } = require('@solana/web3.js');
const axios = require('axios');

class TransactionParser {
    constructor() {
        this.connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
        this.transactionCache = new Map(); // Cache parsed transactions
        this.priceCache = new Map(); // Cache prices
        this.lastRequestTime = 0;
        this.minRequestInterval = 500; // 500ms between requests (more conservative)
        this.requestCount = 0;
        this.resetTime = Date.now();
    }

    /**
     * Add delay between RPC requests to avoid rate limiting
     */
    async rateLimitDelay() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.minRequestInterval) {
            const delayNeeded = this.minRequestInterval - timeSinceLastRequest;
            await new Promise(resolve => setTimeout(resolve, delayNeeded));
        }
        this.lastRequestTime = Date.now();
    }

    /**
     * Parse Jupiter swap transaction to extract buy details
     */
    async parseJupiterTransaction(signature) {
        try {
            // Check cache first
            if (this.transactionCache.has(signature)) {
                console.log(`💾 Using cached transaction data for: ${signature}`);
                return this.transactionCache.get(signature);
            }
            
            console.log(`🔍 Parsing transaction: ${signature}`);
            
            // Add rate limiting delay
            await this.rateLimitDelay();
            
            const txData = await this.connection.getTransaction(signature, {
                maxSupportedTransactionVersion: 0,
                commitment: 'confirmed'
            });
            
            if (!txData) {
                throw new Error(`Transaction not found: ${signature}`);
            }

            // Extract pre and post token balances
            const preBalances = txData.meta.preTokenBalances || [];
            const postBalances = txData.meta.postTokenBalances || [];
            
            console.log(`📊 Pre-balances: ${preBalances.length}, Post-balances: ${postBalances.length}`);
            
            // Find SOL and token balance changes
            const solChange = this.calculateSolChange(txData);
            const tokenChanges = this.calculateTokenChanges(preBalances, postBalances);
            
            console.log(`💰 SOL change: ${solChange} SOL`);
            console.log(`🪙 Token changes:`, tokenChanges);
            
            // Extract the main token received (largest positive change)
            let mainToken = null;
            let maxTokenReceived = 0;
            
            for (const change of tokenChanges) {
                if (change.uiAmountChange > maxTokenReceived) {
                    maxTokenReceived = change.uiAmountChange;
                    mainToken = change;
                }
            }
            
            if (!mainToken) {
                throw new Error('No token received found in transaction');
            }
            
            // Calculate entry price (SOL spent / tokens received)
            const solSpent = Math.abs(solChange);
            const tokensReceived = mainToken.uiAmountChange;
            const entryPricePerToken = solSpent / tokensReceived;
            
            const result = {
                signature,
                solSpent: solSpent,
                tokensReceived: tokensReceived,
                tokenMint: mainToken.mint,
                entryPricePerToken: entryPricePerToken,
                entryValue: solSpent,
                timestamp: txData.blockTime,
                slot: txData.slot
            };
            
            console.log(`✅ Parsed successfully:`, result);
            
            // Cache the result
            this.transactionCache.set(signature, result);
            
            return result;
            
        } catch (error) {
            console.error(`❌ Error parsing transaction ${signature}:`, error.message);
            throw error;
        }
    }

    /**
     * Calculate SOL balance change for the user (negative = spent)
     * Finds the account that lost the most SOL (likely the user) and subtracts fees
     */
    calculateSolChange(txData) {
        const preBalances = txData.meta.preBalances || [];
        const postBalances = txData.meta.postBalances || [];
        const fee = txData.meta.fee / 1000000000; // Convert fee to SOL
        
        // Find the account with the largest SOL decrease (this is likely the user)
        let largestLoss = 0;
        let userAccountIndex = -1;
        
        for (let i = 0; i < Math.min(preBalances.length, postBalances.length); i++) {
            const change = (postBalances[i] - preBalances[i]) / 1000000000; // Convert lamports to SOL
            if (change < largestLoss) {
                largestLoss = change;
                userAccountIndex = i;
            }
        }
        
        if (userAccountIndex === -1) {
            // Fallback: use total change
            let totalChange = 0;
            for (let i = 0; i < Math.min(preBalances.length, postBalances.length); i++) {
                const change = (postBalances[i] - preBalances[i]) / 1000000000;
                totalChange += change;
            }
            return Math.abs(totalChange);
        }
        
        // The user's SOL spent = absolute value of their balance decrease minus the transaction fee
        // This gives us the actual SOL spent on the swap
        const userSolSpent = Math.abs(largestLoss) - fee;
        
        console.log(`💰 User account ${userAccountIndex} SOL change: ${largestLoss.toFixed(9)} SOL`);
        console.log(`💰 Transaction fee: ${fee.toFixed(9)} SOL`);
        console.log(`💰 Actual SOL spent on swap: ${userSolSpent.toFixed(9)} SOL`);
        
        return userSolSpent;
    }

    /**
     * Calculate token balance changes
     */
    calculateTokenChanges(preBalances, postBalances) {
        const changes = [];
        
        // Create maps for easier lookup
        const preMap = new Map();
        const postMap = new Map();
        
        preBalances.forEach(balance => {
            const key = `${balance.accountIndex}-${balance.mint}`;
            preMap.set(key, balance);
        });
        
        postBalances.forEach(balance => {
            const key = `${balance.accountIndex}-${balance.mint}`;
            postMap.set(key, balance);
        });
        
        // Find all unique account-mint combinations
        const allKeys = new Set([...preMap.keys(), ...postMap.keys()]);
        
        allKeys.forEach(key => {
            const preBalance = preMap.get(key);
            const postBalance = postMap.get(key);
            
            const preAmount = preBalance ? (preBalance.uiTokenAmount.uiAmount || 0) : 0;
            const postAmount = postBalance ? (postBalance.uiTokenAmount.uiAmount || 0) : 0;
            const change = postAmount - preAmount;
            
            if (Math.abs(change) > 0.000001) { // Only significant changes
                changes.push({
                    mint: (postBalance || preBalance).mint,
                    accountIndex: (postBalance || preBalance).accountIndex,
                    uiAmountChange: change,
                    preAmount: preAmount,
                    postAmount: postAmount
                });
            }
        });
        
        return changes;
    }

    /**
     * Get current token price from DexScreener
     */
    async getCurrentPrice(tokenMint) {
        try {
            // Check cache first (cache for 30 seconds)
            const cacheKey = tokenMint;
            const cached = this.priceCache.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp) < 30000) {
                console.log(`💾 Using cached price data for: ${tokenMint}`);
                return cached.data;
            }
            
            // Add small delay to be nice to APIs
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`);
            
            if (response.data && response.data.pairs && response.data.pairs.length > 0) {
                // Find the pair with highest liquidity
                const bestPair = response.data.pairs.reduce((best, current) => {
                    const currentLiquidity = parseFloat(current.liquidity?.usd || 0);
                    const bestLiquidity = parseFloat(best.liquidity?.usd || 0);
                    return currentLiquidity > bestLiquidity ? current : best;
                });
                
                const priceData = {
                    price: parseFloat(bestPair.priceUsd || 0),
                    marketCap: parseFloat(bestPair.marketCap || 0),
                    liquidity: parseFloat(bestPair.liquidity?.usd || 0),
                    volume24h: parseFloat(bestPair.volume?.h24 || 0),
                    priceChange24h: parseFloat(bestPair.priceChange?.h24 || 0)
                };
                
                // Cache the price data
                this.priceCache.set(cacheKey, {
                    data: priceData,
                    timestamp: Date.now()
                });
                
                return priceData;
            }
            
            return null;
        } catch (error) {
            console.error(`❌ Error fetching price for ${tokenMint}:`, error.message);
            return null;
        }
    }

    /**
     * Calculate P&L for a position
     */
    async calculatePnL(transactionData, currentPrice) {
        if (!currentPrice || !transactionData) {
            return null;
        }
        
        const currentValue = transactionData.tokensReceived * currentPrice.price;
        const pnlUsd = currentValue - (transactionData.entryValue * currentPrice.price / transactionData.entryPricePerToken);
        const pnlPercentage = ((currentValue / transactionData.entryValue) - 1) * 100;
        
        return {
            entryValue: transactionData.entryValue,
            currentValue: currentValue,
            pnlUsd: pnlUsd,
            pnlPercentage: pnlPercentage,
            tokensHeld: transactionData.tokensReceived,
            entryPricePerToken: transactionData.entryPricePerToken,
            currentPricePerToken: currentPrice.price
        };
    }
}

module.exports = TransactionParser;