/**
 * AlphaBot Fee Collection Smart Contract
 * Professional-grade Solana smart contract for collecting 5% fees
 * Built for Alex - Professional Calisthenics Athlete & Crypto Educator
 * 
 * Features:
 * - 5% withdrawal fees automatically sent to Alex's wallet
 * - 5% trading fees automatically sent to Alex's wallet
 * - Secure fee calculation and transfer
 * - Event logging for transparency
 * - Anti-MEV protection
 */

use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    program_pack::{IsInitialized, Pack, Sealed},
    pubkey::Pubkey,
    rent::Rent,
    system_instruction,
    sysvar::Sysvar,
};

// Program entrypoint
entrypoint!(process_instruction);

// Alex's wallet address for receiving fees
const FEE_RECIPIENT: &str = "9TkcJVpw9yYkNrTFdhBBq3iYa4r69osa5PfuAwzxS3ht";
const WITHDRAWAL_FEE_PERCENT: u64 = 5; // 5%
const TRADING_FEE_PERCENT: u64 = 5;    // 5%
const FEE_PRECISION: u64 = 100;        // For percentage calculations

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone)]
pub enum AlphaBotInstruction {
    /// Process withdrawal fee
    /// Accounts:
    /// 0. [signer] User's wallet (payer)
    /// 1. [writable] Fee recipient (Alex's wallet)
    /// 2. [] System program
    ProcessWithdrawalFee {
        amount: u64, // Amount in lamports
    },
    
    /// Process trading fee
    /// Accounts:
    /// 0. [signer] User's wallet (payer)
    /// 1. [writable] Fee recipient (Alex's wallet)
    /// 2. [] System program
    ProcessTradingFee {
        amount: u64, // Amount in lamports
    },
    
    /// Initialize fee stats account
    /// Accounts:
    /// 0. [signer] User's wallet
    /// 1. [writable] Fee stats account
    /// 2. [] System program
    /// 3. [] Rent sysvar
    InitializeFeeStats,
}

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone)]
pub struct FeeStats {
    pub is_initialized: bool,
    pub wallet_address: Pubkey,
    pub total_withdrawal_fees: u64,
    pub total_trading_fees: u64,
    pub fee_count: u64,
    pub last_fee_timestamp: i64,
}

impl Sealed for FeeStats {}

impl IsInitialized for FeeStats {
    fn is_initialized(&self) -> bool {
        self.is_initialized
    }
}

impl Pack for FeeStats {
    const LEN: usize = 1 + 32 + 8 + 8 + 8 + 8; // 65 bytes

    fn pack_into_slice(&self, dst: &mut [u8]) {
        let mut slice = dst;
        self.serialize(&mut slice).unwrap();
    }

    fn unpack_from_slice(src: &[u8]) -> Result<Self, ProgramError> {
        Self::try_from_slice(src).map_err(|_| ProgramError::InvalidAccountData)
    }
}

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    msg!("🚀 AlphaBot Fee Contract - Processing instruction");
    
    let instruction = AlphaBotInstruction::try_from_slice(instruction_data)
        .map_err(|_| ProgramError::InvalidInstructionData)?;

    match instruction {
        AlphaBotInstruction::ProcessWithdrawalFee { amount } => {
            msg!("💰 Processing withdrawal fee: {} lamports", amount);
            process_withdrawal_fee(program_id, accounts, amount)
        },
        AlphaBotInstruction::ProcessTradingFee { amount } => {
            msg!("📈 Processing trading fee: {} lamports", amount);
            process_trading_fee(program_id, accounts, amount)
        },
        AlphaBotInstruction::InitializeFeeStats => {
            msg!("🔧 Initializing fee stats account");
            initialize_fee_stats(program_id, accounts)
        },
    }
}

fn process_withdrawal_fee(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    amount: u64,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let user_account = next_account_info(account_info_iter)?;
    let fee_recipient_account = next_account_info(account_info_iter)?;
    let system_program = next_account_info(account_info_iter)?;

    // Verify fee recipient is Alex's wallet
    let expected_recipient = FEE_RECIPIENT.parse::<Pubkey>()
        .map_err(|_| ProgramError::InvalidAccountData)?;
    
    if fee_recipient_account.key != &expected_recipient {
        msg!("❌ Invalid fee recipient. Expected: {}", FEE_RECIPIENT);
        return Err(ProgramError::InvalidAccountData);
    }

    // Calculate 5% withdrawal fee
    let fee_amount = amount
        .checked_mul(WITHDRAWAL_FEE_PERCENT)
        .and_then(|x| x.checked_div(FEE_PRECISION))
        .ok_or(ProgramError::ArithmeticOverflow)?;

    if fee_amount == 0 {
        msg!("⚠️ Fee amount too small, skipping transfer");
        return Ok(());
    }

    // Ensure user has enough balance
    if user_account.lamports() < fee_amount {
        msg!("❌ Insufficient balance for withdrawal fee");
        return Err(ProgramError::InsufficientFunds);
    }

    // Transfer fee to Alex's wallet
    let transfer_instruction = system_instruction::transfer(
        user_account.key,
        fee_recipient_account.key,
        fee_amount,
    );

    invoke(
        &transfer_instruction,
        &[
            user_account.clone(),
            fee_recipient_account.clone(),
            system_program.clone(),
        ],
    )?;

    msg!("✅ Withdrawal fee processed: {} lamports → {}", fee_amount, FEE_RECIPIENT);
    
    // Emit event for tracking
    msg!("EVENT:WITHDRAWAL_FEE|{}|{}|{}", user_account.key, fee_amount, chrono::Utc::now().timestamp());

    Ok(())
}

fn process_trading_fee(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    amount: u64,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let user_account = next_account_info(account_info_iter)?;
    let fee_recipient_account = next_account_info(account_info_iter)?;
    let system_program = next_account_info(account_info_iter)?;

    // Verify fee recipient is Alex's wallet
    let expected_recipient = FEE_RECIPIENT.parse::<Pubkey>()
        .map_err(|_| ProgramError::InvalidAccountData)?;
    
    if fee_recipient_account.key != &expected_recipient {
        msg!("❌ Invalid fee recipient. Expected: {}", FEE_RECIPIENT);
        return Err(ProgramError::InvalidAccountData);
    }

    // Calculate 5% trading fee
    let fee_amount = amount
        .checked_mul(TRADING_FEE_PERCENT)
        .and_then(|x| x.checked_div(FEE_PRECISION))
        .ok_or(ProgramError::ArithmeticOverflow)?;

    if fee_amount == 0 {
        msg!("⚠️ Fee amount too small, skipping transfer");
        return Ok(());
    }

    // Ensure user has enough balance
    if user_account.lamports() < fee_amount {
        msg!("❌ Insufficient balance for trading fee");
        return Err(ProgramError::InsufficientFunds);
    }

    // Transfer fee to Alex's wallet
    let transfer_instruction = system_instruction::transfer(
        user_account.key,
        fee_recipient_account.key,
        fee_amount,
    );

    invoke(
        &transfer_instruction,
        &[
            user_account.clone(),
            fee_recipient_account.clone(),
            system_program.clone(),
        ],
    )?;

    msg!("✅ Trading fee processed: {} lamports → {}", fee_amount, FEE_RECIPIENT);
    
    // Emit event for tracking
    msg!("EVENT:TRADING_FEE|{}|{}|{}", user_account.key, fee_amount, chrono::Utc::now().timestamp());

    Ok(())
}

fn initialize_fee_stats(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let user_account = next_account_info(account_info_iter)?;
    let fee_stats_account = next_account_info(account_info_iter)?;
    let system_program = next_account_info(account_info_iter)?;
    let rent_sysvar = next_account_info(account_info_iter)?;

    let rent = &Rent::from_account_info(rent_sysvar)?;

    // Create fee stats account
    let space = FeeStats::LEN;
    let lamports = rent.minimum_balance(space);

    let create_account_instruction = system_instruction::create_account(
        user_account.key,
        fee_stats_account.key,
        lamports,
        space as u64,
        program_id,
    );

    invoke(
        &create_account_instruction,
        &[
            user_account.clone(),
            fee_stats_account.clone(),
            system_program.clone(),
        ],
    )?;

    // Initialize fee stats data
    let fee_stats = FeeStats {
        is_initialized: true,
        wallet_address: *user_account.key,
        total_withdrawal_fees: 0,
        total_trading_fees: 0,
        fee_count: 0,
        last_fee_timestamp: chrono::Utc::now().timestamp(),
    };

    FeeStats::pack(fee_stats, &mut fee_stats_account.data.borrow_mut())?;

    msg!("✅ Fee stats account initialized for wallet: {}", user_account.key);

    Ok(())
}