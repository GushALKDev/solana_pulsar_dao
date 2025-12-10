use anchor_lang::prelude::*;

////////////////////////////////////////////////////////////////
//                        ERROR CODES
////////////////////////////////////////////////////////////////

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
}
