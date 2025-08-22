/**
 * AlphaBot Custodial Wallet System
 * Professional-grade wallet management for automated trading
 * Built for Alex - Professional Calisthenics Athlete & Crypto Educator
 * 
 * Features:
 * - Secure keypair generation and encryption
 * - PIN-based wallet access
 * - Automated trading capabilities
 * - 10% trading fees, 3% withdrawal fees
 */

const { Keypair, Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { Token, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const bip39 = require('bip39');
const CryptoJS = require('crypto-js');
const sqlite3 = require('sqlite3').verbose();

// Configuration
const SOLANA_DEVNET_URL = 'https://api.devnet.solana.com';
const ALEX_FEE_WALLET = '9TkcJVpw9yYkNrTFdhBBq3iYa4r69osa5PfuAwzxS3ht';
const TRADING_FEE_PERCENT = 10; // 10% for automated trading
const WITHDRAWAL_FEE_PERCENT = 3; // 3% for withdrawals

class CustodialWalletManager {
    constructor(database) {
        this.db = database;
        this.connection = new Connection(SOLANA_DEVNET_URL, 'confirmed');
        this.feeRecipient = new PublicKey(ALEX_FEE_WALLET);
        console.log('🏦 Custodial Wallet Manager initialized');
        console.log('💰 Fee recipient:', ALEX_FEE_WALLET);
        console.log('📊 Trading fees: 10%, Withdrawal fees: 3%');
    }

    /**
     * Create a new custodial wallet for a user
     * @param {string} userId - User identifier
     * @param {string} pin - 6-digit PIN for wallet encryption
     * @param {string} telegramUsername - User's Telegram username (e.g., @alex_crypto)
     * @returns {Promise<Object>} Wallet creation result
     */
    async createCustodialWallet(userId, pin, telegramUsername) {
        try {
            console.log(`🔐 Creating custodial wallet for user: ${userId}`);
            
            // Validate PIN
            if (!pin || pin.length !== 6 || !/^\d{6}$/.test(pin)) {
                throw new Error('PIN must be exactly 6 digits');
            }

            // Check if user already has a wallet
            const existingWallet = await this.getUserWallet(userId);
            if (existingWallet) {
                throw new Error('User already has a custodial wallet');
            }

            // Generate new keypair
            const keypair = Keypair.generate();
            const publicKey = keypair.publicKey.toString();
            const secretKeyArray = Array.from(keypair.secretKey);

            // Generate mnemonic for backup
            const mnemonic = bip39.generateMnemonic();

            // Encrypt private key with PIN
            const encryptedSecretKey = CryptoJS.AES.encrypt(
                JSON.stringify(secretKeyArray), 
                pin
            ).toString();

            // Encrypt mnemonic with PIN
            const encryptedMnemonic = CryptoJS.AES.encrypt(mnemonic, pin).toString();

            // Store in database
            const stmt = this.db.prepare(`
                INSERT INTO custodial_wallets 
                (user_id, telegram_username, public_key, encrypted_secret_key, encrypted_mnemonic, 
                 balance_sol, created_at, last_accessed, is_active)
                VALUES (?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'), 1)
            `);

            const result = stmt.run(
                userId, 
                telegramUsername, 
                publicKey, 
                encryptedSecretKey, 
                encryptedMnemonic
            );

            // Initialize wallet stats
            const statsStmt = this.db.prepare(`
                INSERT INTO custodial_wallet_stats 
                (wallet_id, total_trades, successful_trades, total_volume, total_fees_paid, created_at)
                VALUES (?, 0, 0, 0, 0, datetime('now'))
            `);

            statsStmt.run(result.lastInsertRowid);

            console.log(`✅ Custodial wallet created: ${publicKey}`);

            return {
                success: true,
                walletId: result.lastInsertRowid,
                publicKey: publicKey,
                message: 'Custodial wallet created successfully',
                mnemonic: mnemonic, // Return for user to backup (only once)
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ Error creating custodial wallet:', error);
            throw error;
        }
    }

    /**
     * Authenticate and retrieve user's wallet
     * @param {string} userId - User identifier
     * @param {string} pin - User's PIN
     * @returns {Promise<Object>} Authenticated wallet
     */
    async authenticateWallet(userId, pin) {
        try {
            console.log(`🔓 Authenticating wallet for user: ${userId}`);

            const wallet = await this.getUserWallet(userId);
            if (!wallet) {
                throw new Error('No custodial wallet found for user');
            }

            // Decrypt secret key with PIN
            let secretKeyArray;
            try {
                const decryptedBytes = CryptoJS.AES.decrypt(wallet.encrypted_secret_key, pin);
                const decryptedText = decryptedBytes.toString(CryptoJS.enc.Utf8);
                secretKeyArray = JSON.parse(decryptedText);
            } catch (decryptError) {
                throw new Error('Invalid PIN');
            }

            // Create keypair from decrypted secret key
            const keypair = Keypair.fromSecretKey(new Uint8Array(secretKeyArray));

            // Update last accessed
            const updateStmt = this.db.prepare(`
                UPDATE custodial_wallets 
                SET last_accessed = datetime('now')
                WHERE user_id = ?
            `);
            updateStmt.run(userId);

            console.log(`✅ Wallet authenticated: ${wallet.public_key}`);

            return {
                success: true,
                keypair: keypair,
                publicKey: wallet.public_key,
                walletId: wallet.id,
                balance: await this.getWalletBalance(wallet.public_key)
            };

        } catch (error) {
            console.error('❌ Wallet authentication error:', error);
            throw error;
        }
    }

    /**
     * Get wallet balance in SOL
     * @param {string} publicKeyString - Wallet public key
     * @returns {Promise<number>} Balance in SOL
     */
    async getWalletBalance(publicKeyString) {
        try {
            const publicKey = new PublicKey(publicKeyString);
            const balance = await this.connection.getBalance(publicKey);
            return balance / LAMPORTS_PER_SOL;
        } catch (error) {
            console.error('❌ Error getting wallet balance:', error);
            return 0;
        }
    }

    /**
     * Execute automated trade based on signal
     * @param {string} userId - User ID
     * @param {string} pin - User's PIN
     * @param {Object} signal - Trading signal
     * @param {Object} tradeConfig - Trading configuration
     * @returns {Promise<Object>} Trade execution result
     */
    async executeAutomatedTrade(userId, pin, signal, tradeConfig) {
        try {
            console.log(`🤖 Executing automated trade for user: ${userId}`);
            console.log(`📊 Signal: ${signal.token_symbol} - ${signal.token_contract}`);

            // Authenticate wallet
            const authResult = await this.authenticateWallet(userId, pin);
            const { keypair, publicKey, walletId } = authResult;

            // Validate trade configuration
            this.validateTradeConfig(tradeConfig);

            // Calculate trade amounts
            const tradeAmount = tradeConfig.amount; // Amount in SOL
            const feeAmount = (tradeAmount * TRADING_FEE_PERCENT) / 100;
            const netTradeAmount = tradeAmount - feeAmount;

            console.log(`💰 Trade amount: ${tradeAmount} SOL`);
            console.log(`💸 Fee amount: ${feeAmount} SOL (${TRADING_FEE_PERCENT}%)`);
            console.log(`📈 Net trade amount: ${netTradeAmount} SOL`);

            // Check balance
            const balance = await this.getWalletBalance(publicKey);
            if (balance < tradeAmount) {
                throw new Error(`Insufficient balance. Required: ${tradeAmount} SOL, Available: ${balance} SOL`);
            }

            // Execute fee transfer first
            const feeSignature = await this.transferFee(keypair, feeAmount, 'trading');

            // Store trade record
            console.log(`📝 Recording trade in database...`);
            const tradeId = await this.recordTrade(walletId, signal, tradeConfig, feeAmount, 'pending');
            console.log(`✅ Trade recorded with ID: ${tradeId}`);

            // For devnet testing, we'll simulate the token purchase
            // In production, this would interact with DEXs like Jupiter/Raydium
            const simulatedTradeResult = await this.simulateTokenPurchase(
                keypair, 
                signal.token_contract, 
                netTradeAmount
            );

            // Update trade status
            console.log(`🔄 Updating trade status to completed...`);
            await this.updateTradeStatus(tradeId, 'completed', simulatedTradeResult.signature);
            console.log(`✅ Trade status updated to completed`);

            console.log(`✅ Automated trade executed successfully: ${simulatedTradeResult.signature}`);

            return {
                success: true,
                tradeId: tradeId,
                feeSignature: feeSignature,
                tradeSignature: simulatedTradeResult.signature,
                netAmount: netTradeAmount,
                feeAmount: feeAmount,
                message: 'Automated trade executed successfully'
            };

        } catch (error) {
            console.error('❌ Automated trade execution error:', error);
            throw error;
        }
    }

    /**
     * Transfer fee to Alex's wallet
     * @param {Keypair} userKeypair - User's keypair
     * @param {number} feeAmount - Fee amount in SOL
     * @param {string} feeType - Type of fee ('trading' or 'withdrawal')
     * @returns {Promise<string>} Transaction signature
     */
    async transferFee(userKeypair, feeAmount, feeType) {
        try {
            const lamports = Math.floor(feeAmount * LAMPORTS_PER_SOL);
            
            const transaction = new Transaction();
            transaction.add(
                SystemProgram.transfer({
                    fromPubkey: userKeypair.publicKey,
                    toPubkey: this.feeRecipient,
                    lamports: lamports,
                })
            );

            const signature = await this.connection.sendTransaction(transaction, [userKeypair]);
            await this.connection.confirmTransaction(signature, 'confirmed');

            console.log(`💸 ${feeType} fee transferred: ${feeAmount} SOL - ${signature}`);
            return signature;

        } catch (error) {
            console.error('❌ Fee transfer error:', error);
            throw error;
        }
    }

    /**
     * Simulate token purchase for devnet testing
     * @param {Keypair} userKeypair - User's keypair
     * @param {string} tokenContract - Token contract address
     * @param {number} solAmount - Amount in SOL
     * @returns {Promise<Object>} Simulation result
     */
    async simulateTokenPurchase(userKeypair, tokenContract, solAmount) {
        // In devnet, we'll just transfer SOL to a dummy account to simulate trading
        const dummyAccount = Keypair.generate();
        const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL);

        const transaction = new Transaction();
        transaction.add(
            SystemProgram.transfer({
                fromPubkey: userKeypair.publicKey,
                toPubkey: dummyAccount.publicKey,
                lamports: lamports,
            })
        );

        const signature = await this.connection.sendTransaction(transaction, [userKeypair]);
        await this.connection.confirmTransaction(signature, 'confirmed');

        console.log(`🎯 Simulated token purchase: ${solAmount} SOL for ${tokenContract}`);
        return { signature, dummyAccount: dummyAccount.publicKey.toString() };
    }

    /**
     * Get user wallet from database
     * @param {string} userId - User identifier
     * @returns {Promise<Object|null>} Wallet data or null
     */
    async getUserWallet(userId) {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                SELECT * FROM custodial_wallets WHERE user_id = ? AND is_active = 1
            `);
            
            stmt.get(userId, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    /**
     * Validate trade configuration
     * @param {Object} tradeConfig - Trade configuration
     */
    validateTradeConfig(tradeConfig) {
        if (!tradeConfig || !tradeConfig.amount || tradeConfig.amount <= 0) {
            throw new Error('Invalid trade amount');
        }
        
        if (tradeConfig.amount < 0.001) {
            throw new Error('Minimum trade amount is 0.001 SOL');
        }

        if (!tradeConfig.mode || !['trenches', 'dca'].includes(tradeConfig.mode)) {
            throw new Error('Invalid trading mode');
        }
    }

    /**
     * Record trade in database
     * @param {number} walletId - Wallet ID
     * @param {Object} signal - Trading signal
     * @param {Object} tradeConfig - Trade configuration
     * @param {number} feeAmount - Fee amount
     * @param {string} status - Trade status
     * @returns {Promise<number>} Trade ID
     */
    async recordTrade(walletId, signal, tradeConfig, feeAmount, status) {
        try {
            const stmt = this.db.prepare(`
                INSERT INTO automated_trades 
                (wallet_id, signal_id, token_symbol, token_contract, trade_mode, 
                 amount_sol, fee_amount, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            `);

            const result = stmt.run(
                walletId,
                signal.id || null,
                signal.token_symbol,
                signal.token_contract,
                tradeConfig.mode,
                tradeConfig.amount,
                feeAmount,
                status
            );

            console.log(`📊 Trade recorded in database with ID: ${result.lastInsertRowid}`);
            return result.lastInsertRowid;
            
        } catch (error) {
            console.error('❌ Error recording trade:', error);
            throw error;
        }
    }

    /**
     * Update trade status
     * @param {number} tradeId - Trade ID
     * @param {string} status - New status
     * @param {string} signature - Transaction signature
     */
    async updateTradeStatus(tradeId, status, signature) {
        try {
            const stmt = this.db.prepare(`
                UPDATE automated_trades 
                SET status = ?, transaction_signature = ?, updated_at = datetime('now')
                WHERE id = ?
            `);
            
            const result = stmt.run(status, signature, tradeId);
            console.log(`📊 Trade status updated: ID ${tradeId} -> ${status} (${result.changes} rows affected)`);
            return result;
            
        } catch (error) {
            console.error('❌ Error updating trade status:', error);
            throw error;
        }
    }
}

module.exports = CustodialWalletManager;