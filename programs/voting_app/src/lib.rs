use anchor_lang::prelude::*;

declare_id!("4LUhz8RvrWVm9YtVepsaGYEF6tdZofUjBY7hicBd5Xw4");

const GLOBAL_ACCOUNT_SEED: &[u8] = b"global_account";
const POLL_SEED: &[u8] = b"poll";
const VOTER_SEED: &[u8] = b"voter";

#[program]
pub mod voting_app {
    use super::*;

    // Initialize the global account
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let global_account = &mut ctx.accounts.global_account;
        global_account.polls_counter = 1;
        global_account.admin = ctx.accounts.user.key();
        global_account.vote_updates_enabled = true;
        Ok(())
    }

    // Create a new poll
    pub fn create_poll(ctx: Context<CreatePoll>, question: String, duration: i64) -> Result<()> {
        let global_account = &mut ctx.accounts.global_account;
        let poll_account = &mut ctx.accounts.poll_account;
        let user = &ctx.accounts.user;
    
        // Validate the question length
        if question.len() > 200 {
            return Err(ErrorCode::QuestionTooLong.into());
        }
    
        // Initialize poll account fields
        poll_account.number = global_account.polls_counter;
        poll_account.question = question;
        poll_account.author = user.key();
        poll_account.yes = 0;
        poll_account.no = 0;
        
        // Calculate deadline
        let clock = Clock::get()?;
        poll_account.deadline = clock.unix_timestamp + duration;
          
        // Increment the global poll counter
        global_account.polls_counter += 1;

        // Emit de Poll created event
        emit!(PollCreated {
            poll_pda: ctx.accounts.poll_account.key(),
        });
    
        Ok(())
    }

    // Vote on a poll
    pub fn vote(ctx: Context<Vote>, vote: bool) -> Result<()> {
        let poll_account = &mut ctx.accounts.poll_account;
        let voter_account = &mut ctx.accounts.voter_account;

        // Check if poll is expired
        let clock = Clock::get()?;
        if clock.unix_timestamp > poll_account.deadline {
            return Err(ErrorCode::PollExpired.into());
        }

        // If the user already voted in this poll, the program
        // will thrown an "account Address already in use" error

        // Update the poll results
        if vote {
            poll_account.yes += 1;
        } else {
            poll_account.no += 1;
        }

        // Update voter account fields
        voter_account.poll = poll_account.key();
        voter_account.voter = ctx.accounts.user.key();
        voter_account.vote = vote;
        voter_account.voted = true;

        Ok(())
    }

    // Update vote on a poll
    pub fn update_vote(ctx: Context<UpdateVote>, vote: bool) -> Result<()> {
        let global_account = &ctx.accounts.global_account;
        
        // Check if vote updates are enabled
        if !global_account.vote_updates_enabled {
            return Err(ErrorCode::VoteUpdatesDisabled.into());
        }

        let poll_account = &mut ctx.accounts.poll_account;
        let voter_account = &mut ctx.accounts.voter_account;

        // Check if poll is expired
        let clock = Clock::get()?;
        if clock.unix_timestamp > poll_account.deadline {
            return Err(ErrorCode::PollExpired.into());
        }

        // Check if the new vote is different from the old vote
        if voter_account.vote == vote {
            return Ok(());
        }

        // Update the poll results
        if vote {
            poll_account.yes += 1;
            poll_account.no -= 1;
        } else {
            poll_account.yes -= 1;
            poll_account.no += 1;
        }

        // Update voter account fields
        voter_account.vote = vote;

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
}

// Context for initializing the global account
#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init, 
        payer = user, 
        // 8 (discriminator) + 8 (polls_counter) + 32 (admin) + 1 (vote_updates_enabled) + 1 (bump)
        space = 8 + 8 + 32 + 1 + 1, 
        seeds = [GLOBAL_ACCOUNT_SEED], 
        bump
    )]
    pub global_account: Account<'info, GlobalAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// Context for creating a poll
#[derive(Accounts)]
pub struct CreatePoll<'info> {
    #[account(mut)]
    pub global_account: Account<'info, GlobalAccount>,
    #[account(
        init, 
        payer = user, 
        // 8 (discriminator) + 8 (number) + (4 + 200) (question) + 32 (author) + 8 (yes) + 8 (no) + 8 (deadline) + 1 (bump)
        space = 8 + 8 + (4 + 200) + 32 + 8 + 8 + 8 + 1, 
        seeds = [POLL_SEED, &global_account.polls_counter.to_le_bytes()], 
        bump
    )]
    pub poll_account: Account<'info, PollAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// Context for voting on a poll
#[derive(Accounts)]
pub struct Vote<'info> {
    #[account(mut)]
    pub poll_account: Account<'info, PollAccount>,
    #[account(
        init, 
        payer = user, 
        // 8 (discriminator) + 32 (poll) + 32 (voter) + 1 (vote) + 1 (bump)
        space = 8 + 32 + 32 + 1 + 1, 
        seeds = [VOTER_SEED, poll_account.key().as_ref(), user.key().as_ref()], 
        bump
    )]
    pub voter_account: Account<'info, VoterAccount>,
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
    pub poll_account: Account<'info, PollAccount>,
    #[account(
        mut,
        seeds = [VOTER_SEED, poll_account.key().as_ref(), user.key().as_ref()], 
        bump
    )]
    pub voter_account: Account<'info, VoterAccount>,
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

// Poll account structure
#[account]
pub struct PollAccount {
    pub number: u64,      // Unique poll number
    pub question: String, // Poll question
    pub author: Pubkey,   // Author of the poll
    pub yes: u64,         // Count of "yes" votes
    pub no: u64,          // Count of "no" votes
    pub deadline: i64,    // Unix timestamp for when the poll closes
}

// Voter account structure
#[account]
pub struct VoterAccount {
    pub poll: Pubkey,  // Associated poll PDA
    pub voter: Pubkey, // Voter's public key
    pub vote: bool,    // `true` for "yes", `false` for "no"
    pub voted: bool,   // Whether the voter has already voted
}

// Global account structure
#[account]
pub struct GlobalAccount {
    pub polls_counter: u64, // Counter for polls
    pub admin: Pubkey,      // Admin public key
    pub vote_updates_enabled: bool, // Global flag to enable/disable vote updates
}

#[event]
pub struct PollCreated {
    pub poll_pda: Pubkey,
}

// Error codes
#[error_code]
pub enum ErrorCode {
    #[msg("User already voted on this poll.")]
    AlreadyVoted,
    #[msg("The question exceeds the maximum length of 200 characters.")]
    QuestionTooLong,
    #[msg("The poll has expired.")]
    PollExpired,
    #[msg("Vote updates are disabled.")]
    VoteUpdatesDisabled,
    #[msg("Unauthorized.")]
    Unauthorized,
}
