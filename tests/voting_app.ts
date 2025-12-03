import { expect } from "chai";
import * as anchor from "@coral-xyz/anchor";
import { BN } from "bn.js";
const { SystemProgram } = anchor.web3;

describe("voting_app", () => {
  /* Configure the client */
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.VotingApp;

  let network: string;
  if (provider.connection.rpcEndpoint === "http://127.0.0.1:8899") network = "localhost";
  else if (provider.connection.rpcEndpoint === "https://api.devnet.solana.com") network = "devnet";

  const owner = (program.provider as anchor.AnchorProvider).wallet; // Owner
  const wallet1 = anchor.web3.Keypair.generate(); // Voter 
  const wallet2 = anchor.web3.Keypair.generate(); // Voter 2
  const wallet3 = anchor.web3.Keypair.generate(); // Voter 3
  const wallet4 = anchor.web3.Keypair.generate(); // Voter 4
  const wallet5 = anchor.web3.Keypair.generate(); // Voter 5

  console.log("Owner Address:", owner.publicKey.toString());
  console.log("Player 1 Address:",  wallet1.publicKey.toString());
  console.log("Player 2 Address:",  wallet2.publicKey.toString());
  console.log("Player 3 Address:",  wallet3.publicKey.toString());
  console.log("Player 4 Address:",  wallet4.publicKey.toString());
  console.log("Player 5 Address:",  wallet5.publicKey.toString());

  let globalPDAAddress;

  before("Before", async () => {
    [globalPDAAddress] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("global_account")],
      program.programId
    );

    if (network === "localhost") {
      console.log("Funding players accounts...");
      await provider.connection.requestAirdrop(wallet1.publicKey, 200 * anchor.web3.LAMPORTS_PER_SOL); // Airdrop some SOL
      console.log(`Solana account ${wallet1.publicKey.toString()} was airdropped with 200 SOL.`);
      await provider.connection.requestAirdrop(wallet2.publicKey, 200 * anchor.web3.LAMPORTS_PER_SOL); // Airdrop some SOL
      console.log(`Solana account ${wallet2.publicKey.toString()} was airdropped with 200 SOL.`);
      await provider.connection.requestAirdrop(wallet3.publicKey, 200 * anchor.web3.LAMPORTS_PER_SOL); // Airdrop some SOL
      console.log(`Solana account ${wallet3.publicKey.toString()} was airdropped with 200 SOL.`);
      await provider.connection.requestAirdrop(wallet4.publicKey, 200 * anchor.web3.LAMPORTS_PER_SOL); // Airdrop some SOL
      console.log(`Solana account ${wallet4.publicKey.toString()} was airdropped with 200 SOL.`);
      await provider.connection.requestAirdrop(wallet5.publicKey, 200 * anchor.web3.LAMPORTS_PER_SOL); // Airdrop some SOL
      console.log(`Solana account ${wallet5.publicKey.toString()} was airdropped with 200 SOL.`);
    }
    if (network === "e") {
      console.log("Funding players accounts...");
      await provider.connection.requestAirdrop(wallet1.publicKey, 5 * anchor.web3.LAMPORTS_PER_SOL); // Airdrop some SOL
      console.log(`Solana account ${wallet1.publicKey.toString()} was airdropped with 200 SOL.`);
      await provider.connection.requestAirdrop(wallet2.publicKey, 5 * anchor.web3.LAMPORTS_PER_SOL); // Airdrop some SOL
      console.log(`Solana account ${wallet2.publicKey.toString()} was airdropped with 200 SOL.`);
      await provider.connection.requestAirdrop(wallet3.publicKey, 5 * anchor.web3.LAMPORTS_PER_SOL); // Airdrop some SOL
      console.log(`Solana account ${wallet3.publicKey.toString()} was airdropped with 200 SOL.`);
      await provider.connection.requestAirdrop(wallet4.publicKey, 5 * anchor.web3.LAMPORTS_PER_SOL); // Airdrop some SOL
      console.log(`Solana account ${wallet4.publicKey.toString()} was airdropped with 200 SOL.`);
      await provider.connection.requestAirdrop(wallet5.publicKey, 5 * anchor.web3.LAMPORTS_PER_SOL); // Airdrop some SOL
      console.log(`Solana account ${wallet5.publicKey.toString()} was airdropped with 200 SOL.`);
    }
  });

  it("Initializes Global State", async () => {
    console.log("Initializes Global State");

    try {
      await program.account.globalAccount.fetch(globalPDAAddress);
      console.log("Global state already exists, skipping initialization");
    } catch (e) {
      console.log("Global state does not exist, initializing");
      await program.methods
        .initialize()
        .accounts({
          user: owner.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    }
  });

  it("User 1 creates a poll", async () => {
    console.log("User 1 creates a poll");

    const globalPDA = await program.account.globalAccount.fetch(globalPDAAddress);
    
    await program.methods
    .createPoll("Do you like the first poll?", new BN(60 * 60 * 24)) // 24 hours
    .accounts({
      globalAccount: globalPDAAddress,
      user: wallet1.publicKey.toString(),
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .signers([wallet1])
    .rpc();

    console.log("Poll %s has been created.", Number(globalPDA.pollsCounter));

    const [pollPDAAddress] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("poll"), Buffer.from(globalPDA.pollsCounter.toArray("le", 8))],
      program.programId
    );
    const pollPDA = await program.account.pollAccount.fetch(pollPDAAddress);

    // console.log("Yes: ", Number(pollPDA.yes));
    // console.log("No: ", Number(pollPDA.no));

    expect(Number(pollPDA.yes)).to.eq(0);
    expect(Number(pollPDA.no)).to.eq(0);
    expect(pollPDA.question).to.eq("Do you like the first poll?");
    expect(pollPDA.author.toBase58()).to.eq(wallet1.publicKey.toString());
  });

  it("User 2 creates a poll", async () => {
    console.log("User 2 creates a poll");

    const globalPDA = await program.account.globalAccount.fetch(globalPDAAddress);

    await program.methods
      .createPoll("Do you like the second poll?", new BN(60 * 60 * 24)) // 24 hours
      .accounts({
        globalAccount: globalPDAAddress,
        user: wallet2.publicKey.toString(),
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([wallet2])
      .rpc();

    console.log("Poll %s has been created.", Number(globalPDA.pollsCounter));

    const [pollPDAAddress] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("poll"), Buffer.from(globalPDA.pollsCounter.toArray("le", 8))],
      program.programId
    );
    const pollPDA = await program.account.pollAccount.fetch(pollPDAAddress);

    // console.log("Yes: ", Number(pollPDA.yes));
    // console.log("No: ", Number(pollPDA.no));

    expect(Number(pollPDA.yes)).to.eq(0);
    expect(Number(pollPDA.no)).to.eq(0);
    expect(pollPDA.question).to.eq("Do you like the second poll?");
    expect(pollPDA.author.toBase58()).to.eq(wallet2.publicKey.toString());
  });

  it("User 1 votes yes on poll 1", async () => {
    console.log("User 1 votes yes on poll 1");

    const pollNumber = 1;
    const [pollPDAAddress] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("poll"), Buffer.from(intToLittleEndian8Bytes(pollNumber))],
      program.programId
    );

    // Find or derive the VoterAccount PDA
    const [voterPDAAddress] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("voter"), pollPDAAddress.toBuffer(), wallet1.publicKey.toBuffer()],
      program.programId
    );

    const pollPDABefore = await program.account.pollAccount.fetch(pollPDAAddress);

    // console.log("'Yes' Before: ", Number(pollPDABefore.yes));
    // console.log("'No' Before: ", Number(pollPDABefore.no));
    // console.log("-------------");

    await program.methods
      .vote(true) // true = "yes"
      .accounts({
        pollAccount: pollPDAAddress,
        voterAccount: voterPDAAddress,
        user: wallet1.publicKey.toString(),
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([wallet1])
      .rpc();

    const pollPDAAfter = await program.account.pollAccount.fetch(pollPDAAddress);
    const voterPDA = await program.account.voterAccount.fetch(voterPDAAddress);

    // console.log("'Yes' After: ", Number(pollPDAAfter.yes));
    // console.log("'No' After: ", Number(pollPDAAfter.no));
    // console.log("Voter's Vote: ", voterPDA.vote);

    expect(Number(pollPDAAfter.yes)).to.eq(Number(pollPDABefore.yes) + 1);
    expect(Number(pollPDAAfter.no)).to.eq(Number(pollPDABefore.no));
    expect(voterPDA.voted).to.be.true;
    expect(voterPDA.vote).to.be.true; // The vote should match what was cast
  });

  it("User 2 votes no on poll 2", async () => {
    console.log("User 2 votes no on poll 2");

    const pollNumber = 2;
    const [pollPDAAddress] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("poll"), Buffer.from(intToLittleEndian8Bytes(pollNumber))],
      program.programId
    );

    // Find or derive the VoterAccount PDA
    const [voterPDAAddress] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("voter"), pollPDAAddress.toBuffer(), wallet2.publicKey.toBuffer()],
      program.programId
    );

    const pollPDABefore = await program.account.pollAccount.fetch(pollPDAAddress);

    // console.log("'Yes' Before: ", Number(pollPDABefore.yes));
    // console.log("'No' Before: ", Number(pollPDABefore.no));
    // console.log("-------------");

    await program.methods
      .vote(false) // true = "yes"
      .accounts({
        pollAccount: pollPDAAddress,
        voterAccount: voterPDAAddress,
        user: wallet2.publicKey.toString(),
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([wallet2])
      .rpc();

    const pollPDAAfter = await program.account.pollAccount.fetch(pollPDAAddress);
    const voterPDA = await program.account.voterAccount.fetch(voterPDAAddress);

    // console.log("'Yes' After: ", Number(pollPDAAfter.yes));
    // console.log("'No' After: ", Number(pollPDAAfter.no));
    // console.log("Voter's Vote: ", voterPDA.vote);

    expect(Number(pollPDAAfter.yes)).to.eq(Number(pollPDABefore.yes));
    expect(Number(pollPDAAfter.no)).to.eq(Number(pollPDABefore.no) + 1);
    expect(voterPDA.voted).to.be.true;
    expect(voterPDA.vote).to.be.false; // The vote should match what was cast
  });

  it("User 1 votes twice on poll 1", async () => {
    console.log("User 1 votes yes on poll 1");

    const pollNumber = 1;

    const [pollPDAAddress] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("poll"), Buffer.from(intToLittleEndian8Bytes(pollNumber))],
      program.programId
    );

    // Find or derive the VoterAccount PDA
    const [voterPDAAddress] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("voter"), pollPDAAddress.toBuffer(), wallet1.publicKey.toBuffer()],
      program.programId
    );

    try {
      await program.methods
        .vote(true) // true = "yes"
        .accounts({
          pollAccount: pollPDAAddress,
          voterAccount: voterPDAAddress,
          user: wallet1.publicKey.toString(),
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([wallet1])
        .rpc();
    }
    catch (error:any) {
      // console.log(error.message);
      expect(error.message).to.contain("already in use"); // Check that the error message contains the expected text
    }
  });

  it("User 3 votes no on poll 2", async () => {
    console.log("User 2 votes no on poll 2");

    const pollNumber = 2;
    const [pollPDAAddress] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("poll"), Buffer.from(intToLittleEndian8Bytes(pollNumber))],
      program.programId
    );

    // Find or derive the VoterAccount PDA
    const [voterPDAAddress] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("voter"), pollPDAAddress.toBuffer(), wallet3.publicKey.toBuffer()],
      program.programId
    );

    const pollPDABefore = await program.account.pollAccount.fetch(pollPDAAddress);

    // console.log("'Yes' Before: ", Number(pollPDABefore.yes));
    // console.log("'No' Before: ", Number(pollPDABefore.no));
    // console.log("-------------");

    await program.methods
      .vote(false) // true = "yes"
      .accounts({
        pollAccount: pollPDAAddress,
        voterAccount: voterPDAAddress,
        user: wallet3.publicKey.toString(),
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([wallet3])
      .rpc();

    const pollPDAAfter = await program.account.pollAccount.fetch(pollPDAAddress);
    const voterPDA = await program.account.voterAccount.fetch(voterPDAAddress);

    // console.log("'Yes' After: ", Number(pollPDAAfter.yes));
    // console.log("'No' After: ", Number(pollPDAAfter.no));
    // console.log("Voter's Vote: ", voterPDA.vote);

    expect(Number(pollPDAAfter.yes)).to.eq(Number(pollPDABefore.yes));
    expect(Number(pollPDAAfter.no)).to.eq(Number(pollPDABefore.no) + 1);
    expect(voterPDA.voted).to.be.true;
    expect(voterPDA.vote).to.be.false; // The vote should match what was cast
  });

  it("User 4 votes no on poll 2", async () => {
    console.log("User 4 votes no on poll 2");

    const pollNumber = 2;
    const [pollPDAAddress] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("poll"), Buffer.from(intToLittleEndian8Bytes(pollNumber))],
      program.programId
    );

    // Find or derive the VoterAccount PDA
    const [voterPDAAddress] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("voter"), pollPDAAddress.toBuffer(), wallet4.publicKey.toBuffer()],
      program.programId
    );

    const pollPDABefore = await program.account.pollAccount.fetch(pollPDAAddress);

    // console.log("'Yes' Before: ", Number(pollPDABefore.yes));
    // console.log("'No' Before: ", Number(pollPDABefore.no));
    // console.log("-------------");

    await program.methods
      .vote(false) // true = "yes"
      .accounts({
        pollAccount: pollPDAAddress,
        voterAccount: voterPDAAddress,
        user: wallet4.publicKey.toString(),
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([wallet4])
      .rpc();

    const pollPDAAfter = await program.account.pollAccount.fetch(pollPDAAddress);
    const voterPDA = await program.account.voterAccount.fetch(voterPDAAddress);

    // console.log("'Yes' After: ", Number(pollPDAAfter.yes));
    // console.log("'No' After: ", Number(pollPDAAfter.no));
    // console.log("Voter's Vote: ", voterPDA.vote);

    expect(Number(pollPDAAfter.yes)).to.eq(Number(pollPDABefore.yes));
    expect(Number(pollPDAAfter.no)).to.eq(Number(pollPDABefore.no) + 1);
    expect(voterPDA.voted).to.be.true;
    expect(voterPDA.vote).to.be.false; // The vote should match what was cast
  });

  it("User 5 votes yes on poll 2", async () => {
    console.log("User 5 votes yes on poll 2");

    const pollNumber = 2;
    const [pollPDAAddress] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("poll"), Buffer.from(intToLittleEndian8Bytes(pollNumber))],
      program.programId
    );

    // Find or derive the VoterAccount PDA
    const [voterPDAAddress] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("voter"), pollPDAAddress.toBuffer(), wallet5.publicKey.toBuffer()],
      program.programId
    );

    const pollPDABefore = await program.account.pollAccount.fetch(pollPDAAddress);

    // console.log("'Yes' Before: ", Number(pollPDABefore.yes));
    // console.log("'No' Before: ", Number(pollPDABefore.no));
    // console.log("-------------");

    await program.methods
      .vote(true) // true = "yes"
      .accounts({
        pollAccount: pollPDAAddress,
        voterAccount: voterPDAAddress,
        user: wallet5.publicKey.toString(),
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([wallet5])
      .rpc();

    const pollPDAAfter = await program.account.pollAccount.fetch(pollPDAAddress);
    const voterPDA = await program.account.voterAccount.fetch(voterPDAAddress);

    // console.log("'Yes' After: ", Number(pollPDAAfter.yes));
    // console.log("'No' After: ", Number(pollPDAAfter.no));
    // console.log("Voter's Vote: ", voterPDA.vote);

    expect(Number(pollPDAAfter.yes)).to.eq(Number(pollPDABefore.yes) + 1);
    expect(Number(pollPDAAfter.no)).to.eq(Number(pollPDABefore.no));
    expect(voterPDA.voted).to.be.true;
    expect(voterPDA.vote).to.be.true; // The vote should match what was cast
  });

  it("User 1 tries to vote on an expired poll", async () => {
    console.log("User 1 tries to vote on an expired poll");

    const globalPDA = await program.account.globalAccount.fetch(globalPDAAddress);

    // Create a poll with 1 second duration
    await program.methods
      .createPoll("Expired Poll?", new BN(1)) 
      .accounts({
        globalAccount: globalPDAAddress,
        user: wallet1.publicKey.toString(),
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([wallet1])
      .rpc();

    const pollNumber = Number(globalPDA.pollsCounter);
    console.log("Poll %s has been created (short duration).", pollNumber);

    // Wait for 2 seconds
    await new Promise(resolve => setTimeout(resolve, 2000));

    const [pollPDAAddress] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("poll"), Buffer.from(intToLittleEndian8Bytes(pollNumber))],
      program.programId
    );

    // Find or derive the VoterAccount PDA
    const [voterPDAAddress] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("voter"), pollPDAAddress.toBuffer(), wallet1.publicKey.toBuffer()],
      program.programId
    );

    try {
      await program.methods
        .vote(true)
        .accounts({
          pollAccount: pollPDAAddress,
          voterAccount: voterPDAAddress,
          user: wallet1.publicKey.toString(),
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([wallet1])
        .rpc();
      
      // If we get here, it failed
      expect.fail("Vote should have failed due to expiration");
    } catch (error: any) {
      expect(error.message).to.contain("PollExpired"); // Or whatever the error code message is
    }
  });

  
});

/**
 * Converts an integer to a 64-bit Little Endian byte array.
 * @param {number} number
 * @returns {Buffer} Little Endian 64-bit buffer.
 */
function intToLittleEndian8Bytes(number) {
  if (!Number.isInteger(number)) {
    throw new Error("The number must be an integer.");
  }

  if (number < 0 || number > BigInt("0xFFFFFFFFFFFFFFFF")) {
    throw new Error("The number must be between 0 and 2^64 - 1.");
  }

  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(BigInt(number));
  return buffer;
}
