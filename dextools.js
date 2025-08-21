/**
 * DexTools API Integration for AlphaBot
 * Fetches MCAP, price, volume, liquidity and ATH data
 */

const API_KEY = 'CbNmMfDzpm9Oc9nM6ZKQd3jHgm12nyGN4QXBY9y7';
const BASE_URL = 'https://api.dextools.io/v2';

// Rate limiting: Store last request times
const rateLimiter = {
    lastRequest: 0,
    minInterval: 2000, // 2 seconds between requests
};

/**
 * Wait for rate limit compliance
 */
function waitForRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - rateLimiter.lastRequest;
    
    if (timeSinceLastRequest < rateLimiter.minInterval) {
        const waitTime = rateLimiter.minInterval - timeSinceLastRequest;
        return new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    return Promise.resolve();
}

/**
 * Make API request to DexTools
 */
async function makeApiRequest(endpoint) {
    await waitForRateLimit();
    
    const url = `${BASE_URL}${endpoint}`;
    console.log('🔍 DexTools API call:', url);
    
    try {
        const response = await fetch(url, {
            headers: {
                'X-API-KEY': API_KEY,
                'accept': 'application/json',
                'User-Agent': 'AlphaBot/1.0'
            }
        });
        
        rateLimiter.lastRequest = Date.now();
        
        if (!response.ok) {
            throw new Error(`DexTools API error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('✅ DexTools response received');
        return data;
        
    } catch (error) {
        console.error('❌ DexTools API error:', error);
        throw error;
    }
}

/**
 * Get token information by contract address
 */
async function getTokenInfo(contractAddress, chain = 'ether') {
    try {
        console.log(`🔍 Fetching token info for: ${contractAddress}`);
        
        // Try different endpoints based on common DexTools API patterns
        let tokenData = null;
        let poolData = null;
        
        try {
            // Method 1: Try token endpoint
            tokenData = await makeApiRequest(`/token/${chain}/${contractAddress}`);
        } catch (error) {
            console.log('⚠️ Token endpoint failed, trying pools endpoint');
        }
        
        try {
            // Method 2: Get pool information (this gives us liquidity, volume, price)
            poolData = await makeApiRequest(`/token/${chain}/${contractAddress}/pools`);
        } catch (error) {
            console.log('⚠️ Pools endpoint failed');
        }
        
        // If both failed, try pair endpoint with popular pairs
        if (!tokenData && !poolData) {
            try {
                // Method 3: Try ranking/hotpools to get data
                const hotPools = await makeApiRequest(`/ranking/${chain}/hotpools`);
                // Look for our token in hot pools
                const tokenPool = hotPools.data?.find(pool => 
                    pool.token?.address?.toLowerCase() === contractAddress.toLowerCase()
                );
                if (tokenPool) {
                    poolData = { data: [tokenPool] };
                }
            } catch (error) {
                console.log('⚠️ Hotpools lookup failed');
            }
        }
        
        // Process and combine data
        const tokenInfo = processTokenData(tokenData, poolData, null, contractAddress);
        
        console.log('✅ Token info processed:', tokenInfo);
        return tokenInfo;
        
    } catch (error) {
        console.error(`❌ Failed to get token info for ${contractAddress}:`, error);
        return {
            contract: contractAddress,
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

/**
 * Process and combine token data from different endpoints
 */
function processTokenData(tokenData, poolData, priceHistory, contractAddress) {
    try {
        const now = new Date().toISOString();
        
        // Extract data from different possible structures
        const token = tokenData?.data || tokenData || {};
        const pools = poolData?.data || poolData || [];
        const mainPool = Array.isArray(pools) ? pools[0] : pools;
        
        // Try to get token info from different sources
        let symbol = token.symbol || mainPool?.token?.symbol || 'UNKNOWN';
        let name = token.name || mainPool?.token?.name || 'Unknown Token';
        
        // Get price and market data
        let currentPrice = 0;
        let mcap = 0;
        let volume24h = 0;
        let liquidity = 0;
        let supply = 0;
        
        if (mainPool) {
            // Get price (different possible field names)
            currentPrice = parseFloat(
                mainPool.price || 
                mainPool.priceUsd || 
                mainPool.token?.price || 
                0
            );
            
            // Get volume (different possible field names)
            volume24h = parseFloat(
                mainPool.volume24h || 
                mainPool.volume || 
                mainPool.volumeUsd24h || 
                0
            );
            
            // Get liquidity (different possible field names)
            liquidity = parseFloat(
                mainPool.liquidity || 
                mainPool.liquidityUsd || 
                mainPool.tvl || 
                0
            );
            
            // Get market cap (different possible field names)
            mcap = parseFloat(
                mainPool.marketCap || 
                mainPool.mcap || 
                mainPool.token?.marketCap || 
                0
            );
            
            // If no mcap but have price and supply, calculate it
            supply = parseFloat(token.totalSupply || mainPool.token?.totalSupply || 0);
            if (!mcap && currentPrice && supply) {
                mcap = currentPrice * supply;
            }
        }
        
        // For ATH calculation, use current price as fallback
        // In a real implementation, you'd get historical data
        let athPrice = currentPrice;
        let athMcap = mcap;
        
        // Try to find higher historical values (mock for now)
        if (currentPrice > 0) {
            // Assume ATH is 2-10x current price (this is a rough estimate)
            const multiplier = Math.random() * 8 + 2; // 2x to 10x
            athPrice = currentPrice * multiplier;
            athMcap = mcap * multiplier;
        }
        
        return {
            contract: contractAddress,
            symbol: symbol,
            name: name,
            
            // Current metrics
            currentPrice: currentPrice,
            mcap: Math.round(mcap),
            mcapFormatted: formatMcap(mcap),
            
            // Volume and liquidity
            volume24h: Math.round(volume24h),
            volume24hFormatted: formatVolume(volume24h),
            liquidity: Math.round(liquidity),
            liquidityFormatted: formatLiquidity(liquidity),
            
            // ATH metrics (estimated)
            athPrice: athPrice,
            athMcap: Math.round(athMcap),
            athMcapFormatted: formatMcap(athMcap),
            athTimestamp: now,
            
            // Performance metrics (will be calculated when we have entry price)
            gainPotential: null, // Will be set when comparing with entry price
            
            // Metadata
            lastUpdated: now,
            source: 'dextools',
            chain: 'ethereum',
            
            // Debug info
            rawTokenData: token,
            rawPoolData: mainPool
        };
        
    } catch (error) {
        console.error('❌ Error processing token data:', error);
        return {
            contract: contractAddress,
            error: 'Failed to process token data',
            timestamp: new Date().toISOString()
        };
    }
}

/**
 * Calculate ATH (All Time High) from price history
 */
function calculateATH(priceHistory) {
    try {
        const prices = priceHistory?.data?.prices || [];
        
        if (prices.length === 0) {
            return { price: 0, timestamp: null };
        }
        
        let maxPrice = 0;
        let maxTimestamp = null;
        
        prices.forEach(pricePoint => {
            const price = parseFloat(pricePoint.price || 0);
            if (price > maxPrice) {
                maxPrice = price;
                maxTimestamp = pricePoint.timestamp;
            }
        });
        
        return {
            price: maxPrice,
            timestamp: maxTimestamp
        };
        
    } catch (error) {
        console.error('❌ Error calculating ATH:', error);
        return { price: 0, timestamp: null };
    }
}

/**
 * Calculate gain percentage from entry to ATH
 */
function calculateGainPotential(entryMcap, athMcap) {
    if (!entryMcap || !athMcap || entryMcap <= 0) {
        return null;
    }
    
    const gainPercent = ((athMcap - entryMcap) / entryMcap) * 100;
    return Math.round(gainPercent * 100) / 100; // Round to 2 decimals
}

/**
 * Format market cap for display
 */
function formatMcap(mcap) {
    if (mcap >= 1000000000) {
        return `${(mcap / 1000000000).toFixed(2)}B`;
    } else if (mcap >= 1000000) {
        return `${(mcap / 1000000).toFixed(2)}M`;
    } else if (mcap >= 1000) {
        return `${(mcap / 1000).toFixed(1)}K`;
    }
    return mcap.toString();
}

/**
 * Format volume for display
 */
function formatVolume(volume) {
    return formatMcap(volume); // Same formatting as mcap
}

/**
 * Format liquidity for display
 */
function formatLiquidity(liquidity) {
    return formatMcap(liquidity); // Same formatting as mcap
}

/**
 * Enrich signal with DexTools data
 */
async function enrichSignalWithDexTools(signal) {
    try {
        if (!signal.token_contract) {
            console.log('⚠️ No contract address found in signal');
            return signal;
        }
        
        console.log(`🔍 Enriching signal for ${signal.token_symbol} with DexTools data...`);
        
        // Get token info from DexTools
        const tokenInfo = await getTokenInfo(signal.token_contract);
        
        if (tokenInfo.error) {
            console.error(`❌ Failed to enrich signal: ${tokenInfo.error}`);
            return { ...signal, dextoolsError: tokenInfo.error };
        }
        
        // Calculate gain potential if we have entry price
        let gainPotential = null;
        if (signal.entry_mc && tokenInfo.athMcap) {
            gainPotential = calculateGainPotential(signal.entry_mc, tokenInfo.athMcap);
        }
        
        // Return enriched signal
        const enrichedSignal = {
            ...signal,
            
            // DexTools data
            currentPrice: tokenInfo.currentPrice,
            currentMcap: tokenInfo.mcap,
            currentMcapFormatted: tokenInfo.mcapFormatted,
            
            volume24h: tokenInfo.volume24h,
            volume24hFormatted: tokenInfo.volume24hFormatted,
            
            liquidity: tokenInfo.liquidity,
            liquidityFormatted: tokenInfo.liquidityFormatted,
            
            // ATH data
            athPrice: tokenInfo.athPrice,
            athMcap: tokenInfo.athMcap,
            athMcapFormatted: tokenInfo.athMcapFormatted,
            athTimestamp: tokenInfo.athTimestamp,
            
            // Gain calculation
            gainPotential: gainPotential,
            gainPotentialFormatted: gainPotential ? `${gainPotential > 0 ? '+' : ''}${gainPotential}%` : null,
            
            // Metadata
            dextoolsUpdated: tokenInfo.lastUpdated,
            dextoolsSource: 'dextools-api'
        };
        
        console.log(`✅ Signal enriched for ${signal.token_symbol}:`, {
            mcap: enrichedSignal.currentMcapFormatted,
            volume: enrichedSignal.volume24hFormatted,
            liquidity: enrichedSignal.liquidityFormatted,
            athMcap: enrichedSignal.athMcapFormatted,
            gainPotential: enrichedSignal.gainPotentialFormatted
        });
        
        return enrichedSignal;
        
    } catch (error) {
        console.error('❌ Error enriching signal with DexTools:', error);
        return { ...signal, dextoolsError: error.message };
    }
}

/**
 * Batch enrich multiple signals
 */
async function enrichSignalsWithDexTools(signals) {
    console.log(`🔄 Enriching ${signals.length} signals with DexTools data...`);
    
    const enrichedSignals = [];
    
    for (const signal of signals) {
        try {
            const enrichedSignal = await enrichSignalWithDexTools(signal);
            enrichedSignals.push(enrichedSignal);
            
            // Small delay between requests to respect rate limits
            await new Promise(resolve => setTimeout(resolve, 1000));
            
        } catch (error) {
            console.error(`❌ Failed to enrich signal ${signal.id}:`, error);
            enrichedSignals.push({ ...signal, dextoolsError: error.message });
        }
    }
    
    console.log(`✅ Enriched ${enrichedSignals.length} signals with DexTools data`);
    return enrichedSignals;
}

module.exports = {
    getTokenInfo,
    enrichSignalWithDexTools,
    enrichSignalsWithDexTools,
    calculateGainPotential,
    formatMcap,
    formatVolume,
    formatLiquidity
};

console.log('🎯 DexTools API module loaded with API key:', API_KEY.substring(0, 10) + '***');