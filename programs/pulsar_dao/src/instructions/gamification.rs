use anchor_lang::prelude::*;
use anchor_spl::token::{Token, Mint, TokenAccount, self};
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::metadata::Metadata;
use anchor_spl::metadata::{create_metadata_accounts_v3, CreateMetadataAccountsV3};
use anchor_spl::metadata::{create_master_edition_v3, CreateMasterEditionV3};
use anchor_spl::metadata::mpl_token_metadata::types::DataV2;

use crate::state::*;
use crate::error::ErrorCode;
use crate::instructions::admin::GLOBAL_ACCOUNT_SEED;
use crate::instructions::voting::USER_STATS_SEED;

pub const FAUCET_SEED: &[u8] = b"faucet";
pub const BADGE_MINT_SEED: &[u8] = b"badge";

////////////////////////////////////////////////////////////////
//                   GAMIFICATION CONTEXTS
////////////////////////////////////////////////////////////////

#[derive(Accounts)]
pub struct RequestTokens<'info> {
    #[account(
        init_if_needed,
        payer = user,
        // Space: 8 (discriminator) + 8 (last_request_time)
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

////////////////////////////////////////////////////////////////
//                   GAMIFICATION HANDLERS
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
        USER_STATS_SEED, 
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
        uri: "https://pulsar-dao.vercel.app/badge.json".to_string(),
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
