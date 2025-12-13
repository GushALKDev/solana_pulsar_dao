use anchor_lang::prelude::*;
use anchor_spl::token::{Token, Mint, TokenAccount};
use crate::state::*;
use crate::error::ErrorCode;
use crate::instructions::admin::GLOBAL_ACCOUNT_SEED;

pub const PROPOSAL_SEED: &[u8] = b"proposal";
pub const PROPOSAL_ESCROW_SEED: &[u8] = b"proposal_escrow";

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

////////////////////////////////////////////////////////////////
//                     PROPOSAL HANDLERS
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
    anchor_spl::token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token::Transfer {
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
