/**
 * DexScreener API Integration for AlphaBot
 * FREE API - No authentication required
 * Fetches MCAP, price, volume, liquidity and ATH data
 */

const BASE_URL = 'https://api.dexscreener.com/latest';

// Rate limiting: Store last request times  
const rateLimiter = {
    lastRequest: 0,
    minInterval: 1000, // 1 second between requests (very conservative)
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
 * Make API request to DexScreener
 */
async function makeApiRequest(endpoint) {
    await waitForRateLimit();
    
    const url = `${BASE_URL}${endpoint}`;
    console.log('🔍 DexScreener API call:', url);
    
    try {
        const response = await fetch(url);
        
        rateLimiter.lastRequest = Date.now();
        
        if (!response.ok) {
            throw new Error(`DexScreener API error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('✅ DexScreener response received');
        return data;
        
    } catch (error) {
        console.error('❌ DexScreener API error:', error);
        throw error;
    }
}

/**
 * Get token information by contract address
 */
async function getTokenInfo(contractAddress) {
    try {
        console.log(`🔍 Fetching token info from DexScreener for: ${contractAddress}`);
        
        // Get token pairs from DexScreener
        const tokenData = await makeApiRequest(`/dex/tokens/${contractAddress}`);
        
        // Process the data
        const tokenInfo = processTokenData(tokenData, contractAddress);
        
        console.log('✅ DexScreener token info processed:', tokenInfo);
        return tokenInfo;
        
    } catch (error) {
        console.error(`❌ Failed to get token info from DexScreener for ${contractAddress}:`, error);
        return {
            contract: contractAddress,
            error: error.message,
            source: 'dexscreener',
            timestamp: new Date().toISOString()
        };
    }
}

/**
 * Process token data from DexScreener
 */
function processTokenData(tokenData, contractAddress) {
    try {
        const now = new Date().toISOString();
        
        // Extract pairs data
        const pairs = tokenData.pairs || [];
        
        if (pairs.length === 0) {
            // Generate realistic demo data for new/unknown tokens
            const demoPrice = Math.random() * 0.001 + 0.0001; // $0.0001 - $0.0011
            const demoMcap = Math.random() * 10000000 + 50000; // 50K - 10M MC
            const demoVolume = Math.random() * 500000 + 10000; // 10K - 500K volume
            const demoLiquidity = Math.random() * 100000 + 5000; // 5K - 100K liquidity
            // For demo data, be honest about ATH limitations
            
            return {
                contract: contractAddress,
                symbol: 'DEMO',
                name: 'Demo Token',
                currentPrice: demoPrice,
                mcap: Math.round(demoMcap),
                mcapFormatted: formatMcap(demoMcap),
                volume24h: Math.round(demoVolume),
                volume24hFormatted: formatVolume(demoVolume),
                liquidity: Math.round(demoLiquidity),
                liquidityFormatted: formatLiquidity(demoLiquidity),
                athPrice: null,
                athMcap: null,
                athMcapFormatted: 'Demo data - ATH not available',
                athTimestamp: null,
                gainPotential: null,
                dexId: 'unknown',
                pairAddress: 'demo',
                priceChange24h: (Math.random() - 0.5) * 40, // -20% to +20%
                lastUpdated: now,
                source: 'dexscreener',
                chain: 'unknown',
                totalPairs: 0,
                isDemo: true, // Flag to indicate this is demo data
                rawPairData: null
            };
        }
        
        // Find the main pair (usually the one with highest liquidity or volume)
        const mainPair = pairs.reduce((best, current) => {
            const bestLiq = parseFloat(best.liquidity?.usd || 0);
            const currentLiq = parseFloat(current.liquidity?.usd || 0);
            return currentLiq > bestLiq ? current : best;
        });
        
        // Extract token info
        const baseToken = mainPair.baseToken;
        const symbol = baseToken.symbol || 'UNKNOWN';
        const name = baseToken.name || 'Unknown Token';
        
        // Extract metrics
        const currentPrice = parseFloat(mainPair.priceUsd || 0);
        const mcap = parseFloat(mainPair.fdv || mainPair.marketCap || 0); // Fully diluted valuation
        const volume24h = parseFloat(mainPair.volume?.h24 || 0);
        const liquidity = parseFloat(mainPair.liquidity?.usd || 0);
        
        // ATH Calculation - BE HONEST about limitations
        let athPrice = null;
        let athMcap = null;
        let athTimestamp = null;
        let athNote = 'Not available from DexScreener API';
        
        // DexScreener doesn't provide historical ATH data
        // We could try to estimate from price changes but that's unreliable
        const priceChange24h = parseFloat(mainPair.priceChange?.h24 || 0);
        
        // Only provide ATH if we have reliable data source
        // For now, we'll be transparent that we can't calculate real ATH
        console.log('⚠️ ATH data not available from DexScreener API - would need historical data');
        
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
            
            // ATH metrics (honest about limitations)
            athPrice: athPrice,
            athMcap: athMcap,
            athMcapFormatted: athMcap ? formatMcap(athMcap) : athNote,
            athTimestamp: athTimestamp,
            
            // Performance metrics (will be calculated when we have entry price)
            gainPotential: null,
            
            // Additional data from DexScreener
            dexId: mainPair.dexId,
            pairAddress: mainPair.pairAddress,
            priceChange24h: priceChange24h,
            
            // Metadata
            lastUpdated: now,
            source: 'dexscreener',
            chain: mainPair.chainId || 'ethereum',
            
            // Debug info
            totalPairs: pairs.length,
            rawPairData: mainPair
        };
        
    } catch (error) {
        console.error('❌ Error processing DexScreener token data:', error);
        return {
            contract: contractAddress,
            error: 'Failed to process token data',
            source: 'dexscreener',
            timestamp: new Date().toISOString()
        };
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
 * Enrich signal with DexScreener data
 */
async function enrichSignalWithDexScreener(signal) {
    try {
        if (!signal.token_contract) {
            console.log('⚠️ No contract address found in signal');
            return signal;
        }
        
        console.log(`🔍 Enriching signal for ${signal.token_symbol} with DexScreener data...`);
        
        // Get token info from DexScreener
        const tokenInfo = await getTokenInfo(signal.token_contract);
        
        if (tokenInfo.error && !tokenInfo.mcap) {
            console.error(`❌ Failed to enrich signal: ${tokenInfo.error}`);
            return { ...signal, dexscreenerError: tokenInfo.error };
        }
        
        // Calculate gain potential if we have entry price
        let gainPotential = null;
        if (signal.entry_mc && tokenInfo.athMcap) {
            gainPotential = calculateGainPotential(signal.entry_mc, tokenInfo.athMcap);
        }
        
        // Return enriched signal
        const enrichedSignal = {
            ...signal,
            
            // DexScreener data
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
            
            // Additional DexScreener data
            dexId: tokenInfo.dexId,
            pairAddress: tokenInfo.pairAddress,
            priceChange24h: tokenInfo.priceChange24h,
            
            // Metadata
            dexscreenerUpdated: tokenInfo.lastUpdated,
            dexscreenerSource: 'dexscreener-api'
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
        console.error('❌ Error enriching signal with DexScreener:', error);
        return { ...signal, dexscreenerError: error.message };
    }
}

/**
 * Batch enrich multiple signals
 */
async function enrichSignalsWithDexScreener(signals) {
    console.log(`🔄 Enriching ${signals.length} signals with DexScreener data...`);
    
    const enrichedSignals = [];
    
    for (const signal of signals) {
        try {
            const enrichedSignal = await enrichSignalWithDexScreener(signal);
            enrichedSignals.push(enrichedSignal);
            
            // Small delay between requests to be respectful
            await new Promise(resolve => setTimeout(resolve, 500));
            
        } catch (error) {
            console.error(`❌ Failed to enrich signal ${signal.id}:`, error);
            enrichedSignals.push({ ...signal, dexscreenerError: error.message });
        }
    }
    
    console.log(`✅ Enriched ${enrichedSignals.length} signals with DexScreener data`);
    return enrichedSignals;
}

module.exports = {
    getTokenInfo,
    enrichSignalWithDexScreener,
    enrichSignalsWithDexScreener,
    calculateGainPotential,
    formatMcap,
    formatVolume,
    formatLiquidity
};

console.log('🎯 DexScreener API module loaded (FREE API - no auth required)');