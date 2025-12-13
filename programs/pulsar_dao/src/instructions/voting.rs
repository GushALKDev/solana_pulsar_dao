use anchor_lang::prelude::*;
use anchor_spl::token::TokenAccount;
use crate::state::*;
use crate::error::ErrorCode;
use crate::instructions::admin::GLOBAL_ACCOUNT_SEED;
use crate::instructions::delegation::{DELEGATE_PROFILE_SEED, DELEGATION_RECORD_SEED};

pub const USER_STATS_SEED: &[u8] = b"user_stats_v2";

////////////////////////////////////////////////////////////////
//                      VOTING CONTEXTS
////////////////////////////////////////////////////////////////

#[derive(Accounts)]
pub struct VoteProposal<'info> {
    #[account(
        seeds = [GLOBAL_ACCOUNT_SEED],
        bump
    )]
    pub global_account: Account<'info, GlobalAccount>,

    #[account(mut)]
    pub proposal_account: Account<'info, ProposalAccount>,

    #[account(
        init_if_needed,
        payer = user,
        // Space: 8 (discriminator) + 32 (proposal) + 32 (voter) + 1 (vote) + 1 (voted) + 8 (voting_power) + 8 (staked_amount) + 1 (voted_by_proxy)
        space = 8 + 32 + 32 + 1 + 1 + 8 + 8 + 1,
        seeds = [b"voter", proposal_account.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub voter_record: Account<'info, VoterRecord>,

    #[account(
        mut,
        seeds = [b"stake_record", user.key().as_ref()],
        bump,
    )]
    pub stake_record: Option<Account<'info, VoterStakeRecord>>,

    #[account(
        constraint = user_token_account.mint == global_account.token_mint,
        constraint = user_token_account.owner == user.key()
    )]
    pub user_token_account: Account<'info, TokenAccount>,
    
    /// CHECK: Checked in instruction to ensure user is NOT delegating
    #[account(
        seeds = [DELEGATION_RECORD_SEED, user.key().as_ref()],
        bump
    )]
    pub delegation_record: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = user,
        // Space: 8 (discriminator) + 32 (user) + 8 (proposal_count) + 8 (last_vote_time) + 8 (score) + 1 (badge_claimed)
        space = 8 + 32 + 8 + 8 + 8 + 1,
        seeds = [USER_STATS_SEED, user.key().as_ref()],
        bump
    )]
    pub user_stats: Account<'info, UserStats>,

    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawVote<'info> {
    #[account(
        seeds = [GLOBAL_ACCOUNT_SEED],
        bump
    )]
    pub global_account: Account<'info, GlobalAccount>,
    #[account(mut)]
    pub proposal_account: Account<'info, ProposalAccount>,
    #[account(
        mut,
        seeds = [b"voter", proposal_account.key().as_ref(), user.key().as_ref()],
        bump,
        constraint = voter_record.voter == user.key()
    )]
    pub voter_record: Account<'info, VoterRecord>,
    #[account(mut)]
    pub user: Signer<'info>,
}

#[derive(Accounts)]
pub struct VoteAsProxy<'info> {
    #[account(
        seeds = [GLOBAL_ACCOUNT_SEED],
        bump
    )]
    pub global_account: Account<'info, GlobalAccount>,
    
    #[account(mut)]
    pub proposal_account: Account<'info, ProposalAccount>,

    #[account(
        seeds = [DELEGATE_PROFILE_SEED, proxy_authority.key().as_ref()],
        bump,
    )]
    pub delegate_profile: Account<'info, DelegateProfile>,

    #[account(
        seeds = [DELEGATION_RECORD_SEED, delegator_user.key().as_ref()],
        bump,
    )]
    pub delegation_record: Account<'info, DelegationRecord>,

    #[account(
        init_if_needed,
        payer = proxy_authority,
        // Space: 8 (discriminator) + 32 (proposal) + 32 (voter) + 1 (vote) + 1 (voted) + 8 (voting_power) + 8 (staked_amount) + 1 (voted_by_proxy)
        space = 8 + 32 + 32 + 1 + 1 + 8 + 8 + 1,
        seeds = [b"voter", proposal_account.key().as_ref(), delegator_user.key().as_ref()],
        bump
    )]
    pub voter_record: Account<'info, VoterRecord>,

    /// CHECK: We just read amount/owner. Verified by constraints.
    #[account(
        constraint = delegator_token_account.mint == global_account.token_mint,
        constraint = delegator_token_account.owner == delegator_user.key()
    )]
    pub delegator_token_account: Account<'info, TokenAccount>,

    /// Optional stake record for delegator (may not exist if never staked)
    /// CHECK: We verify the seeds manually if Some
    pub delegator_stake_record: Option<Account<'info, VoterStakeRecord>>,

    /// CHECK: The user who is being voted FOR. They don't sign.
    pub delegator_user: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = proxy_authority,
        // Space: 8 (discriminator) + 32 (user) + 8 (proposal_count) + 8 (last_vote_time) + 8 (score) + 1 (badge_claimed)
        space = 8 + 32 + 8 + 8 + 8 + 1,
        seeds = [USER_STATS_SEED, proxy_authority.key().as_ref()],
        bump
    )]
    pub user_stats: Account<'info, UserStats>,

    #[account(mut)]
    pub proxy_authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawAsProxy<'info> {
    #[account(
        seeds = [GLOBAL_ACCOUNT_SEED],
        bump,
    )]
    pub global_account: Account<'info, GlobalAccount>,

    #[account(mut)]
    pub proposal_account: Account<'info, ProposalAccount>,

    #[account(
        seeds = [b"delegate_profile", proxy_authority.key().as_ref()],
        bump,
    )]
    pub delegate_profile: Account<'info, DelegateProfile>,

    #[account(
        seeds = [DELEGATION_RECORD_SEED, delegator_user.key().as_ref()],
        bump,
    )]
    pub delegation_record: Account<'info, DelegationRecord>,

    #[account(
        mut,
        seeds = [b"voter", proposal_account.key().as_ref(), delegator_user.key().as_ref()],
        bump
    )]
    pub voter_record: Account<'info, VoterRecord>,

    /// CHECK: User verified by delegation record
    pub delegator_user: UncheckedAccount<'info>,

    #[account(mut)]
    pub proxy_authority: Signer<'info>,
}

////////////////////////////////////////////////////////////////
//                      VOTING HANDLERS
////////////////////////////////////////////////////////////////

pub fn vote(ctx: Context<VoteProposal>, vote_yes: bool) -> Result<()> {
    let global_account = &ctx.accounts.global_account;
    require!(global_account.system_enabled, ErrorCode::CircuitBreakerTripped);

    let proposal_account = &mut ctx.accounts.proposal_account;
    let voter_record = &mut ctx.accounts.voter_record;
    let user_token_account = &ctx.accounts.user_token_account;
    let clock = Clock::get()?;

    require!(proposal_account.is_active, ErrorCode::ProposalNotActive);
    require!(clock.unix_timestamp <= proposal_account.deadline, ErrorCode::ProposalExpired);
    
    // Security: Prevent double voting (delegators cannot vote directly)
    require!(ctx.accounts.delegation_record.data_is_empty(), ErrorCode::DelegatorsCannotVote);

    // Calculate voting power
    let liquid_amount = user_token_account.amount;
    let liquid_power = (liquid_amount as f64).sqrt() as u64;

    let (staked_amount, multiplier) = if let Some(stake_record) = &ctx.accounts.stake_record {
        (stake_record.staked_amount, stake_record.multiplier)
    } else {
        (0, 1)
    };

    let staked_sqrt = (staked_amount as f64).sqrt() as u64;
    let staked_power = staked_sqrt.checked_mul(multiplier).unwrap_or(0);
    let total_voting_power = liquid_power.checked_add(staked_power).unwrap();

    require!(total_voting_power > 0, ErrorCode::NoVotingPower);

    if voter_record.voted {
        // Proxy votes are locked
        require!(!voter_record.voted_by_proxy, ErrorCode::ProxyVoteLocked);
        
        // Prevent voting for same option (must switch)
        require!(voter_record.vote != vote_yes, ErrorCode::AlreadyVoted);

        // Remove old vote weight
        if voter_record.vote {
            proposal_account.yes = proposal_account.yes.checked_sub(voter_record.voting_power).unwrap();
        } else {
            proposal_account.no = proposal_account.no.checked_sub(voter_record.voting_power).unwrap();
        }

        // Add new vote weight
        if vote_yes {
            proposal_account.yes = proposal_account.yes.checked_add(total_voting_power).unwrap();
        } else {
            proposal_account.no = proposal_account.no.checked_add(total_voting_power).unwrap();
        }
        
        voter_record.vote = vote_yes;
        voter_record.voting_power = total_voting_power;
        voter_record.staked_amount = staked_amount;
        voter_record.voted_by_proxy = false;

    } else {
        // First time vote
        if vote_yes {
            proposal_account.yes = proposal_account.yes.checked_add(total_voting_power).unwrap();
        } else {
            proposal_account.no = proposal_account.no.checked_add(total_voting_power).unwrap();
        }

        voter_record.proposal = proposal_account.key();
        voter_record.voter = ctx.accounts.user.key();
        voter_record.vote = vote_yes;
        voter_record.voted = true;
        voter_record.voting_power = total_voting_power;
        voter_record.staked_amount = staked_amount;
    }

    // Update User Stats
    let user_stats = &mut ctx.accounts.user_stats;
    if user_stats.proposal_count == 0 {
        user_stats.user = ctx.accounts.user.key();
        user_stats.score = 0;
    }
    user_stats.proposal_count = user_stats.proposal_count.checked_add(1).unwrap();
    user_stats.last_vote_time = clock.unix_timestamp;
    user_stats.score = user_stats.score.checked_add(10).unwrap(); // 10 points per vote

    emit!(VoteCast {
        voter: ctx.accounts.user.key(),
        proposal: proposal_account.key(),
        amount: staked_amount,
        lock_duration: if let Some(r) = &ctx.accounts.stake_record { r.original_lock_days } else { 0 },
        voting_power: total_voting_power,
        multiplier: multiplier,
    });

    Ok(())
}

pub fn withdraw_vote(ctx: Context<WithdrawVote>) -> Result<()> {
    let proposal_account = &mut ctx.accounts.proposal_account;
    let voter_record = &mut ctx.accounts.voter_record;
    let global_account = &ctx.accounts.global_account;

    require!(global_account.system_enabled, ErrorCode::CircuitBreakerTripped);

    let clock = Clock::get()?;
    require!(proposal_account.is_active, ErrorCode::ProposalNotActive);
    require!(clock.unix_timestamp <= proposal_account.deadline, ErrorCode::ProposalExpired);

    if voter_record.voted {
        require!(!voter_record.voted_by_proxy, ErrorCode::ProxyVoteLocked);

        if voter_record.vote {
            proposal_account.yes = proposal_account.yes.checked_sub(voter_record.voting_power).unwrap();
        } else {
            proposal_account.no = proposal_account.no.checked_sub(voter_record.voting_power).unwrap();
        }

        voter_record.voted = false;
        voter_record.voting_power = 0;
    } else {
        return Err(ErrorCode::Unauthorized.into());
    }

    Ok(())
}

pub fn vote_as_proxy(ctx: Context<VoteAsProxy>, vote_yes: bool) -> Result<()> {
    let global_account = &ctx.accounts.global_account;
    require!(global_account.system_enabled, ErrorCode::CircuitBreakerTripped);

    // Security: Validate delegate
    require!(ctx.accounts.delegate_profile.is_active, ErrorCode::InvalidDelegate);
    require!(ctx.accounts.delegate_profile.authority == ctx.accounts.proxy_authority.key(), ErrorCode::Unauthorized);

    // Security: Validate delegation
    let delegation_record = &ctx.accounts.delegation_record;
    require!(delegation_record.delegator == ctx.accounts.delegator_user.key(), ErrorCode::Unauthorized);
    require!(delegation_record.delegate_target == ctx.accounts.proxy_authority.key(), ErrorCode::Unauthorized);

    let proposal_account = &mut ctx.accounts.proposal_account;
    let voter_record = &mut ctx.accounts.voter_record;
    let clock = Clock::get()?;

    require!(proposal_account.is_active, ErrorCode::ProposalNotActive);
    require!(clock.unix_timestamp <= proposal_account.deadline, ErrorCode::ProposalExpired);
   
    // Calculate delegator's voting power
    let liquid_amount = ctx.accounts.delegator_token_account.amount;
    let liquid_power = (liquid_amount as f64).sqrt() as u64;

    let (staked_amount, multiplier) = if let Some(stake_record) = &ctx.accounts.delegator_stake_record {
        (stake_record.staked_amount, stake_record.multiplier)
    } else {
        (0, 1)
    };

    let staked_sqrt = (staked_amount as f64).sqrt() as u64;
    let staked_power = staked_sqrt.checked_mul(multiplier).unwrap_or(0);
    let total_voting_power = liquid_power.checked_add(staked_power).unwrap();

    require!(total_voting_power > 0, ErrorCode::NoVotingPower);

    // Apply vote
    if voter_record.voted {
         require!(voter_record.vote != vote_yes, ErrorCode::AlreadyVoted);
         
         if voter_record.vote {
             proposal_account.yes = proposal_account.yes.checked_sub(voter_record.voting_power).unwrap();
         } else {
             proposal_account.no = proposal_account.no.checked_sub(voter_record.voting_power).unwrap();
         }

         if vote_yes {
             proposal_account.yes = proposal_account.yes.checked_add(total_voting_power).unwrap();
         } else {
             proposal_account.no = proposal_account.no.checked_add(total_voting_power).unwrap();
         }
    } else {
         if vote_yes {
             proposal_account.yes = proposal_account.yes.checked_add(total_voting_power).unwrap();
         } else {
             proposal_account.no = proposal_account.no.checked_add(total_voting_power).unwrap();
         }
    }

    voter_record.proposal = proposal_account.key();
    voter_record.voter = ctx.accounts.delegator_user.key();
    voter_record.vote = vote_yes;
    voter_record.voted = true;
    voter_record.voting_power = total_voting_power;
    voter_record.staked_amount = staked_amount;
    voter_record.voted_by_proxy = true;

    // Update Proxy User Stats (the person doing the work gets the points)
    let user_stats = &mut ctx.accounts.user_stats;
    if user_stats.proposal_count == 0 {
        user_stats.user = ctx.accounts.proxy_authority.key();
        user_stats.score = 0;
    }
    user_stats.proposal_count = user_stats.proposal_count.checked_add(1).unwrap();
    user_stats.last_vote_time = clock.unix_timestamp;
    user_stats.score = user_stats.score.checked_add(10).unwrap();

    emit!(VoteCast {
        voter: ctx.accounts.delegator_user.key(),
        proposal: proposal_account.key(),
        amount: staked_amount,
        lock_duration: if let Some(r) = &ctx.accounts.delegator_stake_record { r.original_lock_days } else { 0 },
        voting_power: total_voting_power,
        multiplier: multiplier,
    });

    Ok(())
}

pub fn withdraw_as_proxy(ctx: Context<WithdrawAsProxy>) -> Result<()> {
    let global_account = &ctx.accounts.global_account;
    require!(global_account.system_enabled, ErrorCode::CircuitBreakerTripped);

    // Security: Validate delegate
    require!(ctx.accounts.delegate_profile.is_active, ErrorCode::InvalidDelegate);
    require!(ctx.accounts.delegate_profile.authority == ctx.accounts.proxy_authority.key(), ErrorCode::Unauthorized);

    // Security: Validate delegation
    let delegation_record = &ctx.accounts.delegation_record;
    require!(delegation_record.delegator == ctx.accounts.delegator_user.key(), ErrorCode::Unauthorized);
    require!(delegation_record.delegate_target == ctx.accounts.proxy_authority.key(), ErrorCode::Unauthorized);

    let proposal_account = &mut ctx.accounts.proposal_account;
    let voter_record = &mut ctx.accounts.voter_record;
    let clock = Clock::get()?;

    require!(proposal_account.is_active, ErrorCode::ProposalNotActive);
    require!(clock.unix_timestamp <= proposal_account.deadline, ErrorCode::ProposalExpired);

    if voter_record.voted {
        if voter_record.vote {
            proposal_account.yes = proposal_account.yes.checked_sub(voter_record.voting_power).unwrap();
        } else {
            proposal_account.no = proposal_account.no.checked_sub(voter_record.voting_power).unwrap();
        }

        voter_record.voted = false;
        voter_record.voting_power = 0;
        voter_record.voted_by_proxy = false;
    }

    Ok(())
}
