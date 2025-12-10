import { expect } from "chai";
import * as anchor from "@coral-xyz/anchor";
import { BN } from "bn.js";
import { 
  createMint, 
  getOrCreateAssociatedTokenAccount, 
  mintTo, 
  TOKEN_PROGRAM_ID 
} from "@solana/spl-token";

describe("Pulsar DAO Comprehensive Test Suite", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.PulsarDao;
  const owner = (program.provider as anchor.AnchorProvider).wallet;
  
  // Test Users
  const user1 = anchor.web3.Keypair.generate();
  const user2 = anchor.web3.Keypair.generate(); // For breaker tests

  let mint: anchor.web3.PublicKey;
  let user1ATA: anchor.web3.PublicKey;
  let user2ATA: anchor.web3.PublicKey;
  
  let globalPDAAddress: anchor.web3.PublicKey;
  let vaultPDAAddress: anchor.web3.PublicKey;
  let stakeRecordPDA: anchor.web3.PublicKey;
  let proposalPDAAddress: anchor.web3.PublicKey;

  let proposalId: number;

  before("Setup Environment", async () => {
    // 1. Global PDA
    [globalPDAAddress] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("global_account_v3")],
      program.programId
    );

    // 2. Fund Wallets
    const fund = async (pk) => {
        try {
            const tx = new anchor.web3.Transaction().add(
                anchor.web3.SystemProgram.transfer({
                    fromPubkey: provider.wallet.publicKey,
                    toPubkey: pk,
                    lamports: 1 * anchor.web3.LAMPORTS_PER_SOL,
                })
            );
            await provider.sendAndConfirm(tx);
        } catch(e) { console.warn("Funding error", e); }
    };
    await fund(user1.publicKey);
    await fund(user2.publicKey);

    // 3. Create Mint
    mint = await createMint(
        provider.connection,
        (owner as any).payer,
        owner.publicKey,
        null,
        0
    );
    
    // 4. Vault PDA
    [vaultPDAAddress] = await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("vault"), mint.toBuffer()],
        program.programId
    );

    // 5. Mint Tokens to Users
    // User 1: 150 Tokens (100 Stake, 50 Liquid)
    user1ATA = (await getOrCreateAssociatedTokenAccount(provider.connection, (owner as any).payer, mint, user1.publicKey)).address;
    await mintTo(provider.connection, (owner as any).payer, mint, user1ATA, owner.publicKey, 150);

    // User 2: 10 Tokens (Liquid only)
    user2ATA = (await getOrCreateAssociatedTokenAccount(provider.connection, (owner as any).payer, mint, user2.publicKey)).address;
    await mintTo(provider.connection, (owner as any).payer, mint, user2ATA, owner.publicKey, 10);
  });

  // =========================================================================
  // GLOBAL STATE
  // =========================================================================

  it("Initializes Global State", async () => {
    try {
      await program.account.globalAccount.fetch(globalPDAAddress);
    } catch (e) {
      await program.methods
        .initialize()
        .accounts({
          user: owner.publicKey,
          tokenMint: mint,
          vault: vaultPDAAddress,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .rpc();
    }
    const state = await program.account.globalAccount.fetch(globalPDAAddress);
    expect(state.systemEnabled).to.be.true;
  });

  // =========================================================================
  // STAKING LOGIC
  // =========================================================================

  it("User 1 Initializes Staking Account", async () => {
      [stakeRecordPDA] = await anchor.web3.PublicKey.findProgramAddress(
          [Buffer.from("stake_record"), user1.publicKey.toBuffer()],
          program.programId
      );

      await program.methods
        .initializeStake()
        .accounts({
            stakeRecord: stakeRecordPDA,
            user: user1.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([user1])
        .rpc();
        
      const account = await program.account.voterStakeRecord.fetch(stakeRecordPDA);
      expect(account.stakedAmount.toNumber()).to.eq(0);
      expect(account.owner.toString()).to.eq(user1.publicKey.toString());
  });

  it("User 1 Deposits 100 Tokens for 30 days (2x Multiplier)", async () => {
      const amount = new BN(100);
      const lockDays = new BN(30);

      await program.methods
        .depositTokens(amount, lockDays)
        .accounts({
            globalAccount: globalPDAAddress,
            stakeRecord: stakeRecordPDA,
            vault: vaultPDAAddress,
            tokenMint: mint,
            userTokenAccount: user1ATA,
            user: user1.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: anchor.web3.SystemProgram.programId,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([user1])
        .rpc();

      const account = await program.account.voterStakeRecord.fetch(stakeRecordPDA);
      expect(account.stakedAmount.toNumber()).to.eq(100);
      expect(account.multiplier.toNumber()).to.eq(2); // 1 + 30/30
  });

  it("User 1 Fails to Unstake (Tokens Locked)", async () => {
      try {
          await program.methods.unstakeTokens()
            .accounts({
                stakeRecord: stakeRecordPDA,
                vault: vaultPDAAddress,
                tokenMint: mint,
                userTokenAccount: user1ATA,
                user: user1.publicKey,
                tokenProgram: TOKEN_PROGRAM_ID,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .signers([user1])
            .rpc();
          expect.fail("Should have failed with TokensLocked");
      } catch(e) {
          expect(e.message).to.include("Tokens are still locked");
      }
  });

  // =========================================================================
  // PROPOSALS & VOTING
  // =========================================================================

  it("User 1 Creates Proposal", async () => {
      const globalAccount = await program.account.globalAccount.fetch(globalPDAAddress);
      proposalId = globalAccount.proposalCount.toNumber() + 1;

      const buffer = Buffer.alloc(8);
      buffer.writeBigUInt64LE(BigInt(proposalId));

      [proposalPDAAddress] = await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("proposal"), buffer],
        program.programId
      );

      const now = Math.floor(Date.now() / 1000);
      const deadline = new BN(now + 3600); // 1 hour

      await program.methods
        .createProposal("Test Suite Proposal", deadline)
        .accounts({
            globalAccount: globalPDAAddress,
            proposalAccount: proposalPDAAddress,
            author: user1.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([user1])
        .rpc();
  });

  it("User 1 Votes YES (Hybrid Calculation)", async () => {
      const [voterRecordPDA] = await anchor.web3.PublicKey.findProgramAddress(
          [Buffer.from("voter"), proposalPDAAddress.toBuffer(), user1.publicKey.toBuffer()],
          program.programId
      );

      await program.methods
        .vote(true)
        .accounts({
            globalAccount: globalPDAAddress,
            proposalAccount: proposalPDAAddress,
            voterRecord: voterRecordPDA,
            stakeRecord: stakeRecordPDA,
            userTokenAccount: user1ATA,
            user: user1.publicKey,
        })
        .signers([user1])
        .rpc();

      const proposal = await program.account.proposalAccount.fetch(proposalPDAAddress);
      
      // Expected:
      // Liquid: Sqrt(50) = 7
      // Staked: Sqrt(100) * 2 = 20
      // Total: 27
      expect(proposal.yes.toNumber()).to.eq(27);
  });

  it("User 1 Cannot Vote YES again (AlreadyVoted)", async () => {
      const [voterRecordPDA] = await anchor.web3.PublicKey.findProgramAddress(
          [Buffer.from("voter"), proposalPDAAddress.toBuffer(), user1.publicKey.toBuffer()],
          program.programId
      );

      try {
        await program.methods.vote(true)
            .accounts({
                globalAccount: globalPDAAddress,
                proposalAccount: proposalPDAAddress,
                voterRecord: voterRecordPDA,
                stakeRecord: stakeRecordPDA,
                userTokenAccount: user1ATA,
                user: user1.publicKey,
            })
            .signers([user1])
            .rpc();
        expect.fail("Should have failed");
      } catch(e) {
        expect(e.message).to.include("You have already voted");
      }
  });

  it("User 1 Switches Vote from YES to NO", async () => {
      const [voterRecordPDA] = await anchor.web3.PublicKey.findProgramAddress(
          [Buffer.from("voter"), proposalPDAAddress.toBuffer(), user1.publicKey.toBuffer()],
          program.programId
      );

      await program.methods.vote(false)
        .accounts({
            globalAccount: globalPDAAddress,
            proposalAccount: proposalPDAAddress,
            voterRecord: voterRecordPDA,
            stakeRecord: stakeRecordPDA,
            userTokenAccount: user1ATA,
            user: user1.publicKey,
        })
        .signers([user1])
        .rpc();

      const proposal = await program.account.proposalAccount.fetch(proposalPDAAddress);
      expect(proposal.yes.toNumber()).to.eq(0);
      expect(proposal.no.toNumber()).to.eq(27);
  });

  it("User 1 Withdraws Vote", async () => {
    const [voterRecordPDA] = await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("voter"), proposalPDAAddress.toBuffer(), user1.publicKey.toBuffer()],
        program.programId
    );

    await program.methods
      .withdrawVote()
      .accounts({
          globalAccount: globalPDAAddress,
          proposalAccount: proposalPDAAddress,
          voterRecord: voterRecordPDA,
          user: user1.publicKey,
      })
      .signers([user1])
      .rpc();

    const proposal = await program.account.proposalAccount.fetch(proposalPDAAddress);
    expect(proposal.no.toNumber()).to.eq(0);
  });

  // =========================================================================
  // CIRCUIT BREAKER
  // =========================================================================

  it("Admin toggles Circuit Breaker OFF", async () => {
      await program.methods.toggleCircuitBreaker()
        .accounts({
            globalAccount: globalPDAAddress,
            user: owner.publicKey
        })
        .rpc(); // Owner is admin
        
      const state = await program.account.globalAccount.fetch(globalPDAAddress);
      expect(state.systemEnabled).to.be.false;
  });

  it("User 2 Cannot Vote when System Disabled", async () => {
    // User 2 setup
    const [voterRecordPDA] = await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("voter"), proposalPDAAddress.toBuffer(), user2.publicKey.toBuffer()],
        program.programId
    );
    // User 2 has no stake record
    
    try {
        await program.methods.vote(true)
            .accounts({
                globalAccount: globalPDAAddress,
                proposalAccount: proposalPDAAddress,
                voterRecord: voterRecordPDA,
                stakeRecord: null, // No stake
                userTokenAccount: user2ATA,
                user: user2.publicKey,
            })
            .signers([user2])
            .rpc();
        expect.fail("Should have failed due to CB");
    } catch(e) {
        expect(e.message).to.include("System is OFFLINE");
    }
  });

  it("Admin restores System", async () => {
      await program.methods.toggleCircuitBreaker()
        .accounts({
            globalAccount: globalPDAAddress,
            user: owner.publicKey
        })
        .rpc();
        
      const state = await program.account.globalAccount.fetch(globalPDAAddress);
      expect(state.systemEnabled).to.be.true;
  });

});
