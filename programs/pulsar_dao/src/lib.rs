use anchor_lang::prelude::*;
use anchor_spl::token::{TokenAccount, Mint};

declare_id!("FMny2cz2orrWDJ59QwsHXRCL97BcLQncsNfeko7EBrJK");

const GLOBAL_ACCOUNT_SEED: &[u8] = b"global_account";
const PROPOSAL_SEED: &[u8] = b"proposal";
const VOTER_SEED: &[u8] = b"voter";

#[program]
pub mod pulsar_dao {
    use super::*;

    // Initialize the global account
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let global_account = &mut ctx.accounts.global_account;
        global_account.proposals_counter = 1;
        global_account.admin = ctx.accounts.user.key();
        global_account.vote_updates_enabled = true;
        global_account.token_mint = ctx.accounts.token_mint.key();
        Ok(())
    }

    // Create a new proposal
    pub fn create_proposal(ctx: Context<CreateProposal>, question: String, duration: i64) -> Result<()> {
        let global_account = &mut ctx.accounts.global_account;
        let proposal_account = &mut ctx.accounts.proposal_account;
        let user = &ctx.accounts.user;
    
        // Validate the question length
        if question.len() > 200 {
            return Err(ErrorCode::QuestionTooLong.into());
        }
    
        // Initialize proposal account fields
        proposal_account.number = global_account.proposals_counter;
        proposal_account.question = question;
        proposal_account.author = user.key();
        proposal_account.yes = 0;
        proposal_account.no = 0;
        
        // Calculate deadline
        let clock = Clock::get()?;
        proposal_account.deadline = clock.unix_timestamp + duration;
          
        // Increment the global proposal counter
        global_account.proposals_counter += 1;

        // Emit de Proposal created event
        emit!(ProposalCreated {
            proposal_pda: ctx.accounts.proposal_account.key(),
        });
    
        Ok(())
    }

    // Vote on a proposal (Quadratic Voting)
    pub fn vote(ctx: Context<Vote>, vote: bool) -> Result<()> {
        let global_account = &ctx.accounts.global_account;
        let proposal_account = &mut ctx.accounts.proposal_account;
        let voter_account = &mut ctx.accounts.voter_account;
        let token_account = &ctx.accounts.token_account;

        // Check if proposal is expired
        let clock = Clock::get()?;
        if clock.unix_timestamp > proposal_account.deadline {
            return Err(ErrorCode::ProposalExpired.into());
        }

        // Verify token account ownership and mint
        if token_account.mint != global_account.token_mint {
            return Err(ErrorCode::InvalidTokenMint.into());
        }
        if token_account.owner != ctx.accounts.user.key() {
            return Err(ErrorCode::InvalidTokenOwner.into());
        }

        // Calculate Voting Power (Quadratic Voting: Power = Sqrt(Balance))
        let balance = token_account.amount;
        let voting_power = integer_sqrt(balance);

        if voting_power == 0 {
            return Err(ErrorCode::NoVotingPower.into());
        }

        // Update the proposal results
        if vote {
            proposal_account.yes += voting_power;
        } else {
            proposal_account.no += voting_power;
        }

        // Update voter account fields
        voter_account.proposal = proposal_account.key();
        voter_account.voter = ctx.accounts.user.key();
        voter_account.vote = vote;
        voter_account.voted = true;
        voter_account.voting_power = voting_power;

        Ok(())
    }

    // Update vote on a proposal
    pub fn update_vote(ctx: Context<UpdateVote>, vote: bool) -> Result<()> {
        let global_account = &ctx.accounts.global_account;
        
        // Check if vote updates are enabled
        if !global_account.vote_updates_enabled {
            return Err(ErrorCode::VoteUpdatesDisabled.into());
        }

        let proposal_account = &mut ctx.accounts.proposal_account;
        let voter_account = &mut ctx.accounts.voter_account;
        let token_account = &ctx.accounts.token_account;

        // Check if proposal is expired
        let clock = Clock::get()?;
        if clock.unix_timestamp > proposal_account.deadline {
            return Err(ErrorCode::ProposalExpired.into());
        }

        // Verify token account ownership and mint
        if token_account.mint != global_account.token_mint {
            return Err(ErrorCode::InvalidTokenMint.into());
        }
        if token_account.owner != ctx.accounts.user.key() {
            return Err(ErrorCode::InvalidTokenOwner.into());
        }

        // Calculate new Voting Power
        let balance = token_account.amount;
        let new_voting_power = integer_sqrt(balance);

        if new_voting_power == 0 {
            return Err(ErrorCode::NoVotingPower.into());
        }

        // Remove old vote weight
        if voter_account.vote {
            proposal_account.yes = proposal_account.yes.checked_sub(voter_account.voting_power).unwrap_or(0);
        } else {
            proposal_account.no = proposal_account.no.checked_sub(voter_account.voting_power).unwrap_or(0);
        }

        // Add new vote weight
        if vote {
            proposal_account.yes += new_voting_power;
        } else {
            proposal_account.no += new_voting_power;
        }

        // Update voter account fields
        voter_account.vote = vote;
        voter_account.voting_power = new_voting_power;

        Ok(())
    }

    // Toggle vote updates (Admin only)
    pub fn toggle_vote_updates(ctx: Context<ToggleVoteUpdates>) -> Result<()> {
        let global_account = &mut ctx.accounts.global_account;
        
        // Check if the user is the admin
        if ctx.accounts.user.key() != global_account.admin {
            return Err(ErrorCode::Unauthorized.into());
        }

        global_account.vote_updates_enabled = !global_account.vote_updates_enabled;
        Ok(())
    }

    // Withdraw vote from a proposal
    pub fn withdraw_vote(ctx: Context<WithdrawVote>) -> Result<()> {
        let global_account = &ctx.accounts.global_account;
        
        // Check if vote updates are enabled
        if !global_account.vote_updates_enabled {
            return Err(ErrorCode::VoteUpdatesDisabled.into());
        }

        let proposal_account = &mut ctx.accounts.proposal_account;
        let voter_account = &ctx.accounts.voter_account;

        // Check if proposal is expired
        let clock = Clock::get()?;
        if clock.unix_timestamp > proposal_account.deadline {
            return Err(ErrorCode::ProposalExpired.into());
        }

        // Decrease the vote count based on the voter's previous vote and power
        if voter_account.vote {
            proposal_account.yes = proposal_account.yes.checked_sub(voter_account.voting_power).unwrap_or(0);
        } else {
            proposal_account.no = proposal_account.no.checked_sub(voter_account.voting_power).unwrap_or(0);
        }

        // The voter account will be closed automatically by Anchor
        // and the rent will be returned to the user
        Ok(())
    }
}

// Helper function for integer square root
fn integer_sqrt(n: u64) -> u64 {
    if n < 2 {
        return n;
    }
    let mut x = n / 2;
    let mut y = (x + n / x) / 2;
    while y < x {
        x = y;
        y = (x + n / x) / 2;
    }
    x
}

// Context for initializing the global account
#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init, 
        payer = user, 
        // 8 (discriminator) + 8 (proposals_counter) + 32 (admin) + 1 (vote_updates_enabled) + 32 (token_mint) + 1 (bump)
        space = 8 + 8 + 32 + 1 + 32 + 1, 
        seeds = [GLOBAL_ACCOUNT_SEED], 
        bump
    )]
    pub global_account: Account<'info, GlobalAccount>,
    pub token_mint: Account<'info, Mint>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// Context for creating a proposal
#[derive(Accounts)]
pub struct CreateProposal<'info> {
    #[account(mut)]
    pub global_account: Account<'info, GlobalAccount>,
    #[account(
        init, 
        payer = user, 
        // 8 (discriminator) + 8 (number) + (4 + 200) (question) + 32 (author) + 8 (yes) + 8 (no) + 8 (deadline) + 1 (bump)
        space = 8 + 8 + (4 + 200) + 32 + 8 + 8 + 8 + 1, 
        seeds = [PROPOSAL_SEED, &global_account.proposals_counter.to_le_bytes()], 
        bump
    )]
    pub proposal_account: Account<'info, ProposalAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// Context for voting on a proposal
#[derive(Accounts)]
pub struct Vote<'info> {
    #[account(mut)]
    pub global_account: Account<'info, GlobalAccount>,
    #[account(mut)]
    pub proposal_account: Account<'info, ProposalAccount>,
    #[account(
        init, 
        payer = user, 
        // 8 (discriminator) + 32 (proposal) + 32 (voter) + 1 (vote) + 1 (voted) + 8 (voting_power) + 1 (bump)
        space = 8 + 32 + 32 + 1 + 1 + 8 + 1, 
        seeds = [VOTER_SEED, proposal_account.key().as_ref(), user.key().as_ref()], 
        bump
    )]
    pub voter_account: Account<'info, VoterAccount>,
    pub token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// Context for updating a vote
#[derive(Accounts)]
pub struct UpdateVote<'info> {
    #[account(mut)]
    pub global_account: Account<'info, GlobalAccount>,
    #[account(mut)]
    pub proposal_account: Account<'info, ProposalAccount>,
    #[account(
        mut,
        seeds = [VOTER_SEED, proposal_account.key().as_ref(), user.key().as_ref()], 
        bump
    )]
    pub voter_account: Account<'info, VoterAccount>,
    pub token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
}

// Context for toggling vote updates
#[derive(Accounts)]
pub struct ToggleVoteUpdates<'info> {
    #[account(mut)]
    pub global_account: Account<'info, GlobalAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
}

// Context for withdrawing a vote
#[derive(Accounts)]
pub struct WithdrawVote<'info> {
    #[account(mut)]
    pub global_account: Account<'info, GlobalAccount>,
    #[account(mut)]
    pub proposal_account: Account<'info, ProposalAccount>,
    #[account(
        mut,
        close = user,
        seeds = [VOTER_SEED, proposal_account.key().as_ref(), user.key().as_ref()], 
        bump
    )]
    pub voter_account: Account<'info, VoterAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
}

// Proposal account structure
#[account]
pub struct ProposalAccount {
    pub number: u64,      // Unique proposal number
    pub question: String, // Proposal question
    pub author: Pubkey,   // Author of the proposal
    pub yes: u64,         // Weighted Count of "yes" votes
    pub no: u64,          // Weighted Count of "no" votes
    pub deadline: i64,    // Unix timestamp for when the proposal closes
}

// Voter account structure
#[account]
pub struct VoterAccount {
    pub proposal: Pubkey,  // Associated proposal PDA
    pub voter: Pubkey, // Voter's public key
    pub vote: bool,    // `true` for "yes", `false` for "no"
    pub voted: bool,   // Whether the voter has already voted
    pub voting_power: u64, // The voting power used for this vote
}

// Global account structure
#[account]
pub struct GlobalAccount {
    pub proposals_counter: u64, // Counter for proposals
    pub admin: Pubkey,      // Admin public key
    pub vote_updates_enabled: bool, // Global flag to enable/disable vote updates
    pub token_mint: Pubkey, // The token mint used for voting
}

#[event]
pub struct ProposalCreated {
    pub proposal_pda: Pubkey,
}

// Error codes
#[error_code]
pub enum ErrorCode {
    #[msg("User already voted on this proposal.")]
    AlreadyVoted,
    #[msg("The question exceeds the maximum length of 200 characters.")]
    QuestionTooLong,
    #[msg("The proposal has expired.")]
    ProposalExpired,
    #[msg("Vote updates are disabled.")]
    VoteUpdatesDisabled,
    #[msg("Unauthorized.")]
    Unauthorized,
    #[msg("Invalid Token Mint.")]
    InvalidTokenMint,
    #[msg("Invalid Token Owner.")]
    InvalidTokenOwner,
    #[msg("No Voting Power (Balance is 0).")]
    NoVotingPower,
}
