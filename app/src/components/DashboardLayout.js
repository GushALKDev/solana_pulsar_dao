import React, { useState } from 'react';
import Sidebar from './Sidebar';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Bell, Droplets, Loader2, Check } from 'lucide-react';
import { useWallet } from '@solana/wallet-adapter-react';
import { program, globalAccountPDAAddress, faucetSeed, programId, proposalSeed } from '../config';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import * as token from '@solana/spl-token';

import { useLocation } from 'react-router-dom';

const DashboardLayout = ({ children }) => {
  const location = useLocation();
  const wallet = useWallet();
  const { publicKey } = wallet;
  const [requesting, setRequesting] = useState(false);
  
  // Notification State
  const [notifications, setNotifications] = useState([]);
  const [hasUnread, setHasUnread] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [lastReadId, setLastReadId] = useState(
      parseInt(localStorage.getItem('pulsar_last_read_proposal') || '0')
  );

  // Helper for PDA
  function toLittleEndian8Bytes(num) {
    const buffer = Buffer.alloc(8);
    buffer.writeUInt32LE(num, 0);
    return buffer;
  }

  // Poll for Notifications
  React.useEffect(() => {
    const fetchNotifications = async () => {
        try {
            // Use a read-only provider if wallet not connected, or wallet if connected
            const votingProgram = program(wallet.publicKey ? wallet : { publicKey: null });
            
            // 1. Get Global Count
            // We use findProgramAddressSync for speed/simplicity in this polling effect if possible, 
            // but for global account we have the address const.
            // Note: Dashboard might load before wallet is ready, so handle errors gracefully.
            
            let count = 0;
            try {
                const globalAccount = await votingProgram.account.globalAccount.fetch(globalAccountPDAAddress);
                count = globalAccount.proposalCount.toNumber();
            } catch(e) { return; } // DAO not init or net error
            
            if (count === 0) return;

            // 2. Fetch last 5 proposals
            // We want to show the newest ones. 
            // Loop from count down to max(1, count - 4)
            const newNotifications = [];
            const start = count;
            const end = Math.max(1, count - 4);
            
            for (let i = start; i >= end; i--) {
                const [pda] = PublicKey.findProgramAddressSync(
                    [Buffer.from(proposalSeed), Buffer.from(toLittleEndian8Bytes(i))],
                    programId
                );
                
                try {
                    const prop = await votingProgram.account.proposalAccount.fetch(pda);
                    newNotifications.push({
                        id: i,
                        title: prop.question,
                        deadline: prop.deadline.toNumber(),
                        isNew: i > lastReadId
                    });
                } catch(e) {}
            }
            
            setNotifications(newNotifications);
            const anyNew = newNotifications.some(n => n.id > lastReadId);
            setHasUnread(anyNew);

        } catch(e) {
            console.error("Notif fetch error", e);
        }
    };

    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15000); // Check every 15s
    return () => clearInterval(interval);
  }, [lastReadId, wallet.publicKey]); // Re-run if ReadStatus changes or wallet changes

  const handleMarkAsRead = () => {
      if (notifications.length === 0) return;
      
      const newestId = notifications[0].id; // First item is newest due to loop order
      setLastReadId(newestId);
      localStorage.setItem('pulsar_last_read_proposal', newestId.toString());
      
      // Update local state immediately
      setNotifications(prev => prev.map(n => ({ ...n, isNew: false })));
      setHasUnread(false);
  };

  // Listen for external read updates (e.g. from Proposal Page)
  React.useEffect(() => {
      const handleReadUpdate = () => {
           const newVal = parseInt(localStorage.getItem('pulsar_last_read_proposal') || '0');
           setLastReadId(newVal);
      };

      window.addEventListener('pulsar-proposal-read', handleReadUpdate);
      return () => window.removeEventListener('pulsar-proposal-read', handleReadUpdate);
  }, []);


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

                <div className="relative">
                    <button 
                        onClick={() => setShowNotifications(!showNotifications)}
                        className={`relative p-2 transition-colors ${showNotifications ? 'text-white bg-white/10 rounded-lg' : 'text-pulsar-muted hover:text-white'}`}
                    >
                        <Bell size={20} />
                        {hasUnread && (
                            <span className="absolute top-1 right-1 w-2 h-2 bg-pulsar-danger rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]"></span>
                        )}
                    </button>

                    {/* Notification Panel */}
                    {showNotifications && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)}></div>
                            <div className="absolute right-0 top-full mt-2 w-80 bg-[#0f1117] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                <div className="p-4 border-b border-white/10 flex justify-between items-center text-white/50 bg-black/20">
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-white">Latest Proposals</h3>
                                    {hasUnread && (
                                        <button 
                                            onClick={handleMarkAsRead}
                                            className="text-[10px] text-pulsar-primary hover:underline cursor-pointer flex items-center gap-1"
                                        >
                                            <Check size={10} /> Mark read
                                        </button>
                                    )}
                                </div>
                                <div className="max-h-64 overflow-y-auto">
                                    {notifications.length > 0 ? (
                                        notifications.map(n => (
                                            <a key={n.id} href={`/proposal/${n.id}`} className="block p-4 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 group">
                                                <div className="flex justify-between items-start mb-1">
                                                    <span className="text-xs font-mono text-pulsar-muted">Proposal #{n.id}</span>
                                                    {n.isNew && <span className="w-1.5 h-1.5 bg-pulsar-primary rounded-full shadow-[0_0_5px_rgba(20,241,149,0.5)]"></span>}
                                                </div>
                                                <p className={`text-sm line-clamp-2 ${n.isNew ? 'text-white font-medium' : 'text-gray-400'}`}>
                                                    {n.title}
                                                </p>
                                            </a>
                                        ))
                                    ) : (
                                        <div className="p-8 text-center text-gray-500 text-xs">
                                            No proposals found.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
                
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
