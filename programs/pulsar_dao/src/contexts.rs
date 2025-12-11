////////////////////////////////////////////////////////////////
//               INSTRUCTION CONTEXT STRUCTS
//                   (Account Validation)
////////////////////////////////////////////////////////////////

use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::metadata::Metadata;

use crate::state::*;
use crate::errors::ErrorCode;

pub const GLOBAL_ACCOUNT_SEED: &[u8] = b"global_account";
pub const PROPOSAL_SEED: &[u8] = b"proposal";
pub const FAUCET_SEED: &[u8] = b"faucet";
pub const DELEGATE_PROFILE_SEED: &[u8] = b"delegate_profile";
pub const DELEGATION_RECORD_SEED: &[u8] = b"delegation_record";
pub const USER_STATS_SEED: &[u8] = b"user_stats_v2";
pub const BADGE_MINT_SEED: &[u8] = b"badge";

////////////////////////////////////////////////////////////////
//                      ADMIN CONTEXTS
////////////////////////////////////////////////////////////////

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = user,
        space = 8 + 32 + 32 + 8 + 1,
        seeds = [GLOBAL_ACCOUNT_SEED],
        bump
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
        bump
    )]
    pub global_account: Account<'info, GlobalAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
}

#[derive(Accounts)]
pub struct AdminMint<'info> {
    #[account(
        seeds = [GLOBAL_ACCOUNT_SEED],
        bump
    )]
    pub global_account: Account<'info, GlobalAccount>,
    
    #[account(
        mut,
        constraint = token_mint.mint_authority.unwrap() == global_account.key()
    )]
    pub token_mint: Account<'info, Mint>,
    
    #[account(mut)]
    pub target_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub admin: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

////////////////////////////////////////////////////////////////
//                     PROPOSAL CONTEXTS
////////////////////////////////////////////////////////////////

#[derive(Accounts)]
pub struct CreateProposal<'info> {
    #[account(
        mut,
        seeds = [GLOBAL_ACCOUNT_SEED],
        bump,
    )]
    pub global_account: Account<'info, GlobalAccount>,
    #[account(
        init,
        payer = author,
        // Space: discriminator(8) + number(8) + author(32) + title(4+100) + question(4+500) + yes(8) + no(8) + deadline(8) + is_active(1) 
        // + proposal_type(1) + transfer_amount(8) + transfer_destination(32) + timelock_seconds(8) + executed(1) = 731 bytes
        space = 8 + 8 + 32 + 104 + 504 + 8 + 8 + 8 + 1 + 1 + 8 + 32 + 8 + 1,
        seeds = [PROPOSAL_SEED, (global_account.proposal_count + 1).to_le_bytes().as_ref()],
        bump
    )]
    pub proposal_account: Account<'info, ProposalAccount>,
    #[account(mut)]
    pub author: Signer<'info>,
    pub system_program: Program<'info, System>,
}

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
        space = 8 + 32 + 32 + 1 + 1 + 8 + 8 + 1 + 8,
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

////////////////////////////////////////////////////////////////
//                     STAKING CONTEXTS
////////////////////////////////////////////////////////////////

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
//                      FAUCET CONTEXTS
////////////////////////////////////////////////////////////////

#[derive(Accounts)]
pub struct RequestTokens<'info> {
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + 8,
        seeds = [FAUCET_SEED, user.key().as_ref()],
        bump
    )]
    pub faucet_record: Account<'info, FaucetRecord>,
    
    #[account(
        seeds = [GLOBAL_ACCOUNT_SEED],
        bump
    )]
    pub global_account: Account<'info, GlobalAccount>,
    
    #[account(
        mut,
        constraint = token_mint.mint_authority.unwrap() == global_account.key()
    )]
    pub token_mint: Account<'info, Mint>,

    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = token_mint,
        associated_token::authority = user
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

////////////////////////////////////////////////////////////////
//                    DELEGATION CONTEXTS
////////////////////////////////////////////////////////////////

#[derive(Accounts)]
pub struct RegisterDelegate<'info> {
    #[account(
        seeds = [GLOBAL_ACCOUNT_SEED],
        bump,
    )]
    pub global_account: Account<'info, GlobalAccount>,
    
    #[account(
        init,
        payer = admin,
        space = 8 + 32 + 1,
        seeds = [DELEGATE_PROFILE_SEED, target_user.key().as_ref()],
        bump
    )]
    pub delegate_profile: Account<'info, DelegateProfile>,
    
    /// CHECK: The user being promoted to delegate status
    pub target_user: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub admin: Signer<'info>,
    
    /// CHECK: Validation check - Ensure target is not already a Delegator
    #[account(
        seeds = [DELEGATION_RECORD_SEED, target_user.key().as_ref()],
        bump
    )]
    pub user_delegation_record: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DelegateVote<'info> {
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + 32 + 32,
        seeds = [DELEGATION_RECORD_SEED, user.key().as_ref()],
        bump
    )]
    pub delegation_record: Account<'info, DelegationRecord>,
    
    /// CHECK: The target delegate
    pub target_delegate: UncheckedAccount<'info>,

    /// CHECK: Validation check - Ensure User is not a Delegate (No chaining)
    #[account(
        seeds = [DELEGATE_PROFILE_SEED, user.key().as_ref()],
        bump
    )]
    pub user_delegate_profile: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevokeDelegation<'info> {
    #[account(
        mut,
        seeds = [DELEGATION_RECORD_SEED, user.key().as_ref()],
        bump,
        close = user
    )]
    pub delegation_record: Account<'info, DelegationRecord>,
    #[account(mut)]
    pub user: Signer<'info>,
}

#[derive(Accounts)]
pub struct RemoveDelegate<'info> {
    #[account(
        seeds = [GLOBAL_ACCOUNT_SEED],
        bump
    )]
    pub global_account: Account<'info, GlobalAccount>,
    
    #[account(
        mut,
        seeds = [DELEGATE_PROFILE_SEED, target_user.key().as_ref()],
        bump,
        close = admin
    )]
    pub delegate_profile: Account<'info, DelegateProfile>,
    
    /// CHECK: The delegate being removed
    pub target_user: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub admin: Signer<'info>,
}

////////////////////////////////////////////////////////////////
//                   PROXY VOTING CONTEXTS
////////////////////////////////////////////////////////////////

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
        space = 8 + 32 + 32 + 1 + 1 + 8 + 8 + 1 + 8,
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

    #[account(
        mut,
        seeds = [b"stake_record", delegator_user.key().as_ref()],
        bump,
    )]
    pub delegator_stake_record: Option<Account<'info, VoterStakeRecord>>,

    /// CHECK: The user who is being voted FOR. They don't sign.
    pub delegator_user: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = proxy_authority,
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
//                TREASURY PROPOSAL CONTEXTS
////////////////////////////////////////////////////////////////

pub const PROPOSAL_ESCROW_SEED: &[u8] = b"proposal_escrow";

#[derive(Accounts)]
pub struct CreateTreasuryProposal<'info> {
    #[account(
        mut,
        seeds = [GLOBAL_ACCOUNT_SEED],
        bump,
    )]
    pub global_account: Account<'info, GlobalAccount>,
    
    #[account(
        init,
        payer = author,
        // Space: discriminator(8) + number(8) + author(32) + title(4+100) + question(4+500) + yes(8) + no(8) + deadline(8) + is_active(1) 
        // + proposal_type(1) + transfer_amount(8) + transfer_destination(32) + timelock_seconds(8) + executed(1) = 731 bytes
        space = 8 + 8 + 32 + 104 + 504 + 8 + 8 + 8 + 1 + 1 + 8 + 32 + 8 + 1,
        seeds = [PROPOSAL_SEED, (global_account.proposal_count + 1).to_le_bytes().as_ref()],
        bump
    )]
    pub proposal_account: Account<'info, ProposalAccount>,
    
    #[account(
        init,
        payer = author,
        seeds = [PROPOSAL_ESCROW_SEED, (global_account.proposal_count + 1).to_le_bytes().as_ref()],
        bump,
        token::mint = token_mint,
        token::authority = proposal_escrow,
    )]
    pub proposal_escrow: Account<'info, TokenAccount>,
    
    #[account(
        constraint = token_mint.key() == global_account.token_mint
    )]
    pub token_mint: Account<'info, Mint>,
    
    #[account(
        mut,
        constraint = author_token_account.mint == token_mint.key(),
        constraint = author_token_account.owner == author.key()
    )]
    pub author_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub author: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(proposal_number: u64)]
pub struct ExecuteProposal<'info> {
    #[account(
        seeds = [GLOBAL_ACCOUNT_SEED],
        bump,
    )]
    pub global_account: Account<'info, GlobalAccount>,
    
    #[account(
        mut,
        seeds = [PROPOSAL_SEED, proposal_number.to_le_bytes().as_ref()],
        bump,
        constraint = proposal_account.proposal_type == 1 @ ErrorCode::NotTreasuryProposal,
    )]
    pub proposal_account: Account<'info, ProposalAccount>,
    
    #[account(
        mut,
        seeds = [PROPOSAL_ESCROW_SEED, proposal_number.to_le_bytes().as_ref()],
        bump,
    )]
    pub proposal_escrow: Account<'info, TokenAccount>,
    
    /// CHECK: Destination token account - will be validated in instruction
    #[account(mut)]
    pub destination_token_account: Account<'info, TokenAccount>,
    
    #[account(
        constraint = token_mint.key() == global_account.token_mint
    )]
    pub token_mint: Account<'info, Mint>,
    
    #[account(mut)]
    pub executor: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(proposal_number: u64)]
pub struct ReclaimProposalFunds<'info> {
    #[account(
        seeds = [GLOBAL_ACCOUNT_SEED],
        bump,
    )]
    pub global_account: Account<'info, GlobalAccount>,
    
    #[account(
        mut,
        seeds = [PROPOSAL_SEED, proposal_number.to_le_bytes().as_ref()],
        bump,
        constraint = proposal_account.proposal_type == 1 @ ErrorCode::NotTreasuryProposal,
        constraint = proposal_account.author == author.key() @ ErrorCode::Unauthorized,
    )]
    pub proposal_account: Account<'info, ProposalAccount>,
    
    #[account(
        mut,
        seeds = [PROPOSAL_ESCROW_SEED, proposal_number.to_le_bytes().as_ref()],
        bump,
    )]
    pub proposal_escrow: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = author_token_account.mint == global_account.token_mint,
        constraint = author_token_account.owner == author.key()
    )]
    pub author_token_account: Account<'info, TokenAccount>,
    
    #[account(
        constraint = token_mint.key() == global_account.token_mint
    )]
    pub token_mint: Account<'info, Mint>,
    
    #[account(mut)]
    pub author: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

////////////////////////////////////////////////////////////////
//                   GAMIFICATION CONTEXTS
////////////////////////////////////////////////////////////////

#[derive(Accounts)]
pub struct ClaimBadge<'info> {
    #[account(
        mut,
        seeds = [USER_STATS_SEED, user.key().as_ref()],
        bump,
        constraint = user_stats.user == user.key()
    )]
    pub user_stats: Account<'info, UserStats>,

    #[account(
        init,
        payer = user,
        seeds = [BADGE_MINT_SEED, user.key().as_ref()],
        bump,
        mint::decimals = 0,
        mint::authority = user_stats,
        mint::freeze_authority = user_stats,
    )]
    pub badge_mint: Account<'info, Mint>,

    /// CHECK: Metaplex Metadata Account (Derived from badge_mint)
    #[account(mut)]
    pub metadata_account: UncheckedAccount<'info>,

    /// CHECK: Metaplex Master Edition Account
    #[account(mut)]
    pub master_edition: UncheckedAccount<'info>,

    #[account(
        init,
        payer = user,
        associated_token::mint = badge_mint,
        associated_token::authority = user
    )]
    pub user_badge_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_metadata_program: Program<'info, Metadata>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

