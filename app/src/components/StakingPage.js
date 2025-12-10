import React, { useEffect, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { program, programId, globalStateSeed } from '../config';
import StakeManager from './StakeManager';

const StakingPage = () => {
    const { connection } = useConnection();
    const { publicKey } = useWallet();
    const [tokenMint, setTokenMint] = useState(null);
    const [loading, setLoading] = useState(true);
    const [daoInitialized, setDaoInitialized] = useState(true);

    useEffect(() => {
        const fetchGlobal = async () => {
             setLoading(true);
             try {
                const votingProgram = program({ publicKey: publicKey || null });
                const [globalAccountPDA] = PublicKey.findProgramAddressSync([Buffer.from(globalStateSeed)], programId);
                const globalAccount = await votingProgram.account.globalAccount.fetch(globalAccountPDA);
                setTokenMint(globalAccount.tokenMint.toString());
                setDaoInitialized(true);
             } catch(e) {
                 console.error("Error fetching global account details:", e);
                 console.log("Details:", e.message, e.logs);
                 setDaoInitialized(false);
             } finally {
                 setLoading(false);
             }
        };
        fetchGlobal();
    }, [publicKey]); // Refresh if wallet changes (just in case provider changes)

    return (
        <div className="p-8 max-w-6xl mx-auto">
             <h1 className="text-3xl font-bold text-white mb-2 font-display">Staking Vault</h1>
             <p className="text-gray-400 mb-8">Lock your tokens to gain voting power multiplier.</p>
             
             {loading ? (
                 <div className="text-white animate-pulse">Loading DAO configuration...</div>
             ) : !daoInitialized ? (
                 <div className="p-8 border border-white/10 bg-white/5 rounded-xl text-center">
                     <h3 className="text-xl font-bold text-white mb-2">System Under Construction</h3>
                     {publicKey?.toString() === "GH7koeBf99FBsdEnA8xLtWyLFgb44CgDGUXwLHnAATR" ? (
                        <p className="text-red-400">Admin Action Required: <a href="/dao-admin" className="underline font-bold">Initialize System</a></p>
                     ) : (
                        <p className="text-gray-400">The Pulsar DAO protocol is currently being deployed. Check back soon.</p>
                     )}
                 </div>
             ) : tokenMint ? (
                 <StakeManager tokenMintAddress={tokenMint} />
             ) : (
                 <div className="text-white">Unexpected Error: Token Mint not found.</div>
             )}
        </div>
    );
};

export default StakingPage;
