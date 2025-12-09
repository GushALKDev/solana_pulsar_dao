import { expect } from "chai";
import * as anchor from "@coral-xyz/anchor";
import { BN } from "bn.js";
import { 
  createMint, 
  getOrCreateAssociatedTokenAccount, 
  mintTo, 
  TOKEN_PROGRAM_ID 
} from "@solana/spl-token";

describe("pulsar_dao", () => {
  /* Configure the client */
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.PulsarDao;

  let network: string;
  if (provider.connection.rpcEndpoint === "http://127.0.0.1:8899") network = "localhost";
  else if (provider.connection.rpcEndpoint === "https://api.devnet.solana.com") network = "devnet";

  const owner = (program.provider as anchor.AnchorProvider).wallet; // Owner
  const wallet1 = anchor.web3.Keypair.generate(); // Voter 1
  const wallet2 = anchor.web3.Keypair.generate(); // Voter 2
  const wallet3 = anchor.web3.Keypair.generate(); // Voter 3
  const wallet4 = anchor.web3.Keypair.generate(); // Voter 4
  const wallet5 = anchor.web3.Keypair.generate(); // Voter 5

  let mint: anchor.web3.PublicKey;
  let wallet1ATA: anchor.web3.PublicKey;
  let wallet2ATA: anchor.web3.PublicKey;
  let wallet3ATA: anchor.web3.PublicKey;
  let wallet4ATA: anchor.web3.PublicKey;
  let wallet5ATA: anchor.web3.PublicKey;

  console.log("Owner Address:", owner.publicKey.toString());

  let globalPDAAddress;
  let poll1Id: number;
  let poll2Id: number;

  before("Before", async () => {
    [globalPDAAddress] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("global_account")],
      program.programId
    );

    // Fund wallets
    if (network === "localhost") {
      await provider.connection.requestAirdrop(wallet1.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
      await provider.connection.requestAirdrop(wallet2.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
      await provider.connection.requestAirdrop(wallet3.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
      await provider.connection.requestAirdrop(wallet4.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
      await provider.connection.requestAirdrop(wallet5.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    } else if (network === "devnet") {
        // ... (devnet funding logic omitted for brevity, similar to before)
    }

    // Create Token Mint
    mint = await createMint(
        provider.connection,
        (owner as any).payer,
        owner.publicKey,
        null,
        0 // 0 decimals for simplicity
    );
    console.log("Token Mint created:", mint.toString());

    // Create ATAs and Mint Tokens
    // Wallet 1: 100 tokens -> 10 votes
    wallet1ATA = (await getOrCreateAssociatedTokenAccount(provider.connection, (owner as any).payer, mint, wallet1.publicKey)).address;
    await mintTo(provider.connection, (owner as any).payer, mint, wallet1ATA, owner.publicKey, 100);

    // Wallet 2: 4 tokens -> 2 votes
    wallet2ATA = (await getOrCreateAssociatedTokenAccount(provider.connection, (owner as any).payer, mint, wallet2.publicKey)).address;
    await mintTo(provider.connection, (owner as any).payer, mint, wallet2ATA, owner.publicKey, 4);

    // Wallet 3: 9 tokens -> 3 votes
    wallet3ATA = (await getOrCreateAssociatedTokenAccount(provider.connection, (owner as any).payer, mint, wallet3.publicKey)).address;
    await mintTo(provider.connection, (owner as any).payer, mint, wallet3ATA, owner.publicKey, 9);

    // Wallet 4: 16 tokens -> 4 votes
    wallet4ATA = (await getOrCreateAssociatedTokenAccount(provider.connection, (owner as any).payer, mint, wallet4.publicKey)).address;
    await mintTo(provider.connection, (owner as any).payer, mint, wallet4ATA, owner.publicKey, 16);

    // Wallet 5: 25 tokens -> 5 votes
    wallet5ATA = (await getOrCreateAssociatedTokenAccount(provider.connection, (owner as any).payer, mint, wallet5.publicKey)).address;
    await mintTo(provider.connection, (owner as any).payer, mint, wallet5ATA, owner.publicKey, 25);
  });

  it("Initializes Global State", async () => {
    try {
      await program.account.globalAccount.fetch(globalPDAAddress);
      console.log("Global state already exists");
    } catch (e) {
      await program.methods
        .initialize()
        .accounts({
          user: owner.publicKey,
          tokenMint: mint,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    }
  });

  it("User 1 creates a poll", async () => {
    const globalPDA = await program.account.globalAccount.fetch(globalPDAAddress);
    
    await program.methods
    .createPoll("Do you like the first poll?", new BN(60 * 60 * 24))
    .accounts({
      globalAccount: globalPDAAddress,
      user: wallet1.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .signers([wallet1])
    .rpc();

    poll1Id = Number(globalPDA.pollsCounter);
  });

  it("User 2 creates a poll", async () => {
    const globalPDA = await program.account.globalAccount.fetch(globalPDAAddress);

    await program.methods
      .createPoll("Do you like the second poll?", new BN(60 * 60 * 24))
      .accounts({
        globalAccount: globalPDAAddress,
        user: wallet2.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([wallet2])
      .rpc();

    poll2Id = Number(globalPDA.pollsCounter);
  });

  it("User 1 votes yes on poll 1 (100 tokens -> 10 votes)", async () => {
    const pollNumber = poll1Id;
    const [pollPDAAddress] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("poll"), Buffer.from(intToLittleEndian8Bytes(pollNumber))],
      program.programId
    );

    const [voterPDAAddress] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("voter"), pollPDAAddress.toBuffer(), wallet1.publicKey.toBuffer()],
      program.programId
    );

    const pollPDABefore = await program.account.pollAccount.fetch(pollPDAAddress);

    await program.methods
      .vote(true)
      .accounts({
        globalAccount: globalPDAAddress,
        pollAccount: pollPDAAddress,
        voterAccount: voterPDAAddress,
        tokenAccount: wallet1ATA,
        user: wallet1.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([wallet1])
      .rpc();

    const pollPDAAfter = await program.account.pollAccount.fetch(pollPDAAddress);
    const voterPDA = await program.account.voterAccount.fetch(voterPDAAddress);

    // Expected increase: 10 (sqrt(100))
    expect(Number(pollPDAAfter.yes)).to.eq(Number(pollPDABefore.yes) + 10);
    expect(voterPDA.votingPower.toNumber()).to.eq(10);
  });

  it("User 2 votes no on poll 2 (4 tokens -> 2 votes)", async () => {
    const pollNumber = poll2Id;
    const [pollPDAAddress] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("poll"), Buffer.from(intToLittleEndian8Bytes(pollNumber))],
      program.programId
    );

    const [voterPDAAddress] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("voter"), pollPDAAddress.toBuffer(), wallet2.publicKey.toBuffer()],
      program.programId
    );

    const pollPDABefore = await program.account.pollAccount.fetch(pollPDAAddress);

    await program.methods
      .vote(false)
      .accounts({
        globalAccount: globalPDAAddress,
        pollAccount: pollPDAAddress,
        voterAccount: voterPDAAddress,
        tokenAccount: wallet2ATA,
        user: wallet2.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([wallet2])
      .rpc();

    const pollPDAAfter = await program.account.pollAccount.fetch(pollPDAAddress);
    const voterPDA = await program.account.voterAccount.fetch(voterPDAAddress);

    // Expected increase: 2 (sqrt(4))
    expect(Number(pollPDAAfter.no)).to.eq(Number(pollPDABefore.no) + 2);
    expect(voterPDA.votingPower.toNumber()).to.eq(2);
  });

  it("User 3 votes no on poll 2 (9 tokens -> 3 votes)", async () => {
    const pollNumber = poll2Id;
    const [pollPDAAddress] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("poll"), Buffer.from(intToLittleEndian8Bytes(pollNumber))],
      program.programId
    );

    const [voterPDAAddress] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("voter"), pollPDAAddress.toBuffer(), wallet3.publicKey.toBuffer()],
      program.programId
    );

    const pollPDABefore = await program.account.pollAccount.fetch(pollPDAAddress);

    await program.methods
      .vote(false)
      .accounts({
        globalAccount: globalPDAAddress,
        pollAccount: pollPDAAddress,
        voterAccount: voterPDAAddress,
        tokenAccount: wallet3ATA,
        user: wallet3.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([wallet3])
      .rpc();

    const pollPDAAfter = await program.account.pollAccount.fetch(pollPDAAddress);
    
    // Expected increase: 3 (sqrt(9))
    expect(Number(pollPDAAfter.no)).to.eq(Number(pollPDABefore.no) + 3);
  });

  // Test Update Vote
  it("User 1 changes vote to NO on poll 1", async () => {
    const pollNumber = poll1Id;
    const [pollPDAAddress] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("poll"), Buffer.from(intToLittleEndian8Bytes(pollNumber))],
      program.programId
    );
    const [voterPDAAddress] = await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("voter"), pollPDAAddress.toBuffer(), wallet1.publicKey.toBuffer()],
        program.programId
    );

    const pollPDABefore = await program.account.pollAccount.fetch(pollPDAAddress);

    await program.methods
      .updateVote(false)
      .accounts({
        globalAccount: globalPDAAddress,
        pollAccount: pollPDAAddress,
        voterAccount: voterPDAAddress,
        tokenAccount: wallet1ATA,
        user: wallet1.publicKey,
      })
      .signers([wallet1])
      .rpc();

    const pollPDAAfter = await program.account.pollAccount.fetch(pollPDAAddress);
    
    // YES should decrease by 10, NO should increase by 10
    expect(Number(pollPDAAfter.yes)).to.eq(Number(pollPDABefore.yes) - 10);
    expect(Number(pollPDAAfter.no)).to.eq(Number(pollPDABefore.no) + 10);
  });

  // Test Withdraw Vote
  it("User 2 withdraws vote from poll 2", async () => {
    const pollNumber = poll2Id;
    const [pollPDAAddress] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("poll"), Buffer.from(intToLittleEndian8Bytes(pollNumber))],
      program.programId
    );
    const [voterPDAAddress] = await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("voter"), pollPDAAddress.toBuffer(), wallet2.publicKey.toBuffer()],
        program.programId
    );

    const pollPDABefore = await program.account.pollAccount.fetch(pollPDAAddress);

    await program.methods
      .withdrawVote()
      .accounts({
        globalAccount: globalPDAAddress,
        pollAccount: pollPDAAddress,
        voterAccount: voterPDAAddress,
        user: wallet2.publicKey,
      })
      .signers([wallet2])
      .rpc();

    const pollPDAAfter = await program.account.pollAccount.fetch(pollPDAAddress);

    // NO should decrease by 2
    expect(Number(pollPDAAfter.no)).to.eq(Number(pollPDABefore.no) - 2);
  });

});

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


