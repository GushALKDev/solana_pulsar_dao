use anchor_lang::prelude::*;
use crate::state::*;
use crate::error::ErrorCode;
use crate::instructions::admin::GLOBAL_ACCOUNT_SEED;

pub const DELEGATE_PROFILE_SEED: &[u8] = b"delegate_profile";
pub const DELEGATION_RECORD_SEED: &[u8] = b"delegation_record";

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
        // Space: 8 (discriminator) + 32 (authority) + 1 (is_active)
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
        // Space: 8 (discriminator) + 32 (delegator) + 32 (delegate_target)
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
//                    DELEGATION HANDLERS
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
