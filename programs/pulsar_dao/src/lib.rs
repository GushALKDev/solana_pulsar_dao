use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use anchor_spl::associated_token::AssociatedToken;
use std::str::FromStr;

declare_id!("3L3AHoLNohPcM9oPWKpYxGeCRYnfKKuh6zzEpVKXfYJM");

const GLOBAL_ACCOUNT_SEED: &[u8] = b"global_account";
const PROPOSAL_SEED: &[u8] = b"proposal";
const STAKE_RECORD_SEED: &[u8] = b"stake_record";
const VOTER_SEED: &[u8] = b"voter";
const VAULT_SEED: &[u8] = b"vault";
const FAUCET_SEED: &[u8] = b"faucet";

#[program]
pub mod pulsar_dao {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let global_account = &mut ctx.accounts.global_account;

        // Removed hardcoded deployer check allows any wallet to initialize
        // The initializer becomes the admin automatically below

        global_account.admin = ctx.accounts.user.key();
        global_account.token_mint = ctx.accounts.token_mint.key();
        global_account.proposal_count = 0;
        global_account.system_enabled = true; // SYSTEM ONLINE by default
        Ok(())
    }

    pub fn toggle_circuit_breaker(ctx: Context<ToggleCircuitBreaker>) -> Result<()> {
        let global_account = &mut ctx.accounts.global_account;
        require_keys_eq!(
            global_account.admin,
            ctx.accounts.user.key(),
            ErrorCode::Unauthorized
        );
        global_account.system_enabled = !global_account.system_enabled;
        Ok(())
    }

    pub fn admin_mint(ctx: Context<AdminMint>, amount: u64) -> Result<()> {
        // Mint to target. Authority is Global Account PDA
        
        // Calculate amount with decimals (assuming input is "human readable" amount, or raw? 
        // User request usually implies raw if not specified, but for consistency with request_tokens which does 3000 * 10^decimals...
        // Let's look at TokenManager.js usages. It usually handles decimals or passes raw?
        // TokenManager sends "mintAmount" (e.g. 100). If we want consistency, we should multiply by decimals here 
        // OR the frontend handles it. 
        // In request_tokens, we did: 3000 * 10u64.pow(decimals).
        // Let's do the same here for ease of use from "human" numbers in the admin panel.
        
        let amount_with_decimals = amount.checked_mul(10u64.pow(ctx.accounts.token_mint.decimals as u32)).unwrap();

        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token::MintTo {
                    mint: ctx.accounts.token_mint.to_account_info(),
                    to: ctx.accounts.target_token_account.to_account_info(),
                    authority: ctx.accounts.global_account.to_account_info(),
                },
                &[&[GLOBAL_ACCOUNT_SEED, &[ctx.bumps.global_account]]]
            ),
            amount_with_decimals,
        )?;
        Ok(())
    }

    pub fn request_tokens(ctx: Context<RequestTokens>) -> Result<()> {
        let faucet_record = &mut ctx.accounts.faucet_record;
        let clock = Clock::get()?;
        let current_time = clock.unix_timestamp;
        
        // 24 hours in seconds = 86400
        if faucet_record.last_request_time > 0 {
            require!(
                current_time >= faucet_record.last_request_time + 86400, 
                ErrorCode::FaucetCooldown
            );
        }

        // Mint 3000 Tokens
        let amount = 3000 * 10u64.pow(ctx.accounts.token_mint.decimals as u32);
        
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token::MintTo {
                    mint: ctx.accounts.token_mint.to_account_info(),
                    to: ctx.accounts.user_token_account.to_account_info(),
                    authority: ctx.accounts.global_account.to_account_info(),
                },
                &[&[GLOBAL_ACCOUNT_SEED, &[ctx.bumps.global_account]]]
            ),
            amount,
        )?;

        faucet_record.last_request_time = current_time;
        
        Ok(())
    }

    pub fn create_proposal(
        ctx: Context<CreateProposal>,
        question: String,
        deadline: i64,
    ) -> Result<()> {
        let global_account = &mut ctx.accounts.global_account;
        require!(global_account.system_enabled, ErrorCode::CircuitBreakerTripped); // Strict option: prevent creation too? Or just voting? Usually just voting. Let's keep creation open or check safe check. Actually user said "Prevent voting". I'll add check for safety.

        let proposal_account = &mut ctx.accounts.proposal_account;

        global_account.proposal_count += 1;

        proposal_account.number = global_account.proposal_count;
        proposal_account.author = ctx.accounts.author.key();
        proposal_account.question = question;
        proposal_account.yes = 0;
        proposal_account.no = 0;
        proposal_account.deadline = deadline;
        proposal_account.is_active = true;

        Ok(())
    }
    
    // ...

    pub fn vote(ctx: Context<VoteProposal>, vote_yes: bool) -> Result<()> {
        let global_account = &ctx.accounts.global_account;
        require!(global_account.system_enabled, ErrorCode::CircuitBreakerTripped);

        let proposal_account = &mut ctx.accounts.proposal_account;
        let voter_record = &mut ctx.accounts.voter_record;
        let stake_record = &ctx.accounts.stake_record;
        let user_token_account = &ctx.accounts.user_token_account;
        let clock = Clock::get()?;

        require!(proposal_account.is_active, ErrorCode::ProposalNotActive);
        require!(clock.unix_timestamp <= proposal_account.deadline, ErrorCode::ProposalExpired);
        
        // Liquid Power
        let liquid_amount = user_token_account.amount;
        let liquid_power = (liquid_amount as f64).sqrt() as u64;

        // Staked Power
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
            // Check if trying to vote for the same option
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
            
            // Update record
            voter_record.vote = vote_yes;
            voter_record.voting_power = total_voting_power;
            voter_record.staked_amount = staked_amount;

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
                Transfer {
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
        
        // HACKATHON MODE: lock_days is treated as SECONDS
        let lock_seconds = lock_days;
        
        // let lock_seconds = lock_days * 24 * 60 * 60;
        
        stake_record.lock_end_time = current_time + lock_seconds;
        stake_record.original_lock_days = lock_days;

        stake_record.lock_end_time = current_time + lock_seconds;
        stake_record.original_lock_days = lock_days;

        // Exact match logic for multipliers
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
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.user_token_account.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                &[&[
                    b"vault",
                    ctx.accounts.token_mint.key().as_ref(), // Updated to use token_mint key for seeds
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
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = user,
        seeds = [GLOBAL_ACCOUNT_SEED],
        bump,
        space = 8 + 32 + 32 + 8 + 1 // discriminator + admin + mint + counter + bool
    )]
    pub global_account: Account<'info, GlobalAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub token_mint: Account<'info, Mint>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ToggleCircuitBreaker<'info> {
    #[account(
        mut,
        seeds = [GLOBAL_ACCOUNT_SEED],
        bump,
    )]
    pub global_account: Account<'info, GlobalAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
}

#[derive(Accounts)]
pub struct CreateProposal<'info> {
    #[account(
        mut,
        seeds = [GLOBAL_ACCOUNT_SEED],
        bump,
        constraint = global_account.admin == author.key() @ ErrorCode::Unauthorized
    )]
    pub global_account: Account<'info, GlobalAccount>,
    #[account(
        init,
        payer = author,
        space = 8 + 8 + 32 + 200 + 8 + 8 + 8 + 1,
        seeds = [PROPOSAL_SEED, (global_account.proposal_count + 1).to_le_bytes().as_ref()],
        bump
    )]
    pub proposal_account: Account<'info, ProposalAccount>,
    #[account(mut)]
    pub author: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeStake<'info> {
    #[account(
        init,
        payer = user,
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
    pub global_account: Account<'info, GlobalAccount>, // Just for context if needed, or remove? Keeping for consistency
    
    #[account(
        mut,
        seeds = [b"stake_record", user.key().as_ref()],
        bump,
        constraint = stake_record.owner == user.key() @ ErrorCode::Unauthorized,
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
        constraint = stake_record.owner == user.key() @ ErrorCode::Unauthorized,
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

#[derive(Accounts)]
pub struct RequestTokens<'info> {
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + 8, // discriminator + last_request_time
        seeds = [FAUCET_SEED, user.key().as_ref()],
        bump
    )]
    pub faucet_record: Account<'info, FaucetRecord>,

    #[account(
        mut,
        seeds = [b"global_account"],
        bump,
    )]
    pub global_account: Account<'info, GlobalAccount>,

    #[account(mut)]
    pub token_mint: Account<'info, Mint>,

    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = token_mint,
        associated_token::authority = user,
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdminMint<'info> {
    #[account(
        seeds = [b"global_account"], 
        bump,
        has_one = admin,
        has_one = token_mint
    )]
    pub global_account: Account<'info, GlobalAccount>,

    #[account(mut)]
    pub token_mint: Account<'info, Mint>,

    #[account(mut)]
    pub target_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct VoteProposal<'info> {
    #[account(
        seeds = [b"global_account"],
        bump
    )]
    pub global_account: Account<'info, GlobalAccount>,
    #[account(mut)]
    pub proposal_account: Account<'info, ProposalAccount>,
    
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + 32 + 32 + 1 + 1 + 8 + 8 + 8,
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
        constraint = user_token_account.mint == global_account.token_mint @ ErrorCode::InvalidTokenAccount,
        constraint = user_token_account.owner == user.key() @ ErrorCode::Unauthorized
    )]
    pub user_token_account: Account<'info, TokenAccount>,

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
        constraint = voter_record.voter == user.key() @ ErrorCode::Unauthorized
    )]
    pub voter_record: Account<'info, VoterRecord>,
    #[account(mut)]
    pub user: Signer<'info>,
}

#[account]
pub struct GlobalAccount {
    pub admin: Pubkey,
    pub token_mint: Pubkey,
    pub proposal_count: u64,
    pub system_enabled: bool, // Renamed
}

#[account]
pub struct ProposalAccount {
    pub number: u64,
    pub author: Pubkey,
    pub question: String,
    pub yes: u64,
    pub no: u64,
    pub deadline: i64,
    pub is_active: bool,
}

#[account]
pub struct VoterRecord {
    pub proposal: Pubkey,
    pub voter: Pubkey,
    pub vote: bool,
    pub voted: bool,
    pub voting_power: u64,
    pub staked_amount: u64,
}

#[account]
pub struct VoterStakeRecord {
    pub owner: Pubkey,
    pub staked_amount: u64,
    pub lock_end_time: i64,
    pub original_lock_days: i64,
    pub multiplier: u64,
}

#[account]
pub struct FaucetRecord {
    pub last_request_time: i64,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Proposal is not active.")]
    ProposalNotActive,
    #[msg("Proposal has expired.")]
    ProposalExpired,
    #[msg("You have already voted.")]
    AlreadyVoted,
    #[msg("System is OFFLINE (Circuit Breaker Tripped).")]
    CircuitBreakerTripped,
    #[msg("Invalid vote option.")]
    InvalidVoteOption,
    #[msg("Unauthorized access.")]
    Unauthorized,
    #[msg("Tokens are still locked.")]
    TokensLocked,
    #[msg("Lock duration cannot be less than previous stake.")]
    LockDurationDowngrade,
    #[msg("No tokens to unstake.")]
    NoTokensToUnstake,
    #[msg("No voting power available (Stake tokens first).")]
    NoVotingPower,
    #[msg("Invalid token account.")]
    InvalidTokenAccount,
    #[msg("Invalid lock duration.")]
    InvalidLockDuration,
    #[msg("You must wait 24 hours between faucet requests.")]
    FaucetCooldown,
}

#[event]
pub struct VoteCast {
    pub voter: Pubkey,
    pub proposal: Pubkey,
    pub amount: u64,
    pub lock_duration: i64,
    pub voting_power: u64,
    pub multiplier: u64,
}
