import React, { useState } from 'react';
import Sidebar from './Sidebar';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Bell, Droplets, Loader2, Check } from 'lucide-react';
import { useWallet } from '@solana/wallet-adapter-react';
import { program, globalAccountPDAAddress, faucetSeed } from '../config';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import * as token from '@solana/spl-token';

import { useLocation } from 'react-router-dom';

const DashboardLayout = ({ children }) => {
  const location = useLocation();
  const wallet = useWallet();
  const { publicKey } = wallet;
  const [requesting, setRequesting] = useState(false);
  const [lastRequestTime, setLastRequestTime] = useState(null); // Could be used to show timer

  const handleRequestTokens = async () => {
    if (!publicKey) return;
    
    setRequesting(true);
    try {
        const votingProgram = program(wallet);
        
        // 1. Get Global Account to find Token Mint
        const globalAccount = await votingProgram.account.globalAccount.fetch(globalAccountPDAAddress);
        const tokenMint = globalAccount.tokenMint;

        // 2. Get User ATA
        const userTokenAccount = await token.getAssociatedTokenAddress(
            tokenMint,
            publicKey
        );

        // 3. Find Faucet PDA
        const [faucetPDA] = await PublicKey.findProgramAddress(
            [Buffer.from(faucetSeed), publicKey.toBuffer()],
            votingProgram.programId
        );

        // 4. Call Request Tokens
        await votingProgram.methods
            .requestTokens()
            .accounts({
                faucetRecord: faucetPDA,
                globalAccount: globalAccountPDAAddress,
                tokenMint: tokenMint,
                userTokenAccount: userTokenAccount,
                user: publicKey,
                user: publicKey,
                tokenProgram: token.TOKEN_PROGRAM_ID,
                associatedTokenProgram: token.ASSOCIATED_TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
            })
            .rpc();
        
        // Success feedback
        const btn = document.getElementById('faucet-btn');
        if(btn) {
            btn.classList.add('bg-green-500');
            setTimeout(() => btn.classList.remove('bg-green-500'), 2000);
        }

    } catch (error) {
        console.error("Faucet Error:", error);
        alert("Failed to request tokens: " + error.message);
    } finally {
        setRequesting(false);
    }
  };


  return (
    <div className="min-h-screen bg-nebula text-white font-sans flex">
      <Sidebar />
      
      {/* Main Content Area */}
      <div className="flex-1 ml-64">
        {/* Header */}
        <header className="h-20 px-8 flex items-center justify-end bg-transparent sticky top-0 z-40">
            
            <div className="flex items-center gap-6">
                
                <button 
                  id="faucet-btn"
                  onClick={handleRequestTokens}
                  disabled={requesting || !publicKey}
                  className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed group relative overflow-hidden"
                >
                    {requesting ? (
                        <Loader2 size={18} className="animate-spin text-[#14F195]" />
                    ) : (
                        <Droplets size={18} className="text-[#14F195] group-hover:scale-110 transition-transform" />
                    )}
                    <span className="text-sm font-medium text-gray-300 group-hover:text-white">
                        {requesting ? 'Minting...' : 'Faucet'}
                    </span>
                    
                    {/* Tooltip for context */}
                    <div className="absolute top-full mt-2 right-0 w-48 p-2 bg-black/90 border border-white/10 rounded-lg text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                        Get 3000 $PULSAR every 24h
                    </div>
                </button>

                <button className="relative p-2 text-pulsar-muted hover:text-white transition-colors">
                    <Bell size={20} />
                    <span className="absolute top-1 right-1 w-2 h-2 bg-pulsar-danger rounded-full"></span>
                </button>
                
                <WalletMultiButton className="!bg-gradient-to-r !from-blue-600 !to-purple-600 !border-none !rounded-xl !font-display !font-bold !text-sm !h-10 !px-6 !text-white !transition-all !duration-300 hover:!shadow-[0_0_20px_rgba(147,51,234,0.5)] hover:!scale-105 active:!scale-95" />
            </div>
        </header>

        {/* Page Content */}
        <main className="p-8">
            {children}
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
