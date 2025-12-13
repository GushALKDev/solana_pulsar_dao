use anchor_lang::prelude::*;
use anchor_spl::token::{Token, Mint, TokenAccount, self};
use crate::state::*;
use crate::error::ErrorCode;

pub const GLOBAL_ACCOUNT_SEED: &[u8] = b"global_account";

////////////////////////////////////////////////////////////////
//                       ADMIN CONTEXTS
////////////////////////////////////////////////////////////////

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = user,
        // Space: 8 (discriminator) + 32 (admin) + 32 (token_mint) + 8 (proposal_count) + 1 (system_enabled)
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
//                       ADMIN HANDLERS
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
