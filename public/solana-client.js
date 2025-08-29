/**
 * AlphaBot Solana Client - Fee Processing
 * Professional-grade client for handling 5% fee transactions
 * Built for Alex - Professional Calisthenics Athlete & Crypto Educator
 */

const { 
    Connection, 
    PublicKey, 
    Transaction, 
    TransactionInstruction,
    SystemProgram,
    LAMPORTS_PER_SOL,
    sendAndConfirmTransaction,
} = require('@solana/web3.js');
const { serialize } = require('borsh');

// Configuration
const SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com'; // Use mainnet for production
// const SOLANA_RPC_URL = 'https://api.devnet.solana.com'; // Use devnet for testing
const ALEX_FEE_WALLET = '9TkcJVpw9yYkNrTFdhBBq3iYa4r69osa5PfuAwzxS3ht';
const WITHDRAWAL_FEE_PERCENT = 5;
const TRADING_FEE_PERCENT = 5;

// Program ID (will be set after deployment)
let PROGRAM_ID = null; // To be updated after contract deployment

class AlphaBotSolanaClient {
    constructor() {
        this.connection = new Connection(SOLANA_RPC_URL, 'confirmed');
        this.feeRecipient = new PublicKey(ALEX_FEE_WALLET);
        console.log('🚀 AlphaBot Solana Client initialized');
        console.log('💰 Fee recipient:', ALEX_FEE_WALLET);
    }

    /**
     * Calculate fee amount
     * @param {number} amount - Amount in lamports
     * @param {number} feePercent - Fee percentage (5 for 5%)
     * @returns {number} Fee amount in lamports
     */
    calculateFee(amount, feePercent) {
        return Math.floor((amount * feePercent) / 100);
    }

    /**
     * Process withdrawal fee (3%)
     * @param {Object} userWallet - User's custodial wallet keypair
     * @param {number} withdrawalAmount - Withdrawal amount in SOL
     * @returns {Promise<string>} Transaction signature
     */
    async processWithdrawalFee(userWallet, withdrawalAmount) {
        try {
            console.log(`💸 Processing withdrawal fee for ${withdrawalAmount} SOL`);
            
            const amountLamports = withdrawalAmount * LAMPORTS_PER_SOL;
            const feeAmount = this.calculateFee(amountLamports, WITHDRAWAL_FEE_PERCENT);
            
            console.log(`💰 Fee calculation: ${feeAmount / LAMPORTS_PER_SOL} SOL (${WITHDRAWAL_FEE_PERCENT}%)`);
            
            if (feeAmount === 0) {
                throw new Error('Fee amount is too small');
            }

            // Get user's public key
            const userPublicKey = userWallet.publicKey;
            
            // Check user balance
            const balance = await this.connection.getBalance(userPublicKey);
            if (balance < feeAmount) {
                throw new Error('Insufficient balance for withdrawal fee');
            }

            // Create fee transfer transaction
            const transaction = new Transaction();
            
            // Add fee transfer instruction
            const transferInstruction = SystemProgram.transfer({
                fromPubkey: userPublicKey,
                toPubkey: this.feeRecipient,
                lamports: feeAmount,
            });
            
            transaction.add(transferInstruction);

            // Get recent blockhash
            const { blockhash } = await this.connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = userPublicKey;

            // Sign and send transaction
            const signedTransaction = await userWallet.signTransaction(transaction);
            const signature = await this.connection.sendRawTransaction(signedTransaction.serialize());
            
            // Wait for confirmation
            await this.connection.confirmTransaction(signature, 'confirmed');
            
            console.log(`✅ Withdrawal fee processed successfully: ${signature}`);
            
            // Record transaction in database
            await this.recordFeeTransaction('withdrawal', feeAmount, signature, userPublicKey.toString());
            
            return signature;
            
        } catch (error) {
            console.error('❌ Withdrawal fee processing error:', error);
            throw error;
        }
    }

    /**
     * Process trading fee (10%)
     * @param {Object} userWallet - User's custodial wallet keypair
     * @param {number} tradingAmount - Trading amount in SOL
     * @returns {Promise<string>} Transaction signature
     */
    async processTradingFee(userWallet, tradingAmount) {
        try {
            console.log(`📈 Processing trading fee for ${tradingAmount} SOL`);
            
            const amountLamports = tradingAmount * LAMPORTS_PER_SOL;
            const feeAmount = this.calculateFee(amountLamports, TRADING_FEE_PERCENT);
            
            console.log(`💰 Fee calculation: ${feeAmount / LAMPORTS_PER_SOL} SOL (${TRADING_FEE_PERCENT}%)`);
            
            if (feeAmount === 0) {
                throw new Error('Fee amount is too small');
            }

            // Get user's public key
            const userPublicKey = userWallet.publicKey;
            
            // Check user balance
            const balance = await this.connection.getBalance(userPublicKey);
            if (balance < feeAmount) {
                throw new Error('Insufficient balance for trading fee');
            }

            // Create fee transfer transaction
            const transaction = new Transaction();
            
            // Add fee transfer instruction
            const transferInstruction = SystemProgram.transfer({
                fromPubkey: userPublicKey,
                toPubkey: this.feeRecipient,
                lamports: feeAmount,
            });
            
            transaction.add(transferInstruction);

            // Get recent blockhash
            const { blockhash } = await this.connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = userPublicKey;

            // Sign and send transaction
            const signedTransaction = await userWallet.signTransaction(transaction);
            const signature = await this.connection.sendRawTransaction(signedTransaction.serialize());
            
            // Wait for confirmation
            await this.connection.confirmTransaction(signature, 'confirmed');
            
            console.log(`✅ Trading fee processed successfully: ${signature}`);
            
            // Record transaction in database
            await this.recordFeeTransaction('trading', feeAmount, signature, userPublicKey.toString());
            
            return signature;
            
        } catch (error) {
            console.error('❌ Trading fee processing error:', error);
            throw error;
        }
    }

    /**
     * Record fee transaction in database
     * @param {string} feeType - 'withdrawal' or 'trading'
     * @param {number} amount - Amount in lamports
     * @param {string} signature - Transaction signature
     * @param {string} walletAddress - User's wallet address
     */
    async recordFeeTransaction(feeType, amount, signature, walletAddress) {
        try {
            const response = await fetch('/api/wallet/process-fee', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    walletAddress: walletAddress,
                    feeType: feeType,
                    amount: amount / LAMPORTS_PER_SOL, // Convert to SOL
                    transactionHash: signature
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                console.log(`📊 Fee transaction recorded: ${feeType} - ${signature}`);
            } else {
                console.error('❌ Failed to record fee transaction:', result.error);
            }
            
        } catch (error) {
            console.error('❌ Database recording error:', error);
        }
    }

    /**
     * Get user's SOL balance
     * @param {PublicKey} publicKey - User's public key
     * @returns {Promise<number>} Balance in SOL
     */
    async getBalance(publicKey) {
        try {
            const balance = await this.connection.getBalance(publicKey);
            return balance / LAMPORTS_PER_SOL;
        } catch (error) {
            console.error('❌ Error getting balance:', error);
            return 0;
        }
    }

    /**
     * Validate transaction amount
     * @param {number} amount - Amount in SOL
     * @returns {boolean} Is valid
     */
    validateAmount(amount) {
        if (typeof amount !== 'number' || amount <= 0) {
            return false;
        }
        
        // Minimum transaction amount (0.001 SOL)
        const minimumAmount = 0.001;
        return amount >= minimumAmount;
    }

    /**
     * Estimate fee for withdrawal
     * @param {number} withdrawalAmount - Withdrawal amount in SOL
     * @returns {number} Fee amount in SOL
     */
    estimateWithdrawalFee(withdrawalAmount) {
        return (withdrawalAmount * WITHDRAWAL_FEE_PERCENT) / 100;
    }

    /**
     * Estimate fee for trading
     * @param {number} tradingAmount - Trading amount in SOL
     * @returns {number} Fee amount in SOL
     */
    estimateTradingFee(tradingAmount) {
        return (tradingAmount * TRADING_FEE_PERCENT) / 100;
    }
}

// Export for both Node.js and browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AlphaBotSolanaClient;
} else {
    window.AlphaBotSolanaClient = AlphaBotSolanaClient;
}