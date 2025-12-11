#![allow(deprecated)]

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Transfer};
use anchor_spl::metadata::{create_metadata_accounts_v3, CreateMetadataAccountsV3};
use anchor_spl::metadata::{create_master_edition_v3, CreateMasterEditionV3};
use anchor_spl::metadata::mpl_token_metadata::types::DataV2;

////////////////////////////////////////////////////////////////
//                     MODULE IMPORTS
////////////////////////////////////////////////////////////////

pub mod errors;
pub mod state;
pub mod contexts;

pub use errors::ErrorCode;
pub use state::*;
pub use contexts::*;

declare_id!("EiGL8MYPDdcqfJA3vYq798J1G3f77YzwyEWreDqhEFWn");

////////////////////////////////////////////////////////////////
//                   PROGRAM INSTRUCTIONS
////////////////////////////////////////////////////////////////

#[program]
pub mod pulsar_dao {
    use super::*;

    ////////////////////////////////////////////////////////////////
    //                   ADMIN INSTRUCTIONS
    ////////////////////////////////////////////////////////////////

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let global_account = &mut ctx.accounts.global_account;
        global_account.admin = ctx.accounts.user.key();
        global_account.token_mint = ctx.accounts.token_mint.key();
        global_account.proposal_count = 0;
        global_account.system_enabled = true;
        Ok(())
    }

    pub fn toggle_circuit_breaker(ctx: Context<ToggleCircuitBreaker>) -> Result<()> {
        let global_account = &mut ctx.accounts.global_account;
        require!(
            global_account.admin == ctx.accounts.user.key(),
            ErrorCode::Unauthorized
        );
        global_account.system_enabled = !global_account.system_enabled;
        Ok(())
    }

    pub fn admin_mint(ctx: Context<AdminMint>, amount: u64) -> Result<()> {
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

    ////////////////////////////////////////////////////////////////
    //                   FAUCET INSTRUCTIONS
    ////////////////////////////////////////////////////////////////

    pub fn request_tokens(ctx: Context<RequestTokens>) -> Result<()> {
        let faucet_record = &mut ctx.accounts.faucet_record;
        let clock = Clock::get()?;
        let current_time = clock.unix_timestamp;
        
        if faucet_record.last_request_time > 0 {
            require!(
                current_time >= faucet_record.last_request_time + 86400, 
                ErrorCode::FaucetCooldown
            );
        }

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

    ////////////////////////////////////////////////////////////////
    //                  PROPOSAL INSTRUCTIONS
    ////////////////////////////////////////////////////////////////

    pub fn create_proposal(
        ctx: Context<CreateProposal>,
        title: String,
        description: String,
        deadline: i64,
    ) -> Result<()> {
        let global_account = &mut ctx.accounts.global_account;
        require!(global_account.system_enabled, ErrorCode::CircuitBreakerTripped);

        let proposal_account = &mut ctx.accounts.proposal_account;

        global_account.proposal_count += 1;

        proposal_account.number = global_account.proposal_count;
        proposal_account.author = ctx.accounts.author.key();
        proposal_account.title = title;
        proposal_account.description = description;
        proposal_account.yes = 0;
        proposal_account.no = 0;
        proposal_account.deadline = deadline;
        proposal_account.is_active = true;
        // Default values for treasury fields (Standard proposal)
        proposal_account.proposal_type = 0;
        proposal_account.transfer_amount = 0;
        proposal_account.transfer_destination = ctx.accounts.author.key(); // Placeholder
        proposal_account.timelock_seconds = 0;
        proposal_account.executed = false;

        Ok(())
    }

    ////////////////////////////////////////////////////////////////
    //                   VOTING INSTRUCTIONS
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

    ////////////////////////////////////////////////////////////////
    //                  STAKING INSTRUCTIONS
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
                Transfer {
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

    ////////////////////////////////////////////////////////////////
    //                 DELEGATION INSTRUCTIONS
    ////////////////////////////////////////////////////////////////

    pub fn register_delegate(ctx: Context<RegisterDelegate>) -> Result<()> {
        let global_account = &ctx.accounts.global_account;
        require!(global_account.admin == ctx.accounts.admin.key(), ErrorCode::Unauthorized);

        let delegate_profile = &mut ctx.accounts.delegate_profile;
        let delegation_record = &ctx.accounts.user_delegation_record;
        
        // Prevent Delegator -> Delegate (must not be a delegator)
        let is_delegator = delegation_record.to_account_info().lamports() > 0 && delegation_record.owner == ctx.program_id;
        require!(!is_delegator, ErrorCode::DelegatorCannotBeDelegate);

        delegate_profile.authority = ctx.accounts.target_user.key();
        delegate_profile.is_active = true;
        
        Ok(())
    }

    pub fn delegate_vote(ctx: Context<DelegateVote>) -> Result<()> {
        let delegation_record = &mut ctx.accounts.delegation_record;
        let delegate_profile = &ctx.accounts.user_delegate_profile;

        // Prevent Delegate -> Delegate (chain)
        let is_delegate = delegate_profile.to_account_info().lamports() > 0 && delegate_profile.owner == ctx.program_id;
        require!(!is_delegate, ErrorCode::DelegateCannotDelegate);
        
        // Prevent self-delegation
        require!(ctx.accounts.user.key() != ctx.accounts.target_delegate.key(), ErrorCode::DelegationLoop);

        delegation_record.delegator = ctx.accounts.user.key();
        delegation_record.delegate_target = ctx.accounts.target_delegate.key();

        Ok(())
    }

    pub fn revoke_delegation(_ctx: Context<RevokeDelegation>) -> Result<()> {
        // Account closure handled by Anchor's `close` constraint
        Ok(())
    }

    pub fn remove_delegate(_ctx: Context<RemoveDelegate>) -> Result<()> {
        // Account closure handled by Anchor's `close` constraint
        Ok(())
    }

    ////////////////////////////////////////////////////////////////
    //                PROXY VOTING INSTRUCTIONS
    ////////////////////////////////////////////////////////////////

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

    ////////////////////////////////////////////////////////////////
    //              TREASURY PROPOSAL INSTRUCTIONS
    ////////////////////////////////////////////////////////////////

    /// Create a treasury proposal with tokens deposited to escrow
    pub fn create_treasury_proposal(
        ctx: Context<CreateTreasuryProposal>,
        title: String,
        description: String,
        deadline: i64,
        transfer_amount: u64,
        transfer_destination: Pubkey,
        timelock_seconds: i64,
    ) -> Result<()> {
        let global_account = &mut ctx.accounts.global_account;
        require!(global_account.system_enabled, ErrorCode::CircuitBreakerTripped);
        require!(transfer_amount > 0, ErrorCode::InvalidAmount);

        // Transfer tokens from author to escrow
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.author_token_account.to_account_info(),
                    to: ctx.accounts.proposal_escrow.to_account_info(),
                    authority: ctx.accounts.author.to_account_info(),
                },
            ),
            transfer_amount,
        )?;

        global_account.proposal_count += 1;

        let proposal_account = &mut ctx.accounts.proposal_account;
        proposal_account.number = global_account.proposal_count;
        proposal_account.author = ctx.accounts.author.key();
        proposal_account.title = title;
        proposal_account.description = description;
        proposal_account.yes = 0;
        proposal_account.no = 0;
        proposal_account.deadline = deadline;
        proposal_account.is_active = true;
        proposal_account.proposal_type = 1; // TreasuryTransfer
        proposal_account.transfer_amount = transfer_amount;
        proposal_account.transfer_destination = transfer_destination;
        proposal_account.timelock_seconds = timelock_seconds;
        proposal_account.executed = false;

        Ok(())
    }

    /// Execute a passed treasury proposal (anyone can call)
    pub fn execute_proposal(
        ctx: Context<ExecuteProposal>,
        proposal_number: u64,
    ) -> Result<()> {
        let proposal_account = &mut ctx.accounts.proposal_account;
        let clock = Clock::get()?;

        // Validate proposal state
        require!(!proposal_account.executed, ErrorCode::AlreadyExecuted);
        require!(clock.unix_timestamp > proposal_account.deadline, ErrorCode::ProposalNotEnded);
        
        // Check timelock
        let execution_unlock_time = proposal_account.deadline + proposal_account.timelock_seconds;
        require!(clock.unix_timestamp >= execution_unlock_time, ErrorCode::TimelockNotPassed);
        
        // Check vote result
        require!(proposal_account.yes > proposal_account.no, ErrorCode::ProposalNotPassed);

        // Validate destination matches stored destination
        require!(
            ctx.accounts.destination_token_account.owner == proposal_account.transfer_destination,
            ErrorCode::Unauthorized
        );

        // Transfer from escrow to destination
        let proposal_number_bytes = proposal_number.to_le_bytes();
        let seeds = &[
            contexts::PROPOSAL_ESCROW_SEED,
            proposal_number_bytes.as_ref(),
            &[ctx.bumps.proposal_escrow],
        ];
        let signer_seeds = &[&seeds[..]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.proposal_escrow.to_account_info(),
                    to: ctx.accounts.destination_token_account.to_account_info(),
                    authority: ctx.accounts.proposal_escrow.to_account_info(),
                },
                signer_seeds,
            ),
            proposal_account.transfer_amount,
        )?;

        proposal_account.executed = true;
        proposal_account.is_active = false;

        emit!(ProposalExecuted {
            proposal: proposal_account.key(),
            executor: ctx.accounts.executor.key(),
            destination: proposal_account.transfer_destination,
            amount: proposal_account.transfer_amount,
            success: true,
        });

        Ok(())
    }

    /// Reclaim funds from a failed treasury proposal (author only)
    pub fn reclaim_proposal_funds(
        ctx: Context<ReclaimProposalFunds>,
        proposal_number: u64,
    ) -> Result<()> {
        let proposal_account = &mut ctx.accounts.proposal_account;
        let clock = Clock::get()?;

        // Validate proposal state
        require!(!proposal_account.executed, ErrorCode::AlreadyExecuted);
        require!(clock.unix_timestamp > proposal_account.deadline, ErrorCode::ProposalNotEnded);
        
        // Check vote result - can only reclaim if NO >= YES
        require!(proposal_account.no >= proposal_account.yes, ErrorCode::ProposalPassed);

        // Transfer from escrow back to author
        let proposal_number_bytes = proposal_number.to_le_bytes();
        let seeds = &[
            contexts::PROPOSAL_ESCROW_SEED,
            proposal_number_bytes.as_ref(),
            &[ctx.bumps.proposal_escrow],
        ];
        let signer_seeds = &[&seeds[..]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.proposal_escrow.to_account_info(),
                    to: ctx.accounts.author_token_account.to_account_info(),
                    authority: ctx.accounts.proposal_escrow.to_account_info(),
                },
                signer_seeds,
            ),
            proposal_account.transfer_amount,
        )?;

        proposal_account.executed = true;
        proposal_account.is_active = false;

        emit!(ProposalFundsReclaimed {
            proposal: proposal_account.key(),
            author: ctx.accounts.author.key(),
            amount: proposal_account.transfer_amount,
        });

        Ok(())
    }

    ////////////////////////////////////////////////////////////////
    //                 GAMIFICATION INSTRUCTIONS
    ////////////////////////////////////////////////////////////////

    pub fn claim_badge(ctx: Context<ClaimBadge>) -> Result<()> {
        // Prepare AccountInfos before mutable borrow of data
        let user_stats_info = ctx.accounts.user_stats.to_account_info();
        let badge_mint_info = ctx.accounts.badge_mint.to_account_info();
        let user_info = ctx.accounts.user.to_account_info();
        let token_program_info = ctx.accounts.token_program.to_account_info();
        let metadata_program_info = ctx.accounts.token_metadata_program.to_account_info();
        let metadata_account_info = ctx.accounts.metadata_account.to_account_info();
        let master_edition_info = ctx.accounts.master_edition.to_account_info();
        let system_program_info = ctx.accounts.system_program.to_account_info();
        let rent_info = ctx.accounts.rent.to_account_info();

        // Prepare seeds
        let user_key = ctx.accounts.user.key();
        let bump = ctx.bumps.user_stats;
        let seeds = &[
            contexts::USER_STATS_SEED, 
            user_key.as_ref(),
            &[bump]
        ];
        let signer_seeds = &[&seeds[..]];

        // 1. Validation and State Update
        {
            let user_stats = &mut ctx.accounts.user_stats;
            require!(user_stats.score >= 50, ErrorCode::InsufficientScore);
            require!(!user_stats.badge_claimed, ErrorCode::AlreadyClaimed);
            user_stats.badge_claimed = true;
        }

        // 2. Mint the NFT (Token)
        token::mint_to(
            CpiContext::new_with_signer(
                token_program_info.clone(),
                token::MintTo {
                    mint: badge_mint_info.clone(),
                    to: ctx.accounts.user_badge_token_account.to_account_info(),
                    authority: user_stats_info.clone(),
                },
                signer_seeds
            ),
            1,
        )?;

        // 3. Create Metadata
        let data_v2 = DataV2 {
            name: "Pulsar Commander".to_string(),
            symbol: "PLSR-CMD".to_string(),
            uri: "https://raw.githubusercontent.com/GushALKDev/solana_voting_app/main/app/public/metadata.json".to_string(),
            seller_fee_basis_points: 0,
            creators: None,
            collection: None,
            uses: None,
        };

        let cpi_ctx = CpiContext::new_with_signer(
            metadata_program_info.clone(),
            CreateMetadataAccountsV3 {
                metadata: metadata_account_info.clone(),
                mint: badge_mint_info.clone(),
                mint_authority: user_stats_info.clone(),
                payer: user_info.clone(),
                update_authority: user_stats_info.clone(),
                system_program: system_program_info.clone(),
                rent: rent_info.clone(),
            },
            signer_seeds
        );

        create_metadata_accounts_v3(
            cpi_ctx,
            data_v2,
            true, // Is mutable
            true, // update authority is signer (pda)
            None, // Collection details
        )?;

        // 4. Create Master Edition
        let cpi_ctx_me = CpiContext::new_with_signer(
            metadata_program_info.clone(),
            CreateMasterEditionV3 {
                edition: master_edition_info,
                mint: badge_mint_info,
                update_authority: user_stats_info.clone(),
                mint_authority: user_stats_info.clone(),
                payer: user_info,
                metadata: metadata_account_info,
                token_program: token_program_info,
                system_program: system_program_info,
                rent: rent_info,
            },
            signer_seeds
        );
        
        create_master_edition_v3(
            cpi_ctx_me,
            Some(0), // Max Supply 0 (Unique)
        )?;

        Ok(())
    }
}
