// src/config.js
// Updated IDL verify

import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { AnchorProvider, Program } from "@coral-xyz/anchor";

// Solana network endpoint (Devnet in this case)
// const localhost = 'http://127.0.0.1:8899';
const devnet = 'https://api.devnet.solana.com';
export const connection = new Connection(devnet);

// Import the IDL
export const idl = require('./idl/pulsar_dao.json');

// Program ID for your Solana program
export const programId = new PublicKey('EE1i9YyUyjEKxXNzRaup86EkCDyd1bt21e1ecF7rgN9R');

// PDAs seeds
export const globalStateSeed = 'global_account';
export const proposalSeed = 'proposal';
export const voterSeed = 'voter';
export const faucetSeed = 'faucet';
export const delegateProfileSeed = 'delegate_profile';
export const delegationRecordSeed = 'delegation_record';
export const proposalEscrowSeed = 'proposal_escrow';
export const userStatsSeed = 'user_stats_v2';
export const badgeMintSeed = 'badge';

// Helper to create the AnchorProvider instance
const getProvider = (wallet) => {
    // Handle read-only case (no wallet or no publicKey)
    if (!wallet || !wallet.publicKey) {
        const dummyWallet = {
            publicKey: Keypair.generate().publicKey,
            signTransaction: () => Promise.reject(new Error("Read-only provider")),
            signAllTransactions: () => Promise.reject(new Error("Read-only provider")),
        };
        return new AnchorProvider(connection, dummyWallet, AnchorProvider.defaultOptions());
    }
    const provider = new AnchorProvider(connection, wallet, AnchorProvider.defaultOptions());
    return provider;
};

// Export the program helper for wallet-connected operations
export const program = (wallet) => {
    // FORCE Update the address in the IDL object to match our hardcoded/configured ID
    // This ensures we don't accidentally use a cached/old address from the JSON file
    idl.address = programId.toString();
    return new Program(idl, getProvider(wallet));
};

export const [globalAccountPDAAddress] = PublicKey.findProgramAddressSync(
    [Buffer.from(globalStateSeed)], // Seed for global account
    programId // Use programId from config.js
);