const anchor = require("@coral-xyz/anchor");
const { PublicKey } = require("@solana/web3.js");
const fs = require("fs");

async function main() {
  // Get cluster from command line or use default
  const cluster = process.argv[2] || "devnet";
  const clusterUrl = cluster === "localnet" 
    ? "http://127.0.0.1:8899" 
    : `https://api.${cluster}.solana.com`;

  console.log(`🌐 Connecting to ${cluster} (${clusterUrl})`);

  // Setup
  const connection = new anchor.web3.Connection(clusterUrl, "confirmed");
  const wallet = anchor.Wallet.local();
  const provider = new anchor.AnchorProvider(connection, wallet, {});
  anchor.setProvider(provider);

  // Load IDL
  const idl = JSON.parse(fs.readFileSync("./target/idl/pulsar_dao.json", "utf8"));
  const programId = new PublicKey(idl.address);
  const program = new anchor.Program(idl, provider);

  console.log("📋 Program ID:", programId.toString());
  console.log("👛 Wallet:", wallet.publicKey.toString());

  // Derive Global Account PDA
  const [globalAccountPDA] = await PublicKey.findProgramAddress(
    [Buffer.from("global_account")],
    programId
  );
  console.log("🔑 Global Account PDA:", globalAccountPDA.toString());

  // Check if global account exists
  const accountInfo = await connection.getAccountInfo(globalAccountPDA);
  
  if (accountInfo) {
    console.log("\n✅ Global account already initialized!");
    const globalAccount = await program.account.globalAccount.fetch(globalAccountPDA);
    console.log("📊 Current polls counter:", globalAccount.pollsCounter.toString());
  } else {
    console.log("\n🔧 Initializing global account...");
    try {
      const tx = await program.methods
        .initialize()
        .accounts({
          globalAccount: globalAccountPDA,
          user: wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      console.log("✅ Transaction:", tx);
      console.log("✅ Global account initialized successfully!");
    } catch (e) {
      console.error("❌ Initialization failed:", e.message);
      if (e.logs) {
        console.error("\n📜 Program logs:");
        e.logs.forEach(log => console.error("  ", log));
      }
      process.exit(1);
    }
  }
}

main().catch((error) => {
  console.error("❌ Error:", error.message);
  process.exit(1);
});
