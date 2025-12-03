// src/config.js

import { Connection, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Program } from "@coral-xyz/anchor";

// Solana network endpoint (Devnet in this case)
// const localhost = 'http://127.0.0.1:8899';
const devnet = 'https://api.devnet.solana.com';
export const connection = new Connection(devnet);

// Import the IDL
export const idl = require('./idl/pulsar_dao.json');

// Program ID for your Solana program
export const programId = new PublicKey(idl.address);

// PDAs seeds
export const globalStateSeed = 'global_account';
export const pollSeed = 'poll';
export const voterSeed = 'voter';

// Helper to create the AnchorProvider instance
const getProvider = (wallet) => {
    if (!wallet) throw new Error('Wallet not connected');
    const provider = new AnchorProvider(connection, wallet, AnchorProvider.defaultOptions());
    return provider;
};

// Export the program helper for wallet-connected operations
export const program = (wallet) => new Program(idl, getProvider(wallet));

export const [globalAccountPDAAddress] = await PublicKey.findProgramAddress(
    [Buffer.from('global_account')], // Seed for global account
    programId // Use programId from config.js
);