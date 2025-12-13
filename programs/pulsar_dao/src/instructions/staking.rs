use anchor_lang::prelude::*;
use anchor_spl::token::{Token, Mint, TokenAccount, self};
use crate::state::*;
use crate::error::ErrorCode;

////////////////////////////////////////////////////////////////
//                      STAKING CONTEXTS
////////////////////////////////////////////////////////////////

#[derive(Accounts)]
pub struct InitializeStake<'info> {
    #[account(
        init,
        payer = user,
        // Space: 8 (discriminator) + 32 (owner) + 8 (staked_amount) + 8 (lock_end_time) + 8 (original_lock_days) + 8 (multiplier)
        space = 8 + 32 + 8 + 8 + 8 + 8,
        seeds = [b"stake_record", user.key().as_ref()],
        bump
    )]
    pub stake_record: Account<'info, VoterStakeRecord>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositTokens<'info> {
    pub global_account: Account<'info, GlobalAccount>,
    
    #[account(
        mut,
        seeds = [b"stake_record", user.key().as_ref()],
        bump,
        constraint = stake_record.owner == user.key(),
    )]
    pub stake_record: Account<'info, VoterStakeRecord>,

    #[account(
        init_if_needed,
        payer = user,
        seeds = [b"vault", token_mint.key().as_ref()],
        bump,
        token::mint = token_mint,
        token::authority = vault, 
    )]
    pub vault: Account<'info, TokenAccount>,
    
    pub token_mint: Account<'info, Mint>,

    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct UnstakeTokens<'info> {
    #[account(
        mut,
        seeds = [b"stake_record", user.key().as_ref()],
        bump,
        constraint = stake_record.owner == user.key(),
    )]
    pub stake_record: Account<'info, VoterStakeRecord>,

    #[account(
        mut,
        seeds = [b"vault", token_mint.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    
    pub token_mint: Account<'info, Mint>,
    #[account(mut)]
    pub user: Signer<'info>, 
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

////////////////////////////////////////////////////////////////
//                      STAKING HANDLERS
////////////////////////////////////////////////////////////////

pub fn initialize_stake(ctx: Context<InitializeStake>) -> Result<()> {
    let stake_record = &mut ctx.accounts.stake_record;
    stake_record.owner = ctx.accounts.user.key();
    stake_record.staked_amount = 0;
    stake_record.multiplier = 1;
    Ok(())
}

pub fn deposit_tokens(ctx: Context<DepositTokens>, amount: u64, lock_days: i64) -> Result<()> {
    let stake_record = &mut ctx.accounts.stake_record;

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token::Transfer {
                from: ctx.accounts.user_token_account.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        amount,
    )?;

    stake_record.staked_amount = stake_record.staked_amount.checked_add(amount).unwrap();
    
    let clock = Clock::get()?;
    let current_time = clock.unix_timestamp;
    let lock_seconds = lock_days; // HACKATHON MODE: treated as seconds
    
    stake_record.lock_end_time = current_time + lock_seconds;
    stake_record.original_lock_days = lock_days;

    let multiplier = match lock_days {
        30 => 2,
        90 => 3,
        180 => 4,
        360 => 5,
        _ => return Err(ErrorCode::InvalidLockDuration.into()),
    };
    stake_record.multiplier = multiplier;

    Ok(())
}

pub fn unstake_tokens(ctx: Context<UnstakeTokens>) -> Result<()> {
    let stake_record = &mut ctx.accounts.stake_record;
    let clock = Clock::get()?;

    require!(clock.unix_timestamp >= stake_record.lock_end_time, ErrorCode::TokensLocked);
    require!(stake_record.staked_amount > 0, ErrorCode::NoTokensToUnstake);

    let amount = stake_record.staked_amount;

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            token::Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.user_token_account.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            },
            &[&[
                b"vault",
                ctx.accounts.token_mint.key().as_ref(),
                &[ctx.bumps.vault],
            ]],
        ),
        amount,
    )?;

    stake_record.staked_amount = 0;
    stake_record.multiplier = 1; 
    stake_record.lock_end_time = 0;
    
    Ok(())
}
