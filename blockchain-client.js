/**
 * AlphaBot Blockchain Client - REAL DATA FROM BLOCKCHAIN
 * Professional-grade client for extracting REAL wallet data, positions, and transactions
 * Built for Alex - Professional Calisthenics Athlete & Crypto Educator
 * 
 * 🎯 OBJETIVO: DATOS 100% REALES DESDE BLOCKCHAIN - NO MÁS MOCK DATA
 */

const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const axios = require('axios');

// CONFIGURACIÓN REAL DE ALEX - WALLET CORRECTO
const SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';
const ALEX_WALLET_ADDRESS = '2zFDLDPeGgEs3TpsLm3eWWwjY7NSYqdqMkPGjFnHRCXv';

class AlphaBotBlockchainClient {
    constructor() {
        this.connection = new Connection(SOLANA_RPC_URL, 'confirmed');
        this.alexWallet = new PublicKey(ALEX_WALLET_ADDRESS);
        this.cache = new Map(); // Cache para optimizar llamadas
        this.cacheTimeout = 30000; // 30 segundos
        
        console.log('🚀 AlphaBot Blockchain Client initialized');
        console.log('🎯 Alex Wallet:', ALEX_WALLET_ADDRESS);
    }

    /**
     * 🎯 BALANCE REAL DESDE BLOCKCHAIN
     * Obtiene el balance REAL de SOL del wallet de Alex
     */
    async getRealSolBalance(walletAddress = ALEX_WALLET_ADDRESS) {
        try {
            console.log(`💰 Fetching REAL SOL balance for: ${walletAddress}`);
            
            // Cache check
            const cacheKey = `balance_${walletAddress}`;
            const cached = this.cache.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
                console.log('💾 Using cached balance');
                return cached.data;
            }

            const publicKey = new PublicKey(walletAddress);
            const balanceLamports = await this.connection.getBalance(publicKey);
            const balanceSol = balanceLamports / LAMPORTS_PER_SOL;
            
            const result = {
                walletAddress,
                balanceSol: balanceSol,
                balanceLamports: balanceLamports,
                timestamp: new Date().toISOString(),
                source: 'blockchain'
            };

            // Cache result
            this.cache.set(cacheKey, {
                data: result,
                timestamp: Date.now()
            });

            console.log(`✅ REAL balance fetched: ${balanceSol.toFixed(4)} SOL`);
            return result;

        } catch (error) {
            console.error('❌ Error fetching real balance:', error);
            throw error;
        }
    }

    /**
     * 🎯 TRANSACCIONES REALES DESDE BLOCKCHAIN
     * Obtiene las transacciones REALES del wallet
     */
    async getRealTransactions(walletAddress = ALEX_WALLET_ADDRESS, limit = 50) {
        try {
            console.log(`📊 Fetching REAL transactions for: ${walletAddress}`);
            
            const publicKey = new PublicKey(walletAddress);
            const signatures = await this.connection.getSignaturesForAddress(publicKey, { limit });
            
            const transactions = [];
            for (const sigInfo of signatures) {
                try {
                    const tx = await this.connection.getTransaction(sigInfo.signature, {
                        maxSupportedTransactionVersion: 0,
                        commitment: 'confirmed'
                    });
                    
                    if (tx) {
                        transactions.push({
                            signature: sigInfo.signature,
                            slot: sigInfo.slot,
                            blockTime: sigInfo.blockTime,
                            confirmationStatus: sigInfo.confirmationStatus,
                            err: sigInfo.err,
                            transaction: tx,
                            timestamp: sigInfo.blockTime ? new Date(sigInfo.blockTime * 1000).toISOString() : null
                        });
                    }
                } catch (txError) {
                    console.warn(`⚠️ Could not fetch transaction ${sigInfo.signature}:`, txError.message);
                }
            }

            console.log(`✅ Fetched ${transactions.length} REAL transactions`);
            return transactions;

        } catch (error) {
            console.error('❌ Error fetching real transactions:', error);
            throw error;
        }
    }

    /**
     * 🎯 TOKEN HOLDINGS REALES DESDE BLOCKCHAIN
     * Obtiene los holdings REALES de tokens del wallet
     */
    async getRealTokenHoldings(walletAddress = ALEX_WALLET_ADDRESS) {
        try {
            console.log(`🪙 Fetching REAL token holdings for: ${walletAddress}`);
            
            const publicKey = new PublicKey(walletAddress);
            const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(publicKey, {
                programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
            });

            const holdings = [];
            for (const accountInfo of tokenAccounts.value) {
                const parsedInfo = accountInfo.account.data.parsed.info;
                const tokenAmount = parsedInfo.tokenAmount;
                
                if (parseFloat(tokenAmount.uiAmount) > 0) {
                    // Get token metadata
                    const tokenMetadata = await this.getTokenMetadata(parsedInfo.mint);
                    
                    holdings.push({
                        mint: parsedInfo.mint,
                        amount: tokenAmount.uiAmount,
                        decimals: tokenAmount.decimals,
                        rawAmount: tokenAmount.amount,
                        tokenAccount: accountInfo.pubkey.toString(),
                        metadata: tokenMetadata,
                        timestamp: new Date().toISOString()
                    });
                }
            }

            console.log(`✅ Found ${holdings.length} REAL token holdings`);
            return holdings;

        } catch (error) {
            console.error('❌ Error fetching real token holdings:', error);
            throw error;
        }
    }

    /**
     * 🎯 METADATA REAL DE TOKENS
     */
    async getTokenMetadata(mintAddress) {
        try {
            // Try to get token info from Jupiter API (more reliable)
            const response = await axios.get(`https://token.jup.ag/strict`, { timeout: 5000 });
            const token = response.data.find(t => t.address === mintAddress);
            
            if (token) {
                return {
                    name: token.name,
                    symbol: token.symbol,
                    decimals: token.decimals,
                    logoURI: token.logoURI,
                    source: 'jupiter'
                };
            }

            // Fallback to DexScreener
            const dexResponse = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${mintAddress}`, { timeout: 5000 });
            if (dexResponse.data && dexResponse.data.pairs && dexResponse.data.pairs.length > 0) {
                const pair = dexResponse.data.pairs[0];
                return {
                    name: pair.baseToken.name,
                    symbol: pair.baseToken.symbol,
                    decimals: null,
                    logoURI: null,
                    currentPrice: parseFloat(pair.priceUsd || 0),
                    marketCap: parseFloat(pair.marketCap || 0),
                    source: 'dexscreener'
                };
            }

            return {
                name: 'Unknown Token',
                symbol: 'UNKNOWN',
                decimals: null,
                logoURI: null,
                source: 'unknown'
            };

        } catch (error) {
            console.warn(`⚠️ Could not fetch metadata for ${mintAddress}:`, error.message);
            return {
                name: 'Unknown Token',
                symbol: 'UNKNOWN',
                decimals: null,
                logoURI: null,
                source: 'error'
            };
        }
    }

    /**
     * 🎯 CALCULAR PNL REAL MATEMATICAMENTE CORRECTO
     * Si entry 100k y current 97k = -3% exacto
     */
    calculateRealPnL(entryMarketCap, currentMarketCap, positionSizeUsd) {
        try {
            console.log(`📊 Calculating REAL PnL: Entry ${entryMarketCap} → Current ${currentMarketCap}, Position: $${positionSizeUsd}`);
            
            const marketCapChange = currentMarketCap - entryMarketCap;
            const marketCapChangePercent = (marketCapChange / entryMarketCap) * 100;
            
            // El PnL percentage es EXACTAMENTE igual al cambio de market cap
            const pnlPercent = marketCapChangePercent;
            const pnlUsd = (positionSizeUsd * pnlPercent) / 100;
            const currentValueUsd = positionSizeUsd + pnlUsd;
            
            const result = {
                entryMarketCap,
                currentMarketCap,
                marketCapChange,
                marketCapChangePercent: parseFloat(marketCapChangePercent.toFixed(2)),
                positionSizeUsd,
                pnlPercent: parseFloat(pnlPercent.toFixed(2)),
                pnlUsd: parseFloat(pnlUsd.toFixed(2)),
                currentValueUsd: parseFloat(currentValueUsd.toFixed(2)),
                isProfit: pnlUsd >= 0,
                timestamp: new Date().toISOString()
            };

            console.log(`✅ REAL PnL calculated: ${pnlPercent.toFixed(2)}% = $${pnlUsd.toFixed(2)}`);
            return result;

        } catch (error) {
            console.error('❌ Error calculating real PnL:', error);
            throw error;
        }
    }

    /**
     * 🎯 ANÁLISIS COMPLETO DE WALLET REAL
     */
    async getCompleteWalletAnalysis(walletAddress = ALEX_WALLET_ADDRESS) {
        try {
            console.log(`🔍 Starting COMPLETE REAL wallet analysis for: ${walletAddress}`);
            
            const [balance, transactions, holdings] = await Promise.all([
                this.getRealSolBalance(walletAddress),
                this.getRealTransactions(walletAddress, 20),
                this.getRealTokenHoldings(walletAddress)
            ]);

            const analysis = {
                wallet: walletAddress,
                balance,
                transactions: transactions.length,
                holdings: holdings.length,
                recentTransactions: transactions.slice(0, 5),
                significantHoldings: holdings.filter(h => parseFloat(h.amount) > 0),
                timestamp: new Date().toISOString(),
                source: 'blockchain'
            };

            console.log(`✅ COMPLETE REAL analysis completed`);
            console.log(`📊 Summary: ${balance.balanceSol.toFixed(4)} SOL, ${transactions.length} tx, ${holdings.length} tokens`);
            
            return analysis;

        } catch (error) {
            console.error('❌ Error in complete wallet analysis:', error);
            throw error;
        }
    }
}

module.exports = AlphaBotBlockchainClient;