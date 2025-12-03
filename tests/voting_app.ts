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
  let poll1Id: number;
  let poll2Id: number;

  before("Before", async () => {
    [globalPDAAddress] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("global_account")],
      program.programId
    );

    if (network === "localhost") {
      console.log("Funding players accounts via Airdrop...");
      await provider.connection.requestAirdrop(wallet1.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
      await provider.connection.requestAirdrop(wallet2.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
      await provider.connection.requestAirdrop(wallet3.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
      await provider.connection.requestAirdrop(wallet4.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
      await provider.connection.requestAirdrop(wallet5.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    } else if (network === "devnet") {
      console.log("Funding players accounts via Transfer from Owner...");
      // Transfer 0.1 SOL to each test wallet from the provider wallet
      const transaction = new anchor.web3.Transaction().add(
        anchor.web3.SystemProgram.transfer({
          fromPubkey: owner.publicKey,
          toPubkey: wallet1.publicKey,
          lamports: 0.1 * anchor.web3.LAMPORTS_PER_SOL,
        }),
        anchor.web3.SystemProgram.transfer({
          fromPubkey: owner.publicKey,
          toPubkey: wallet2.publicKey,
          lamports: 0.1 * anchor.web3.LAMPORTS_PER_SOL,
        }),
        anchor.web3.SystemProgram.transfer({
          fromPubkey: owner.publicKey,
          toPubkey: wallet3.publicKey,
          lamports: 0.1 * anchor.web3.LAMPORTS_PER_SOL,
        }),
        anchor.web3.SystemProgram.transfer({
          fromPubkey: owner.publicKey,
          toPubkey: wallet4.publicKey,
          lamports: 0.1 * anchor.web3.LAMPORTS_PER_SOL,
        }),
        anchor.web3.SystemProgram.transfer({
          fromPubkey: owner.publicKey,
          toPubkey: wallet5.publicKey,
          lamports: 0.1 * anchor.web3.LAMPORTS_PER_SOL,
        })
      );
      await provider.sendAndConfirm(transaction);
      console.log("Transferred 0.1 SOL to each player.");
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
    poll1Id = Number(globalPDA.pollsCounter);

    const [pollPDAAddress] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("poll"), Buffer.from(globalPDA.pollsCounter.toArray("le", 8))],
      program.programId
    );
    const pollPDA = await program.account.pollAccount.fetch(pollPDAAddress);

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
    poll2Id = Number(globalPDA.pollsCounter);

    const [pollPDAAddress] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("poll"), Buffer.from(globalPDA.pollsCounter.toArray("le", 8))],
      program.programId
    );
    const pollPDA = await program.account.pollAccount.fetch(pollPDAAddress);

    expect(Number(pollPDA.yes)).to.eq(0);
    expect(Number(pollPDA.no)).to.eq(0);
    expect(pollPDA.question).to.eq("Do you like the second poll?");
    expect(pollPDA.author.toBase58()).to.eq(wallet2.publicKey.toString());
  });

  it("User 1 votes yes on poll 1", async () => {
    console.log("User 1 votes yes on poll 1");

    const pollNumber = poll1Id;
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

    expect(Number(pollPDAAfter.yes)).to.eq(Number(pollPDABefore.yes) + 1);
    expect(Number(pollPDAAfter.no)).to.eq(Number(pollPDABefore.no));
    expect(voterPDA.voted).to.be.true;
    expect(voterPDA.vote).to.be.true; // The vote should match what was cast
  });

  it("User 2 votes no on poll 2", async () => {
    console.log("User 2 votes no on poll 2");

    const pollNumber = poll2Id;
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

    expect(Number(pollPDAAfter.yes)).to.eq(Number(pollPDABefore.yes));
    expect(Number(pollPDAAfter.no)).to.eq(Number(pollPDABefore.no) + 1);
    expect(voterPDA.voted).to.be.true;
    expect(voterPDA.vote).to.be.false; // The vote should match what was cast
  });

  it("User 1 votes twice on poll 1", async () => {
    console.log("User 1 votes yes on poll 1");

    const pollNumber = poll1Id;

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
      expect(error.message).to.contain("already in use"); // Check that the error message contains the expected text
    }
  });

  it("User 3 votes no on poll 2", async () => {
    console.log("User 2 votes no on poll 2");

    const pollNumber = poll2Id;
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

    expect(Number(pollPDAAfter.yes)).to.eq(Number(pollPDABefore.yes));
    expect(Number(pollPDAAfter.no)).to.eq(Number(pollPDABefore.no) + 1);
    expect(voterPDA.voted).to.be.true;
    expect(voterPDA.vote).to.be.false; // The vote should match what was cast
  });

  it("User 4 votes no on poll 2", async () => {
    console.log("User 4 votes no on poll 2");

    const pollNumber = poll2Id;
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

    expect(Number(pollPDAAfter.yes)).to.eq(Number(pollPDABefore.yes));
    expect(Number(pollPDAAfter.no)).to.eq(Number(pollPDABefore.no) + 1);
    expect(voterPDA.voted).to.be.true;
    expect(voterPDA.vote).to.be.false; // The vote should match what was cast
  });

  it("User 5 votes yes on poll 2", async () => {
    console.log("User 5 votes yes on poll 2");

    const pollNumber = poll2Id;
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

  describe("Vote Updates", () => {
    const voter = anchor.web3.Keypair.generate(); // Voter
    const nonAdmin = anchor.web3.Keypair.generate(); // Non-admin user
    let pollPDAAddress;
    let voterPDAAddress;

    before("Setup", async () => {
        if (network === "localhost") {
            await provider.connection.requestAirdrop(voter.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
            await provider.connection.requestAirdrop(nonAdmin.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
        } else if (network === "devnet") {
            const transaction = new anchor.web3.Transaction().add(
                anchor.web3.SystemProgram.transfer({
                    fromPubkey: owner.publicKey,
                    toPubkey: voter.publicKey,
                    lamports: 0.1 * anchor.web3.LAMPORTS_PER_SOL,
                }),
                anchor.web3.SystemProgram.transfer({
                    fromPubkey: owner.publicKey,
                    toPubkey: nonAdmin.publicKey,
                    lamports: 0.1 * anchor.web3.LAMPORTS_PER_SOL,
                })
            );
            await provider.sendAndConfirm(transaction);
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

  describe("Vote Withdrawal", () => {
    const voter = anchor.web3.Keypair.generate(); // Voter
    let pollPDAAddress;
    let voterPDAAddress;

    before("Setup", async () => {
        if (network === "localhost") {
            await provider.connection.requestAirdrop(voter.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
        } else if (network === "devnet") {
            const transaction = new anchor.web3.Transaction().add(
                anchor.web3.SystemProgram.transfer({
                    fromPubkey: owner.publicKey,
                    toPubkey: voter.publicKey,
                    lamports: 0.1 * anchor.web3.LAMPORTS_PER_SOL,
                })
            );
            await provider.sendAndConfirm(transaction);
        }
    });

    it("Creates a poll for testing withdrawal", async () => {
        const globalPDA = await program.account.globalAccount.fetch(globalPDAAddress);
        const pollNumber = globalPDA.pollsCounter;

        await program.methods
        .createPoll("Can I withdraw my vote?", new BN(60 * 60)) // 1 hour
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

    it("Voter votes YES", async () => {
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
        expect(voterAccount.vote).to.be.true;
    });

    it("Voter withdraws vote", async () => {
        await program.methods
        .withdrawVote()
        .accounts({
            globalAccount: globalPDAAddress,
            pollAccount: pollPDAAddress,
            voterAccount: voterPDAAddress,
            user: voter.publicKey,
        })
        .signers([voter])
        .rpc();

        const pollAccount = await program.account.pollAccount.fetch(pollPDAAddress);
        expect(Number(pollAccount.yes)).to.eq(0);

        // Verify voter account is closed
        const voterAccountInfo = await provider.connection.getAccountInfo(voterPDAAddress);
        expect(voterAccountInfo).to.be.null;
    });

    it("Voter can vote again after withdrawal", async () => {
        await program.methods
        .vote(false) // No
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

        expect(Number(pollAccount.no)).to.eq(1);
        expect(voterAccount.vote).to.be.false;
    });
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
