import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { program, programId, globalAccountPDAAddress, delegateProfileSeed, delegationRecordSeed } from '../config';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { Shield, User, Award, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import * as anchor from "@coral-xyz/anchor";

const DelegationPage = () => {
  const wallet = useWallet();
  const { publicKey } = wallet;
  
  const [isAdmin, setIsAdmin] = useState(false);
  const [delegates, setDelegates] = useState([]);
  const [myDelegate, setMyDelegate] = useState(null);
  const [isDelegateMyself, setIsDelegateMyself] = useState(false); // Track if I am a delegate
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // 1. Check Admin & Fetch Data
  useEffect(() => {
    const fetchData = async () => {
        setLoading(true);
        try {
            const daoProgram = program(wallet.publicKey ? wallet : { publicKey: null });

            // A. Check Admin
            if (publicKey) {
                const globalAccount = await daoProgram.account.globalAccount.fetch(globalAccountPDAAddress);
                setIsAdmin(globalAccount.admin.toString() === publicKey.toString());
            }

            // B. Fetch All Delegate Profiles
            // We use getProgramAccounts to find all accounts of type DelegateProfile
            // Filter: Discriminator (handled by fetch) -> actually raw fetch needed for "all" often, 
            // but Anchor provides .all() if we have the type.
            const allProfiles = await daoProgram.account.delegateProfile.all();
            const activeDelegates = allProfiles.filter(p => p.account.isActive).map(p => ({
                pubkey: p.account.authority,
                address: p.account.authority.toString(),
                pda: p.publicKey
            }));
            setDelegates(activeDelegates);

            // C. Check My Delegation
            if (publicKey) {
                const [myRecordPDA] = PublicKey.findProgramAddressSync(
                    [Buffer.from(delegationRecordSeed), publicKey.toBuffer()],
                    programId
                );
                
                try {
                    const record = await daoProgram.account.delegationRecord.fetch(myRecordPDA);
                    setMyDelegate(record.delegateTarget.toString());
                } catch(e) {
                    setMyDelegate(null); // No delegation found
                }
            }

            // D. Check if I am a Delegate (Delegate Profile exists for me?)
            if (publicKey) {
                 const [myProfilePDA] = PublicKey.findProgramAddressSync(
                     [Buffer.from(delegateProfileSeed), publicKey.toBuffer()],
                     programId
                 );
                 try {
                     const profile = await daoProgram.account.delegateProfile.fetch(myProfilePDA);
                     if (profile.isActive) setIsDelegateMyself(true);
                 } catch(e) {
                     setIsDelegateMyself(false);
                 }
            }

        } catch(e) {
            console.error("Error loading delegation data", e);
        } finally {
            setLoading(false);
        }
    };

    fetchData();
  }, [publicKey, wallet]); // Re-fetch on wallet change

  // Actions



  const handleRevokeDelegation = async () => {
    if (!publicKey) return;
    setActionLoading(true);
    try {
        const daoProgram = program(wallet);
        
        const [recordPDA] = PublicKey.findProgramAddressSync(
            [Buffer.from(delegationRecordSeed), publicKey.toBuffer()],
            programId
        );

        await daoProgram.methods.revokeDelegation()
          .accounts({
              delegationRecord: recordPDA,
              user: publicKey,
          })
          .rpc();
        
        setMyDelegate(null);
    } catch(e) {
       console.error("Revocation failed", e);
       alert("Failed: " + e.message);
    } finally {
        setActionLoading(false);
    }
  };

  const handleDelegateVote = async (targetAddr) => {
      if (!publicKey) return;
      setActionLoading(true);
      try {
          const daoProgram = program(wallet);
          const targetPubkey = new PublicKey(targetAddr);
          
          const [recordPDA] = PublicKey.findProgramAddressSync(
              [Buffer.from(delegationRecordSeed), publicKey.toBuffer()],
              programId
          );

          await daoProgram.methods.delegateVote()
            .accounts({
                delegationRecord: recordPDA,
                targetDelegate: targetPubkey,
                user: publicKey,
                systemProgram: SystemProgram.programId
            })
            .rpc();
          
          setMyDelegate(targetAddr);
      } catch(e) {
         console.error("Delegation failed", e);
         alert("Failed: " + e.message);
      } finally {
          setActionLoading(false);
      }
  };

  if (loading) {
      return (
          <div className="flex items-center justify-center h-96">
              <Loader2 className="animate-spin text-pulsar-primary" size={48} />
          </div>
      );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-display font-bold text-transparent bg-clip-text bg-gradient-to-r from-pulsar-primary to-blue-400">
            Liquid Delegation
          </h1>
          <p className="text-pulsar-muted mt-2">
            Empower trusted community members to vote on your behalf. You retain full ownership and can override their vote at any time.
          </p>
        </div>
        
        {myDelegate && (
             <div className="bg-pulsar-surface border border-pulsar-primary/30 px-6 py-3 rounded-xl flex items-center gap-3">
                 <div className="bg-pulsar-primary/20 p-2 rounded-full">
                     <Shield className="text-pulsar-primary" size={20} />
                 </div>
                 <div>
                     <div className="text-xs text-pulsar-muted uppercase font-bold">Currently Delegating To</div>
                     <div className="font-mono text-sm text-white">
                         {myDelegate.slice(0,4)}...{myDelegate.slice(-4)}
                     </div>
                 </div>
             </div>
        )}
      </div>



      {/* Delegates Grid */}
      <h2 className="text-2xl font-bold text-white mt-8">Active Delegates</h2>

      {isDelegateMyself && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 mb-6 flex items-center gap-3 text-amber-500">
               <AlertTriangle size={24} />
               <div>
                   <p className="font-bold">You are a Registered Delegate</p>
                   <p className="text-sm opacity-80">Delegates cannot delegate their vote to others. You must resign (Contact Admin) to delegate.</p>
               </div>
          </div>
      )}
      
      {!isDelegateMyself && (
        delegates.length === 0 ? (
          <div className="text-center py-20 bg-white/5 rounded-2xl border border-white/10 border-dashed">
              <User size={48} className="mx-auto text-white/20 mb-4" />
              <p className="text-gray-400">No active delegates found.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {delegates.map((d) => {
                  const isMyDelegate = myDelegate === d.address;
                  return (
                      <div key={d.address} className={`bg-pulsar-surface border ${isMyDelegate ? 'border-pulsar-primary shadow-[0_0_20px_rgba(20,241,149,0.1)]' : 'border-white/10'} p-6 rounded-2xl transition-all hover:border-white/20 relative group`}>
                          
                          <div className="flex items-center gap-4 mb-6">
                              <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold ${isMyDelegate ? 'bg-pulsar-primary text-black' : 'bg-white/10 text-white'}`}>
                                  {d.address.slice(0,2)}
                              </div>
                              <div>
                                  <div className="text-sm text-pulsar-muted">Delegate</div>
                                  <div className="font-mono text-white font-medium">
                                      {d.address.slice(0,6)}...{d.address.slice(-4)}
                                  </div>
                              </div>
                          </div>
                          
                          <div className="flex gap-3">
                              <button 
                                onClick={() => handleDelegateVote(d.address)}
                                disabled={actionLoading || isMyDelegate || isDelegateMyself}
                                className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${
                                    isMyDelegate 
                                    ? 'bg-pulsar-primary/20 text-pulsar-primary cursor-default'
                                    : 'bg-white/5 hover:bg-pulsar-primary hover:text-black text-white'
                                }`}
                              >
                                  {isMyDelegate ? (
                                      <span className="flex items-center justify-center gap-2">
                                          <CheckCircle size={16} /> Selected
                                      </span>
                                  ) : (
                                      "Delegate Vote"
                                  )}
                              </button>
                              
                              {isMyDelegate && (
                                  <button
                                      onClick={handleRevokeDelegation}
                                      disabled={actionLoading}
                                      className="p-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 transition-colors"
                                      title="Revoke Delegation"
                                  >
                                      <Shield size={20} className="stroke-[2.5]" />
                                  </button>
                              )}
                              

                              
                              <a 
                                href={`https://explorer.solana.com/address/${d.address}?cluster=devnet`}
                                target="_blank"
                                rel="noreferrer"
                                className="p-3 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                              >
                                  <User size={20} />
                              </a>
                          </div>
                      </div>
                  );
              })}
          </div>
        ) : null
      )}
    </div>
  );
};

export default DelegationPage;
