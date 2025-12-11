use anchor_lang::prelude::*;

////////////////////////////////////////////////////////////////
//                     ACCOUNT STRUCTURES
////////////////////////////////////////////////////////////////

#[account]
pub struct GlobalAccount {
    pub admin: Pubkey,
    pub token_mint: Pubkey,
    pub proposal_count: u64,
    pub system_enabled: bool,
}

#[account]
pub struct ProposalAccount {
    pub number: u64,
    pub author: Pubkey,
    pub question: String,
    pub yes: u64,
    pub no: u64,
    pub deadline: i64,
    pub is_active: bool,
    // Treasury proposal fields
    pub proposal_type: u8,                // 0 = Standard, 1 = TreasuryTransfer
    pub transfer_amount: u64,             // Amount to transfer (0 if Standard)
    pub transfer_destination: Pubkey,     // Destination wallet (SystemProgram if Standard)
    pub timelock_seconds: i64,            // Seconds to wait after deadline before execution
    pub executed: bool,                   // Has been executed?
}

#[account]
pub struct VoterRecord {
    pub proposal: Pubkey,
    pub voter: Pubkey,
    pub vote: bool,
    pub voted: bool,
    pub voting_power: u64,
    pub staked_amount: u64,
    pub voted_by_proxy: bool,
}

#[account]
pub struct VoterStakeRecord {
    pub owner: Pubkey,
    pub staked_amount: u64,
    pub lock_end_time: i64,
    pub original_lock_days: i64,
    pub multiplier: u64,
}

#[account]
pub struct DelegateProfile {
    pub authority: Pubkey,
    pub is_active: bool,
}

#[account]
pub struct DelegationRecord {
    pub delegator: Pubkey,
    pub delegate_target: Pubkey,
}

#[account]
pub struct FaucetRecord {
    pub last_request_time: i64,
}

#[account]
pub struct UserStats {
    pub user: Pubkey,
    pub proposal_count: u64, // Total times voted
    pub last_vote_time: i64,
    pub score: u64,          // Points/Score for gamification
    pub badge_claimed: bool,
}

////////////////////////////////////////////////////////////////
//                          EVENTS
////////////////////////////////////////////////////////////////

#[event]
pub struct VoteCast {
    pub voter: Pubkey,
    pub proposal: Pubkey,
    pub amount: u64,
    pub lock_duration: i64,
    pub voting_power: u64,
    pub multiplier: u64,
}

#[event]
pub struct ProposalExecuted {
    pub proposal: Pubkey,
    pub executor: Pubkey,
    pub destination: Pubkey,
    pub amount: u64,
    pub success: bool,
}

#[event]
pub struct ProposalFundsReclaimed {
    pub proposal: Pubkey,
    pub author: Pubkey,
    pub amount: u64,
}

