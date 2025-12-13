#![allow(deprecated)]

use anchor_lang::prelude::*;

pub mod error;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("EE1i9YyUyjEKxXNzRaup86EkCDyd1bt21e1ecF7rgN9R");

#[program]
pub mod pulsar_dao {
    use super::*;

    // admin
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        instructions::admin::initialize(ctx)
    }

    pub fn toggle_circuit_breaker(ctx: Context<ToggleCircuitBreaker>) -> Result<()> {
        instructions::admin::toggle_circuit_breaker(ctx)
    }

    pub fn admin_mint(ctx: Context<AdminMint>, amount: u64) -> Result<()> {
        instructions::admin::admin_mint(ctx, amount)
    }

    // staking
    pub fn initialize_stake(ctx: Context<InitializeStake>) -> Result<()> {
        instructions::staking::initialize_stake(ctx)
    }

    pub fn deposit_tokens(ctx: Context<DepositTokens>, amount: u64, lock_days: i64) -> Result<()> {
        instructions::staking::deposit_tokens(ctx, amount, lock_days)
    }

    pub fn unstake_tokens(ctx: Context<UnstakeTokens>) -> Result<()> {
        instructions::staking::unstake_tokens(ctx)
    }

    // proposal
    pub fn create_proposal(
        ctx: Context<CreateProposal>, 
        title: String, 
        description: String, 
        deadline: i64
    ) -> Result<()> {
        instructions::proposal::create_proposal(ctx, title, description, deadline)
    }

    pub fn create_treasury_proposal(
        ctx: Context<CreateTreasuryProposal>,
        title: String,
        description: String,
        deadline: i64,
        transfer_amount: u64,
        transfer_destination: Pubkey,
        timelock_seconds: i64,
    ) -> Result<()> {
        instructions::proposal::create_treasury_proposal(
            ctx, 
            title, 
            description, 
            deadline, 
            transfer_amount, 
            transfer_destination, 
            timelock_seconds
        )
    }

    // voting
    pub fn vote(ctx: Context<VoteProposal>, vote_yes: bool) -> Result<()> {
        instructions::voting::vote(ctx, vote_yes)
    }

    pub fn withdraw_vote(ctx: Context<WithdrawVote>) -> Result<()> {
        instructions::voting::withdraw_vote(ctx)
    }

    pub fn vote_as_proxy(ctx: Context<VoteAsProxy>, vote_yes: bool) -> Result<()> {
        instructions::voting::vote_as_proxy(ctx, vote_yes)
    }

    pub fn withdraw_as_proxy(ctx: Context<WithdrawAsProxy>) -> Result<()> {
        instructions::voting::withdraw_as_proxy(ctx)
    }

    // treasury execution
    pub fn execute_proposal(ctx: Context<ExecuteProposal>, proposal_number: u64) -> Result<()> {
        instructions::treasury::execute_proposal(ctx, proposal_number)
    }

    pub fn reclaim_proposal_funds(ctx: Context<ReclaimProposalFunds>, proposal_number: u64) -> Result<()> {
        instructions::treasury::reclaim_proposal_funds(ctx, proposal_number)
    }

    // delegation
    pub fn register_delegate(ctx: Context<RegisterDelegate>) -> Result<()> {
        instructions::delegation::register_delegate(ctx)
    }

    pub fn delegate_vote(ctx: Context<DelegateVote>) -> Result<()> {
        instructions::delegation::delegate_vote(ctx)
    }

    pub fn revoke_delegation(ctx: Context<RevokeDelegation>) -> Result<()> {
        instructions::delegation::revoke_delegation(ctx)
    }

    pub fn remove_delegate(ctx: Context<RemoveDelegate>) -> Result<()> {
        instructions::delegation::remove_delegate(ctx)
    }

    // gamification / faucet
    pub fn request_tokens(ctx: Context<RequestTokens>) -> Result<()> {
        instructions::gamification::request_tokens(ctx)
    }

    pub fn claim_badge(ctx: Context<ClaimBadge>) -> Result<()> {
        instructions::gamification::claim_badge(ctx)
    }
}
