import { expect } from "chai";
import * as anchor from "@coral-xyz/anchor";
import { BN } from "bn.js";

describe("vote_updates", () => {
  /* Configure the client */
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.VotingApp;

  const owner = (program.provider as anchor.AnchorProvider).wallet; // Admin
  const voter = anchor.web3.Keypair.generate(); // Voter
  const nonAdmin = anchor.web3.Keypair.generate(); // Non-admin user

  let globalPDAAddress;
  let pollPDAAddress;
  let voterPDAAddress;

  before("Setup", async () => {
    // Airdrop to voter and nonAdmin
    await provider.connection.requestAirdrop(voter.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(nonAdmin.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);

    [globalPDAAddress] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("global_account")],
      program.programId
    );

    // Initialize Global Account if needed
    try {
      await program.account.globalAccount.fetch(globalPDAAddress);
      console.log("Global state already exists");
    } catch (e) {
      console.log("Initializing Global State");
      await program.methods
        .initialize()
        .accounts({
          user: owner.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    }
  });

  it("Creates a poll for testing updates", async () => {
    const globalPDA = await program.account.globalAccount.fetch(globalPDAAddress);
    const pollNumber = globalPDA.pollsCounter;

    await program.methods
      .createPoll("Can I change my vote?", new BN(60 * 60)) // 1 hour
      .accounts({
        globalAccount: globalPDAAddress,
        user: owner.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    [pollPDAAddress] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("poll"), Buffer.from(pollNumber.toArray("le", 8))],
      program.programId
    );
  });

  it("Voter votes YES initially", async () => {
    [voterPDAAddress] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("voter"), pollPDAAddress.toBuffer(), voter.publicKey.toBuffer()],
      program.programId
    );

    await program.methods
      .vote(true) // Yes
      .accounts({
        pollAccount: pollPDAAddress,
        voterAccount: voterPDAAddress,
        user: voter.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([voter])
      .rpc();

    const pollAccount = await program.account.pollAccount.fetch(pollPDAAddress);
    const voterAccount = await program.account.voterAccount.fetch(voterPDAAddress);

    expect(Number(pollAccount.yes)).to.eq(1);
    expect(Number(pollAccount.no)).to.eq(0);
    expect(voterAccount.vote).to.be.true;
  });

  it("Voter changes vote to NO", async () => {
    await program.methods
      .updateVote(false) // No
      .accounts({
        globalAccount: globalPDAAddress,
        pollAccount: pollPDAAddress,
        voterAccount: voterPDAAddress,
        user: voter.publicKey,
      })
      .signers([voter])
      .rpc();

    const pollAccount = await program.account.pollAccount.fetch(pollPDAAddress);
    const voterAccount = await program.account.voterAccount.fetch(voterPDAAddress);

    expect(Number(pollAccount.yes)).to.eq(0);
    expect(Number(pollAccount.no)).to.eq(1);
    expect(voterAccount.vote).to.be.false;
  });

  it("Admin disables vote updates", async () => {
    await program.methods
      .toggleVoteUpdates()
      .accounts({
        globalAccount: globalPDAAddress,
        user: owner.publicKey,
      })
      .rpc();

    const globalAccount = await program.account.globalAccount.fetch(globalPDAAddress);
    expect(globalAccount.voteUpdatesEnabled).to.be.false;
  });

  it("Voter fails to change vote when updates are disabled", async () => {
    try {
      await program.methods
        .updateVote(true) // Try to change back to Yes
        .accounts({
          globalAccount: globalPDAAddress,
          pollAccount: pollPDAAddress,
          voterAccount: voterPDAAddress,
          user: voter.publicKey,
        })
        .signers([voter])
        .rpc();
      expect.fail("Should have failed");
    } catch (error: any) {
      expect(error.message).to.contain("VoteUpdatesDisabled");
    }
  });

  it("Non-admin fails to toggle vote updates", async () => {
    try {
      await program.methods
        .toggleVoteUpdates()
        .accounts({
          globalAccount: globalPDAAddress,
          user: nonAdmin.publicKey,
        })
        .signers([nonAdmin])
        .rpc();
      expect.fail("Should have failed");
    } catch (error: any) {
      expect(error.message).to.contain("Unauthorized");
    }
  });

  it("Admin enables vote updates again", async () => {
    await program.methods
      .toggleVoteUpdates()
      .accounts({
        globalAccount: globalPDAAddress,
        user: owner.publicKey,
      })
      .rpc();

    const globalAccount = await program.account.globalAccount.fetch(globalPDAAddress);
    expect(globalAccount.voteUpdatesEnabled).to.be.true;
  });

  it("Voter can change vote again", async () => {
    await program.methods
      .updateVote(true) // Change back to Yes
      .accounts({
        globalAccount: globalPDAAddress,
        pollAccount: pollPDAAddress,
        voterAccount: voterPDAAddress,
        user: voter.publicKey,
      })
      .signers([voter])
      .rpc();

    const pollAccount = await program.account.pollAccount.fetch(pollPDAAddress);
    expect(Number(pollAccount.yes)).to.eq(1);
    expect(Number(pollAccount.no)).to.eq(0);
  });
});
