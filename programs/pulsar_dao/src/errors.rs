use anchor_lang::prelude::*;

////////////////////////////////////////////////////////////////
//                        ERROR CODES
////////////////////////////////////////////////////////////////

#[error_code]
pub enum ErrorCode {
    // Proposal & Voting Errors
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

    // Staking Errors
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

    // Faucet Errors
    #[msg("You must wait 24 hours between faucet requests.")]
    FaucetCooldown,

    // Delegation Errors
    #[msg("Delegate is not authorized or inactive.")]
    InvalidDelegate,
    #[msg("User has already voted directly. Proxy cannot override.")]
    DirectVoteExists,
    #[msg("Delegation loop detected.")]
    DelegationLoop,
    #[msg("Delegates cannot delegate (Chain delegation is not allowed).")]
    DelegateCannotDelegate,
    #[msg("Delegators cannot become delegates (Revoke delegation first).")]
    DelegatorCannotBeDelegate,
    #[msg("You have delegated your voting power. Revoke delegation to vote manually.")]
    DelegatorsCannotVote,
    #[msg("Vote was cast by proxy and is locked (cannot be withdrawn or changed).")]
    ProxyVoteLocked,

    // Treasury Proposal Errors
    #[msg("Proposal voting has not ended yet.")]
    ProposalNotEnded,
    #[msg("Timelock period has not passed yet.")]
    TimelockNotPassed,
    #[msg("Proposal was not approved (YES > NO required).")]
    ProposalNotPassed,
    #[msg("Proposal passed, cannot reclaim funds.")]
    ProposalPassed,
    #[msg("Proposal has already been executed.")]
    AlreadyExecuted,
    #[msg("Transfer amount must be greater than 0.")]
    InvalidAmount,
    #[msg("Target account is not a treasury proposal.")]
    NotTreasuryProposal,

    // Gamification Errors
    #[msg("Insufficient score to claim badge.")]
    InsufficientScore,
    #[msg("Badge already claimed.")]
    AlreadyClaimed,
}
