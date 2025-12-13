use anchor_lang::prelude::*;
use anchor_spl::token::{Token, Mint, TokenAccount};
use crate::state::*;
use crate::error::ErrorCode;
use crate::instructions::admin::GLOBAL_ACCOUNT_SEED;
use crate::instructions::proposal::{PROPOSAL_SEED, PROPOSAL_ESCROW_SEED};

////////////////////////////////////////////////////////////////
//                     TREASURY CONTEXTS
////////////////////////////////////////////////////////////////

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
//                     TREASURY HANDLERS
////////////////////////////////////////////////////////////////

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
        PROPOSAL_ESCROW_SEED,
        proposal_number_bytes.as_ref(),
        &[ctx.bumps.proposal_escrow],
    ];
    let signer_seeds = &[&seeds[..]];

    anchor_spl::token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token::Transfer {
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
        PROPOSAL_ESCROW_SEED,
        proposal_number_bytes.as_ref(),
        &[ctx.bumps.proposal_escrow],
    ];
    let signer_seeds = &[&seeds[..]];

    anchor_spl::token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token::Transfer {
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
