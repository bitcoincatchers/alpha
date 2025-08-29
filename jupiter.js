/**
 * Jupiter API Client for Solana Token Prices
 * NEW Base URL: https://lite-api.jup.ag/price/v2 (Migration from price.jup.ag by May 1, 2025)
 * Old URL: https://price.jup.ag/v6/price (DEPRECATED)
 * Rate limit: 600 requests per minute
 * No authentication required
 */

class JupiterAPI {
    constructor() {
        // Using new lite-api.jup.ag endpoint (migrated from price.jup.ag)
        this.baseURL = 'https://lite-api.jup.ag/price/v2';
        this.requestCount = 0;
        this.lastResetTime = Date.now();
        this.lastRequestTime = 0;
        this.maxRequestsPerMinute = 600;
        
        // Common token mint addresses for Solana
        this.tokenMints = {
            'SOL': 'So11111111111111111111111111111111111111112',
            'USDC': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
            'USDT': 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
            'RAY': '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
            'SRM': 'SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt',
            'FTT': 'AGFEad2et2ZJif9jaGpdMixQqvW5i81aBdvKe7PHNfz3'
        };
    }

    /**
     * Check rate limit before making requests - more conservative approach
     */
    checkRateLimit() {
        const now = Date.now();
        const timeElapsed = now - this.lastResetTime;
        
        // Reset counter every minute
        if (timeElapsed >= 60000) {
            this.requestCount = 0;
            this.lastResetTime = now;
        }
        
        // Conservative limit: use only 80% of available requests (480/600)
        const conservativeLimit = Math.floor(this.maxRequestsPerMinute * 0.8);
        
        if (this.requestCount >= conservativeLimit) {
            const timeToWait = 60000 - timeElapsed;
            throw new Error(`Rate limit exceeded (${this.requestCount}/${conservativeLimit}). Wait ${Math.ceil(timeToWait / 1000)} seconds.`);
        }
        
        // Add small delay between requests to avoid burst
        if (this.requestCount > 0) {
            const timeSinceLastRequest = now - (this.lastRequestTime || 0);
            const minInterval = 200; // 200ms between requests
            
            if (timeSinceLastRequest < minInterval) {
                throw new Error('Request too soon - rate limiting active');
            }
        }
        
        this.lastRequestTime = now;
    }

    /**
     * Make API request with error handling and rate limiting
     */
    async makeRequest(endpoint = '', params = {}) {
        this.checkRateLimit();
        
        // For the new lite-api, we don't need additional endpoint paths
        const url = new URL(this.baseURL);
        Object.keys(params).forEach(key => {
            if (params[key] !== null && params[key] !== undefined) {
                url.searchParams.append(key, params[key]);
            }
        });

        try {
            console.log(`[Jupiter API] Making request to: ${url.toString()}`);
            this.requestCount++;
            
            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'AlphaBot/1.0'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            console.log(`[Jupiter API] Success: ${JSON.stringify(data).substring(0, 200)}...`);
            return data;
            
        } catch (error) {
            console.error(`[Jupiter API] Error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Resolve token identifier to mint address
     * @param {string} identifier - Token symbol or mint address
     * @returns {string} Mint address
     */
    resolveTokenMint(identifier) {
        // If it's already a mint address (starts with uppercase letter and is 44 chars)
        if (identifier.length === 44 && /^[A-Za-z0-9]+$/.test(identifier)) {
            return identifier;
        }
        
        // Check if it's a known symbol
        if (this.tokenMints[identifier.toUpperCase()]) {
            return this.tokenMints[identifier.toUpperCase()];
        }
        
        // Return as-is if we can't resolve
        return identifier;
    }

    /**
     * Get token price by mint address or symbol
     * @param {string} identifier - Token mint address or symbol (e.g., 'SOL', 'USDC')
     * @param {string} vsToken - Price denomination token (default: 'USDC')
     * @returns {Promise<Object>} Price data
     */
    async getTokenPrice(identifier, vsToken = 'USDC') {
        try {
            // Resolve symbol to mint address if needed
            const mintAddress = this.resolveTokenMint(identifier);
            const vsTokenMint = this.resolveTokenMint(vsToken);
            
            console.log(`[Jupiter API] Requesting price for ${identifier} -> ${mintAddress} vs ${vsToken} -> ${vsTokenMint}`);
            
            const data = await this.makeRequest('', {
                ids: mintAddress,
                vsToken: vsTokenMint
            });

            if (!data || !data.data || !data.data[mintAddress]) {
                throw new Error(`No price data found for token: ${identifier} (${mintAddress})`);
            }

            const tokenData = data.data[mintAddress];
            return {
                id: tokenData.id,
                mintSymbol: identifier, // Keep original identifier as symbol
                vsToken: vsTokenMint,
                vsTokenSymbol: vsToken,
                price: parseFloat(tokenData.price),
                type: tokenData.type || 'unknown',
                timestamp: Date.now()
            };
            
        } catch (error) {
            console.error(`[Jupiter API] Failed to get price for ${identifier}:`, error);
            throw error;
        }
    }

    /**
     * Get multiple token prices in a single request
     * @param {Array<string>} identifiers - Array of token mint addresses or symbols
     * @param {string} vsToken - Price denomination token (default: 'USDC')
     * @returns {Promise<Object>} Multiple price data
     */
    async getMultipleTokenPrices(identifiers, vsToken = 'USDC') {
        try {
            const idsString = identifiers.join(',');
            const data = await this.makeRequest('', {
                ids: idsString,
                vsToken: vsToken
            });

            if (!data || !data.data) {
                throw new Error('No price data returned from Jupiter API');
            }

            const results = {};
            identifiers.forEach(id => {
                if (data.data[id]) {
                    const tokenData = data.data[id];
                    results[id] = {
                        id: tokenData.id,
                        mintSymbol: tokenData.mintSymbol,
                        vsToken: tokenData.vsToken,
                        vsTokenSymbol: tokenData.vsTokenSymbol,
                        price: parseFloat(tokenData.price),
                        extraInfo: tokenData.extraInfo || {},
                        timestamp: Date.now()
                    };
                } else {
                    console.warn(`[Jupiter API] No price data for token: ${id}`);
                    results[id] = null;
                }
            });

            return results;
            
        } catch (error) {
            console.error(`[Jupiter API] Failed to get multiple prices:`, error);
            throw error;
        }
    }

    /**
     * Calculate market cap for a token
     * @param {string} tokenAddress - Token mint address
     * @param {number} totalSupply - Total token supply
     * @param {string} vsToken - Price denomination token (default: 'USDC')
     * @returns {Promise<number>} Market cap in USD
     */
    async calculateMarketCap(tokenAddress, totalSupply, vsToken = 'USDC') {
        try {
            const priceData = await this.getTokenPrice(tokenAddress, vsToken);
            const marketCap = priceData.price * totalSupply;
            
            console.log(`[Jupiter API] Market cap for ${tokenAddress}: $${marketCap.toLocaleString()}`);
            return marketCap;
            
        } catch (error) {
            console.error(`[Jupiter API] Failed to calculate market cap for ${tokenAddress}:`, error);
            throw error;
        }
    }

    /**
     * Get Solana token info including market cap estimation
     * @param {string} tokenAddress - Token mint address
     * @returns {Promise<Object>} Token information with price and estimated market cap
     */
    async getTokenInfo(tokenAddress) {
        try {
            const priceData = await this.getTokenPrice(tokenAddress);
            
            // For market cap, we need total supply which Jupiter doesn't provide
            // We'll return price data and let the caller handle market cap calculation
            return {
                address: tokenAddress,
                symbol: priceData.mintSymbol,
                price_usd: priceData.price,
                price_data: priceData,
                timestamp: Date.now(),
                source: 'Jupiter API'
            };
            
        } catch (error) {
            console.error(`[Jupiter API] Failed to get token info for ${tokenAddress}:`, error);
            throw error;
        }
    }

    /**
     * Get historical price data (Jupiter doesn't provide this, so we return current price)
     * @param {string} tokenAddress - Token mint address
     * @param {string} timeframe - Time frame (not used with Jupiter)
     * @returns {Promise<Object>} Current price data
     */
    async getHistoricalData(tokenAddress, timeframe = '1h') {
        console.warn('[Jupiter API] Historical data not available, returning current price');
        return await this.getTokenInfo(tokenAddress);
    }

    /**
     * Health check for Jupiter API
     * @returns {Promise<boolean>} API health status
     */
    async healthCheck() {
        try {
            // Test with SOL token
            await this.getTokenPrice('SOL');
            console.log('[Jupiter API] Health check passed');
            return true;
        } catch (error) {
            console.error('[Jupiter API] Health check failed:', error);
            return false;
        }
    }

    /**
     * Get API usage statistics
     * @returns {Object} Usage stats
     */
    getUsageStats() {
        const timeElapsed = Date.now() - this.lastResetTime;
        const remainingRequests = Math.max(0, this.maxRequestsPerMinute - this.requestCount);
        
        return {
            requestCount: this.requestCount,
            maxRequestsPerMinute: this.maxRequestsPerMinute,
            remainingRequests: remainingRequests,
            timeToReset: Math.max(0, 60000 - timeElapsed),
            rateLimitStatus: remainingRequests > 0 ? 'OK' : 'LIMITED'
        };
    }
}

// Create singleton instance
const jupiterAPI = new JupiterAPI();

module.exports = {
    JupiterAPI,
    jupiterAPI
};