import React, { useEffect, useState } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { Link } from 'react-router-dom';
import { PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import {
  CircularProgress,
  Typography,
} from '@mui/material';
import {
  program,
  programId,
  globalAccountPDAAddress, 
  globalStateSeed,
  proposalSeed,
  delegationRecordSeed,
  delegateProfileSeed,
} from '../config';
import Star from './Star';
import { ArrowRight, Users } from 'lucide-react';

const Home = () => {
  const { connection } = useConnection();
  const { connected, publicKey, sendTransaction } = useWallet();

  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(false);
  
  const [proposalsCounter, setProposalsCounter] = useState(0);
  const [admin, setAdmin] = useState(null);
  
  const [votingPower, setVotingPower] = useState(0);
  const [delegatedPower, setDelegatedPower] = useState(0); // Power delegated TO me
  const [delegatedTo, setDelegatedTo] = useState(null); 
  const [isDidDelegate, setIsDidDelegate] = useState(false); // Am I a delegate?
  const [tokenMint, setTokenMint] = useState(null);
  const [stats, setStats] = useState({ liquid: 0, staked: 0, multiplier: 1 });
  const [globalError, setGlobalError] = useState(null);
  const [activeTab, setActiveTab] = useState('active');


  const STAKE_RECORD_SEED = "stake_record";

  // --- FETCH LOGIC ---
  useEffect(() => {
    const fetchAllData = async () => {
       try {
           // 1. Fetch Global Account (Mint & Config)
           // Use wallet if connected, otherwise read-only logic handled by program() wrapper
           const votingProgram = program({ publicKey: publicKey || null });
           
           // Re-derive global address to be 100% sure we match the imported programId
           const [globalAccountPDA] = PublicKey.findProgramAddressSync([Buffer.from(globalStateSeed)], programId);
           
           let mintAddr = null;
           try {
               const globalAccount = await votingProgram.account.globalAccount.fetch(globalAccountPDA);
               mintAddr = globalAccount.tokenMint ? globalAccount.tokenMint.toString() : null;
               setTokenMint(mintAddr);
               
               // Global Stats
               // Ensure properties exist before accessing (IDL sync safety)
               const counterBN = globalAccount.proposalCount;
               const fetchedCounter = counterBN ? Number(counterBN.toString()) : 0;
               if (fetchedCounter !== proposalsCounter) setProposalsCounter(fetchedCounter);
               
               setAdmin(globalAccount.admin ? globalAccount.admin.toString() : null);
               setGlobalError(null);

           } catch(e) {
               console.error("Home: Error fetching global", e);
               // If global fetch fails, we can't do much. 
               // Might not be initialized yet.
               setGlobalError("DAO not initialized or Network Error");
               setTokenMint(null);
               return; 
           }

           // 2. Fetch User Voting Power (if connected && mint exists)
           if (publicKey && mintAddr) {
               let liquidAmount = 0;
               let stakedAmount = 0;
               let multiplier = 1;

               // A. Liquid Tokens
               try {
                   const ata = await getAssociatedTokenAddress(new PublicKey(mintAddr), publicKey);
                   const accountInfo = await getAccount(connection, ata);
                   liquidAmount = Number(accountInfo.amount);
               } catch(e) { /* No tokens or account not found -> 0 */ }

               // B. Staked Tokens
               try {
                   const [stakeRecordPDA] = PublicKey.findProgramAddressSync(
                        [Buffer.from(STAKE_RECORD_SEED), publicKey.toBuffer()],
                        programId
                    );
                    const record = await votingProgram.account.voterStakeRecord.fetch(stakeRecordPDA);
                    stakedAmount = record.stakedAmount.toNumber();
                    multiplier = record.multiplier.toNumber();
               } catch(e) { /* No stake record -> 0 */ }
               
               // Match Rust: floor(sqrt(liquid)) + floor(sqrt(staked)) * multiplier
               const totalVP = Math.floor(Math.sqrt(liquidAmount)) + Math.floor(Math.sqrt(stakedAmount)) * multiplier;
               setVotingPower(totalVP);
               setStats({ liquid: liquidAmount, staked: stakedAmount, multiplier });

                // C. Check Delegation Logic
                try {
                   const [delegationRecordPDA] = PublicKey.findProgramAddressSync(
                       [Buffer.from(delegationRecordSeed), publicKey.toBuffer()],
                       programId
                   );
                   const record = await votingProgram.account.delegationRecord.fetch(delegationRecordPDA);
                   setDelegatedTo(record.delegateTarget.toString());
                } catch(e) {
                   setDelegatedTo(null);
                }

                // D. If I am a Delegate, calculate Delegated Power
                // 1. Check if I have a profile
                try {
                     const [myProfilePDA] = PublicKey.findProgramAddressSync(
                        [Buffer.from(delegateProfileSeed), publicKey.toBuffer()],
                        programId
                     );
                     const profile = await votingProgram.account.delegateProfile.fetch(myProfilePDA);
                     if (profile && profile.isActive) {
                         setIsDidDelegate(true);
                         
                         // 2. Find all my delegators
                         // Ideally use memcmp filter, but for now fetch all and filter JS side for simplicity/speed dev
                         const allRecords = await votingProgram.account.delegationRecord.all();
                         const myDelegators = allRecords.filter(r => r.account.delegateTarget.toString() === publicKey.toString());
                         
                         let totalDelegated = 0;
                         
                         // 3. For each delegator, calculate VP
                         // Parallelize for speed
                         await Promise.all(myDelegators.map(async (record) => {
                             const delegatorPubkey = record.account.delegator;
                             
                             // Get Liquid
                             let dLiquid = 0;
                             try {
                                 const dATA = await getAssociatedTokenAddress(new PublicKey(mintAddr), delegatorPubkey);
                                 const dBal = await connection.getTokenAccountBalance(dATA);
                                 dLiquid = dBal.value.uiAmount || 0;
                             } catch(e) {}
                             
                             // Get Staked
                             let dStaked = 0;
                             let dMult = 1;
                             try {
                                 const [dStakePDA] = PublicKey.findProgramAddressSync(
                                     [Buffer.from("stake_record"), delegatorPubkey.toBuffer()],
                                     programId
                                 );
                                 const dStake = await votingProgram.account.voterStakeRecord.fetch(dStakePDA);
                                 dStaked = parseFloat(dStake.stakedAmount.toString());
                                 dMult = parseFloat(dStake.multiplier.toString());
                             } catch(e) {}
                             
                             const dVP = Math.floor(Math.sqrt(dLiquid)) + Math.floor(Math.sqrt(dStaked)) * dMult;
                             totalDelegated += dVP;
                         }));
                         
                         setDelegatedPower(totalDelegated);
                     }
                } catch (e) {
                    setIsDidDelegate(false);
                }


            } else {
                setVotingPower(0);
                setDelegatedTo(null);
                setStats({ liquid: 0, staked: 0, multiplier: 1 });
            }

           // 3. Fetch Proposals
           if (proposalsCounter > 0) {
              await fetchProposalsList(proposalsCounter);
           } else if (proposalsCounter === 0) {
              setProposals([]);
           }

       } catch(e) {
           console.error("Home: Critical error in fetch loop", e);
       }
    };

    fetchAllData();
    
    // Auto-refresh every 10s
    const interval = setInterval(fetchAllData, 10000);
    return () => clearInterval(interval);
  }, [publicKey, proposalsCounter, connection]); 


  // --- HELPER: Fetch Proposals List ---
  const fetchProposalsList = async (count) => {
    try {
      const votingProgram = program({ publicKey: null });
      const foundProposals = [];

      // Iterate backwards to show newest first? Or loop 1..count. 
      // Loop 1 to count.
      for (let i = 1; i <= count; i++) {
        const [proposalPDAAddress] = await PublicKey.findProgramAddress(
          [Buffer.from(proposalSeed), Buffer.from(toLittleEndian8Bytes(i))],
          programId
        );

        try {
          const proposalAccount = await votingProgram.account.proposalAccount.fetch(proposalPDAAddress);
          if (proposalAccount) {
            foundProposals.push({
              number: i,
              question: proposalAccount.question.toString(),
              totalVotes: Number(proposalAccount.yes.toString()) + Number(proposalAccount.no.toString()),
              deadline: Number(proposalAccount.deadline.toString()),
              deadlineRaw: proposalAccount.deadline.toString(), // Debug
              pda: proposalPDAAddress.toBase58(),
            });
          }
        } catch (e) { /* skip */ }
      }

      // Sort by number descending (newest first)
      foundProposals.sort((a, b) => b.number - a.number);

      if (JSON.stringify(foundProposals) !== JSON.stringify(proposals)) {
        setProposals(foundProposals);
      }
    } catch (error) {
      console.error('Error fetching proposals list:', error);
    }
  };

  function toLittleEndian8Bytes(num) {
    const buffer = Buffer.alloc(8);
    buffer.writeUInt32LE(num, 0);
    return buffer;
  }


  // --- ACTIONS ---


  // The toggleVoteUpdates function and its related state (togglingVoteUpdates) have been removed as per the instruction.


  // --- RENDER ---
  return (
    <div className="space-y-8 p-8 max-w-7xl mx-auto"> 
      {/* 
          Removed ml-64 as DashboardLayout already handles content offset.
      */}

      {/* Top Row: Voting Power & Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Voting Power Star - LEFT */}
        <div className="glass-card bg-card-nebula rounded-2xl p-8 relative overflow-hidden flex flex-col items-center justify-center min-h-[400px] border border-white/5">
            <Star className="w-96 h-96">
                <div className="flex flex-col items-center justify-center pt-6">
                    <p className="text-gray-300 font-sans text-2xl mb-2 mt-4 tracking-wide font-medium uppercase">Voting Power</p>
                    <h3 className="text-4xl font-sans font-bold text-white mb-2 tracking-tight drop-shadow-lg">
                        {votingPower.toLocaleString()}
                    </h3>
                    <p className="text-pulsar-primary font-sans font-bold tracking-widest text-2xl">VOTES</p>

                    
                </div>
            </Star>
            
            {isDidDelegate && delegatedPower > 0 && (
                <div className="mt-4 px-4 py-2 bg-[#14F195]/10 rounded-full border border-[#14F195]/20 z-10">
                     <p className="text-sm text-[#14F195] flex items-center gap-2 font-bold">
                         <Users size={16} />
                         + {delegatedPower.toLocaleString()} from Community
                     </p>
                </div>
            )}
        </div>

        {/* Breakdown Stats - RIGHT (Replcaing Chart) */}
        <div className="glass-card bg-card-nebula rounded-2xl p-8 relative overflow-hidden min-h-[400px] flex flex-col justify-center border border-white/5">
            <h3 className="text-xl font-display text-white mb-8 border-b border-white/10 pb-4">Power Breakdown</h3>
            
            <div className="space-y-8">
                {/* Liquid Stats */}
                <div className="flex items-center justify-between group">
                    <div>
                        <p className="text-pulsar-muted text-sm uppercase tracking-wider mb-1">Liquid Tokens</p>
                        <p className="text-2xl text-white font-mono">{stats.liquid.toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-pulsar-secondary text-sm font-bold">Base Power</p>
                        <p className="text-white text-lg font-mono">
                           <span className="text-gray-500 text-sm">√{stats.liquid} ≈</span> {Math.floor(Math.sqrt(stats.liquid))}
                        </p>
                    </div>
                </div>

                {/* Staked Stats */}
                <div className="flex items-center justify-between group">
                    <div>
                        <p className="text-pulsar-muted text-sm uppercase tracking-wider mb-1">Staked Tokens</p>
                        <div className="flex items-center gap-2">
                            <p className="text-2xl text-white font-mono">{stats.staked.toLocaleString()}</p>
                            {stats.staked > 0 ? (
                                <span className="bg-pulsar-primary/20 text-pulsar-primary text-xs px-2 py-1 rounded border border-pulsar-primary/30">
                                    {stats.multiplier}x Boost
                                </span>
                            ) : (
                                <span className="bg-white/5 text-gray-500 text-xs px-2 py-1 rounded border border-white/10">
                                    No Boost
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="text-emerald-400 text-sm font-bold">Staked Power</p>
                        <p className="text-white text-lg font-mono">
                           <span className="text-gray-500 text-sm">√{stats.staked} × {stats.staked > 0 ? stats.multiplier : 1} ≈</span> {Math.floor(Math.sqrt(stats.staked)) * (stats.staked > 0 ? stats.multiplier : 1)}
                        </p>
                    </div>
                </div>

                {/* Total Summary */}
                <div className="mt-4 pt-6 border-t border-white/10">
                    <div className="flex justify-between items-center bg-white/5 p-4 rounded-xl border border-white/5">
                        <span className="text-gray-400 font-medium">Total Hybrid Power</span>
                        <span className="text-3xl font-bold text-white text-glow">{votingPower}</span>
                    </div>
                </div>
            </div>
        </div>
      </div>

      {/* Active Proposals Section */}
      <div>
        <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
            
            {/* Tabs */}
            <div className="flex bg-black/20 p-1 rounded-xl border border-white/5">
                <button 
                    onClick={() => setActiveTab('active')}
                    className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'active' ? 'bg-pulsar-primary text-black shadow-[0_0_15px_rgba(20,241,149,0.3)]' : 'text-gray-400 hover:text-white'}`}
                >
                    Active Proposals
                </button>
                <button 
                    onClick={() => setActiveTab('ended')}
                    className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'ended' ? 'bg-white text-black shadow-[0_0_15px_rgba(255,255,255,0.3)]' : 'text-gray-400 hover:text-white'}`}
                >
                    Ended Proposals
                </button>
            </div>

            {/* Create Button - Open to all users (for testing purposes) */}
            {publicKey && (
                 <Link to="/create-proposal">
                    <button className="px-4 py-2 bg-gradient-to-r from-[#9945FF] to-[#14F195] text-white rounded-lg font-bold text-sm hover:shadow-[0_0_20px_rgba(153,69,255,0.5)] transition-all duration-300">
                        + Create Proposal
                    </button>
                </Link>
            )}
        </div>

        {(() => {
            const activeProposals = proposals.filter(p => Date.now() / 1000 < p.deadline);
            const endedProposals = proposals.filter(p => Date.now() / 1000 >= p.deadline);
            const displayedProposals = activeTab === 'active' ? activeProposals : endedProposals;

            if (loading) {
                return (
                  <div className="flex justify-center items-center h-32">
                    <CircularProgress sx={{ color: '#00f3ff' }} />
                  </div>
                );
            }

            if (displayedProposals.length === 0) {
               return (
                  <div className="text-center py-12 glass-panel rounded-xl border border-dashed border-white/10">
                    <Typography variant="h6" className="font-display text-pulsar-muted">
                      No {activeTab} proposals found.
                    </Typography>
                  </div>
               );
            }

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {displayedProposals.map((proposal, index) => {
                    const isActive = Date.now()/1000 < proposal.deadline;
                    return (
                      <div key={proposal.number} className={`glass-card bg-card-nebula rounded-xl p-6 border ${isActive ? 'border-white/5 hover:border-pulsar-primary/50' : 'border-white/5 opacity-75 hover:opacity-100'} transition-all duration-300 group relative flex flex-col h-full`}>
                        <div className={`absolute top-0 left-0 w-1 h-full bg-gradient-to-b ${isActive ? 'from-pulsar-primary' : 'from-gray-500'} to-transparent opacity-0 group-hover:opacity-100 transition-opacity`}></div>
                        
                        <div className="mb-4 flex justify-between items-center">
                            <span className="text-xs font-mono text-pulsar-muted">#{proposal.number}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${isActive ? 'text-green-400 bg-green-500/10 border-green-500/30' : 'text-gray-400 bg-gray-500/10 border-gray-500/30'}`}>
                                {isActive ? 'ACTIVE' : 'ENDED'}
                            </span>
                        </div>

                        <h4 className="text-lg font-display font-bold text-white mb-2 line-clamp-3">
                            {proposal.question}
                        </h4>
                        
                        <div className="mb-6 flex-1">
                             <div className="text-xs text-pulsar-muted flex justify-between mb-1">
                                <span>Deadline</span>
                                <span>{new Date(proposal.deadline * 1000).toLocaleDateString()}</span>
                             </div>
                             <div className="text-xs text-pulsar-muted flex justify-between">
                                <span>Total Votes</span>
                                <span className="text-white font-mono">{proposal.totalVotes.toLocaleString()}</span>
                             </div>
                        </div>

                        {/* Details Link */}
                        <div className="mt-auto pt-6 border-t border-white/5">
                             <Link to={`/proposal/${proposal.number}`} className="w-full flex items-center justify-center gap-2 py-3 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 rounded-lg text-white font-bold transition-all group">
                                 View Details <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform"/>
                             </Link>
                        </div>
                      </div>
                    );
                })}
              </div>
            );
        })()}
      </div>

      {/* Admin Controls Moved to DAO Admin */}
    </div>
  );
};

export default Home;
