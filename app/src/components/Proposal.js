import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { CheckCircle, XCircle, ArrowLeft, Clock, Vote, AlertTriangle, Loader2 } from 'lucide-react';
import { program, programId, proposalSeed, globalStateSeed } from '../config';

const STAKE_RECORD_SEED = "stake_record";

function toLittleEndian8Bytes(num) {
    const buffer = Buffer.alloc(8);
    buffer.writeUInt32LE(num, 0);
    return buffer;
}

const Proposal = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { publicKey, sendTransaction } = useWallet();
    const { connection } = useConnection();
    
    const [proposal, setProposal] = useState(null);
    const [loading, setLoading] = useState(true);
    const [votingLoading, setVotingLoading] = useState(false);
    const [tokenMint, setTokenMint] = useState(null);
    const [votingPower, setVotingPower] = useState(null);
    const [systemEnabled, setSystemEnabled] = useState(true);
    const [userVoterInfo, setUserVoterInfo] = useState(null); // { voted: bool, vote: bool }

    // Calculate User Voting Power
    useEffect(() => {
        if(!publicKey || !tokenMint) return;
        
        const fetchVP = async () => {
            try {
                 // 1. Liquid Pwer
                 let liquidAmount = 0;
                 try {
                    const userATA = await getAssociatedTokenAddress(new PublicKey(tokenMint), publicKey);
                    const bal = await connection.getTokenAccountBalance(userATA);
                    liquidAmount = bal.value.uiAmount || 0;
                 } catch(e) {}
                 
                 // 2. Staked Power
                 let stakedAmount = 0;
                 let multiplier = 1;
                 try {
                     const votingProgram = program({ publicKey }); 
                     const [stakeRecordPDA] = PublicKey.findProgramAddressSync(
                        [Buffer.from(STAKE_RECORD_SEED), publicKey.toBuffer()],
                        programId
                     );
                     const record = await votingProgram.account.voterStakeRecord.fetch(stakeRecordPDA);
                     stakedAmount = parseFloat(record.stakedAmount.toString());
                     multiplier = parseFloat(record.multiplier.toString());
                 } catch(e) {}
                 
                 const liquidPower = Math.sqrt(liquidAmount);
                 const stakedPower = Math.sqrt(stakedAmount) * multiplier;
                 setVotingPower(Math.round(liquidPower + stakedPower));
                 
            } catch(e) { console.error("Error fetching VP", e); }
        };
        fetchVP();
        const interval = setInterval(fetchVP, 10000); // Poll VP
        return () => clearInterval(interval);
    }, [publicKey, tokenMint, connection]);

    // Fetch Logic
    useEffect(() => {
        const fetchProposal = async () => {
            try {
                const votingProgram = program({ publicKey: null });
                
                // Get Token Mint first for voting checks
                // Need global state for mint
                const [globalAccountPDA] = PublicKey.findProgramAddressSync([Buffer.from(globalStateSeed)], programId);
                let globalAccount = null;
                try {
                    globalAccount = await votingProgram.account.globalAccount.fetch(globalAccountPDA);
                    setTokenMint(globalAccount.tokenMint.toString());
                    if (globalAccount.systemEnabled !== undefined) {
                         setSystemEnabled(globalAccount.systemEnabled);
                    }
                } catch(e) {
                    console.log("DAO not initialized yet");
                }

                // Derive Proposal PDA
                const proposalNumber = Number(id);
                const [proposalPDAAddress] = PublicKey.findProgramAddressSync(
                    [Buffer.from(proposalSeed), Buffer.from(toLittleEndian8Bytes(proposalNumber))],
                    programId
                );

                const proposalAccount = await votingProgram.account.proposalAccount.fetch(proposalPDAAddress);
                
                setProposal({
                    number: proposalNumber,
                    question: proposalAccount.question.toString(),
                    yes: Number(proposalAccount.yes.toString()),
                    no: Number(proposalAccount.no.toString()),
                    deadline: Number(proposalAccount.deadline.toString()),
                    pda: proposalPDAAddress.toBase58(),
                    isActive: true 
                });

                // Fetch User Vote Status
                if (publicKey) {
                     const [voterRecordPDA] = PublicKey.findProgramAddressSync(
                        [Buffer.from('voter'), proposalPDAAddress.toBuffer(), publicKey.toBuffer()],
                        programId
                    );
                    try {
                        const record = await votingProgram.account.voterRecord.fetch(voterRecordPDA);
                        setUserVoterInfo({ voted: record.voted, vote: record.vote });
                    } catch (err) {
                        setUserVoterInfo(null);
                    }
                }

            } catch(e) {
                console.error("Error fetching proposal:", e);
                // If not found, proposal stays null
            } finally {
                setLoading(false);
            }
        };

        fetchProposal();
        // Poll every 5s for live updates
        const interval = setInterval(fetchProposal, 5000);
        return () => clearInterval(interval);
    }, [id]);

    // Countdown Timer
    const [timeLeft, setTimeLeft] = useState('');
    useEffect(() => {
        if (!proposal) return;
        
        const updateTimer = () => {
            const now = Math.floor(Date.now() / 1000);
            const diff = proposal.deadline - now;
            
            if (diff <= 0) {
                setTimeLeft('Ended');
                return;
            }
            
            const days = Math.floor(diff / 86400);
            const hours = Math.floor((diff % 86400) / 3600);
            const minutes = Math.floor((diff % 3600) / 60);
            const seconds = diff % 60;
            
            setTimeLeft(`${days > 0 ? days + 'd ' : ''}${hours}h ${minutes}m ${seconds}s`);
        };
        
        updateTimer(); // Initial call
        const timer = setInterval(updateTimer, 1000);
        return () => clearInterval(timer);
    }, [proposal]);

    const [voteSuccess, setVoteSuccess] = useState(false);

    const handleVote = async (voteYes) => {
        if (!publicKey) return; 
        if (!tokenMint) {
            alert("DAO not initialized."); 
            return;
        }
    
        setVotingLoading(true);
        try {
            const votingProgram = program({ publicKey, sendTransaction });
            const proposalPubkey = new PublicKey(proposal.pda);
    
            const [voterRecordPDA] = PublicKey.findProgramAddressSync(
                [Buffer.from('voter'), proposalPubkey.toBuffer(), publicKey.toBuffer()],
                programId
            );
            const [stakeRecordPDA] = PublicKey.findProgramAddressSync(
                [Buffer.from(STAKE_RECORD_SEED), publicKey.toBuffer()],
                programId
            );
            
            const [globalAccountPDA] = PublicKey.findProgramAddressSync([Buffer.from(globalStateSeed)], programId);
            const userATA = await getAssociatedTokenAddress(new PublicKey(tokenMint), publicKey);
    
            let validStakeRecord = null;
            try {
                const info = await connection.getAccountInfo(stakeRecordPDA);
                if (info) validStakeRecord = stakeRecordPDA;
            } catch(e) {}

            const transaction = await votingProgram.methods
                .vote(voteYes)
                .accounts({
                    globalAccount: globalAccountPDA,
                    proposalAccount: proposalPubkey,
                    voterRecord: voterRecordPDA,
                    stakeRecord: validStakeRecord,
                    userTokenAccount: userATA,
                    user: publicKey,
                })
                .transaction();
            
            const signature = await sendTransaction(transaction, connection);
            await connection.confirmTransaction(signature, 'finalized');
            
            setVotingLoading(false);
            setVoteSuccess(true);
            setTimeout(() => setVoteSuccess(false), 2000);
            
            // Optimistic Update
            setUserVoterInfo({ voted: true, vote: voteYes });

        } catch (e) {
            console.error("Vote Error:", e);
            setVotingLoading(false);
             if (e.message.includes("Account does not exist") || e.message.includes("Constraint")) {
                 alert("Vote Failed. Stake or check requirements.");
             } else {
                 alert("Vote Failed: " + e.message);
             }
        }
    };

    const handleWithdrawVote = async () => {
        if (!publicKey) return;
        setVotingLoading(true);
        try {
            const votingProgram = program({ publicKey, sendTransaction });
            const proposalPubkey = new PublicKey(proposal.pda);
            const [voterRecordPDA] = PublicKey.findProgramAddressSync(
                [Buffer.from('voter'), proposalPubkey.toBuffer(), publicKey.toBuffer()],
                programId
            );
            const [globalAccountPDA] = PublicKey.findProgramAddressSync([Buffer.from(globalStateSeed)], programId);

            const tx = await votingProgram.methods
                .withdrawVote()
                .accounts({
                    globalAccount: globalAccountPDA,
                    proposalAccount: proposalPubkey,
                    voterRecord: voterRecordPDA,
                    user: publicKey,
                })
                .transaction();

            const signature = await sendTransaction(tx, connection);
            await connection.confirmTransaction(signature, 'finalized');

            setVotingLoading(false);
            setVoteSuccess(true); // Maybe different icon?
            setTimeout(() => setVoteSuccess(false), 2000);
            
            setUserVoterInfo(prev => ({ ...prev, voted: false }));

        } catch (e) {
             console.error("Withdraw Error:", e);
             setVotingLoading(false);
             alert("Failed to withdraw vote: " + e.message);
        }
    };

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center">
            <Loader2 className="w-12 h-12 text-[#14F195] animate-spin" />
        </div>
    );

    if (!proposal) return (
        <div className="min-h-screen flex flex-col items-center justify-center text-white">
            <h2 className="text-2xl font-bold mb-4">Proposal Not Found</h2>
            <button onClick={() => navigate('/')} className="text-[#14F195] hover:underline">Back to Dashboard</button>
        </div>
    );

    const isActive = Date.now()/1000 < proposal.deadline;
    const totalVotes = proposal.yes + proposal.no;
    // Calculate percentages
    const yesPercent = totalVotes > 0 ? (proposal.yes / totalVotes) * 100 : 0;
    const noPercent = totalVotes > 0 ? (proposal.no / totalVotes) * 100 : 0;

    // Hooks moved top

    return (
        <div className="max-w-4xl mx-auto p-8 relative pt-12">
           {/* Back Button */}
           <button onClick={() => navigate('/')} className="flex items-center text-gray-400 hover:text-white mb-6 transition-colors self-start">
              <ArrowLeft size={20} className="mr-2"/> Back to Dashboard
           </button>

           <div className="glass-card bg-[#0f1117]/80 backdrop-blur-xl rounded-2xl p-10 border border-white/10 shadow-2xl relative overflow-hidden">
               
               {/* Voting Overlay */}
               {(votingLoading || voteSuccess) && (
                  <div className="absolute inset-0 bg-black/80 backdrop-blur-md z-50 flex flex-col items-center justify-center animate-in fade-in duration-300">
                      {voteSuccess ? (
                          <>
                            <CheckCircle className="w-16 h-16 text-[#14F195] mb-6 animate-bounce" />
                            <h3 className="text-2xl font-bold text-white mb-2 tracking-wide">Vote Confirmed!</h3>
                          </>
                      ) : (
                          <>
                            <Loader2 className="w-16 h-16 text-[#14F195] animate-spin mb-6" />
                            <h3 className="text-2xl font-bold text-white mb-2 tracking-wide">Confirming Vote</h3>
                            <p className="text-gray-400 text-sm animate-pulse">Please wait for transaction...</p>
                          </>
                      )}
                  </div>
               )}

               {/* Background Glow */}
               <div className="absolute top-0 right-0 w-64 h-64 bg-pulsar-primary/10 blur-[100px] rounded-full pointer-events-none"></div>

               {/* Header */}
               <div className="flex justify-between items-start mb-8 relative z-10">
                   <div>
                       <span className="text-pulsar-primary/80 font-mono text-xs tracking-widest mb-2 block uppercase">Proposal #{proposal.number}</span>
                       <h1 className="text-4xl font-display font-medium text-white leading-tight max-w-2xl">{proposal.question}</h1>
                   </div>
                   <div className={`px-4 py-1.5 rounded-full border text-xs font-bold tracking-wider flex items-center gap-2 ${isActive ? 'bg-green-500/10 text-green-400 border-green-500/20 shadow-[0_0_10px_rgba(74,222,128,0.2)]' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>
                       <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-400 animate-pulse' : 'bg-red-500'}`}></div>
                       {isActive ? 'ACTIVE' : 'ENDED'}
                   </div>
               </div>

               {/* Stats Grid */}
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10 relative z-10">
                    {/* Deadline */}
                    <div className="bg-white/5 rounded-xl p-5 border border-white/5 flex items-center gap-4">
                         <div className="p-3 bg-white/5 rounded-lg text-pulsar-primary">
                             <Clock size={24}/> 
                         </div>
                         <div>
                             <div className="text-gray-400 text-xs uppercase tracking-wider mb-1">Deadline</div>
                             <div className="text-xl text-white font-mono font-medium">
                                {new Date(proposal.deadline * 1000).toLocaleDateString()} <span className="text-sm text-gray-500">{new Date(proposal.deadline * 1000).toLocaleTimeString()}</span>
                             </div>
                             {isActive && (
                                 <div className="text-sm text-emerald-400 font-bold font-mono mt-1 animate-pulse">
                                     Ends in: {timeLeft}
                                 </div>
                             )}
                         </div>
                    </div>
                    {/* Total Votes */}
                    <div className="bg-white/5 rounded-xl p-5 border border-white/5 flex items-center gap-4">
                         <div className="p-3 bg-white/5 rounded-lg text-purple-400">
                             <Vote size={24}/> 
                         </div>
                         <div>
                             <div className="text-gray-400 text-xs uppercase tracking-wider mb-1">Total Votes</div>
                             <div className="text-xl text-white font-mono font-medium">
                                {Number(totalVotes).toLocaleString()}
                             </div>
                         </div>
                    </div>
               </div>

               {/* Results Bar */}
               <div className="mb-8 relative z-10">
                   <div className="flex justify-between text-sm mb-3">
                       <span className="text-emerald-400 font-bold flex items-center gap-2"><CheckCircle size={14}/> YES <span className="text-white/60 font-normal">({proposal.yes})</span></span>
                       <span className="text-red-400 font-bold flex items-center gap-2">NO <span className="text-white/60 font-normal">({proposal.no})</span> <XCircle size={14}/></span>
                   </div>
                   <div className="h-6 bg-black/40 rounded-full overflow-hidden flex relative border border-white/5">
                        {totalVotes === 0 && <div className="absolute inset-0 flex items-center justify-center text-[10px] text-gray-600 font-mono">NO VOTES YET</div>}
                       <div style={{ width: `${yesPercent}%` }} className="bg-gradient-to-r from-emerald-600 to-emerald-400 h-full transition-all duration-1000 ease-out" />
                       <div style={{ width: `${noPercent}%` }} className="bg-gradient-to-r from-red-500 to-red-600 h-full transition-all duration-1000 ease-out" />
                   </div>
               </div>
               
               {/* User VP Display */}
               {publicKey && isActive && (
                   <div className="flex justify-center mb-8 relative z-10">
                        <div className="px-6 py-2 bg-white/5 border border-white/10 rounded-full flex items-center gap-3">
                             <span className="text-gray-400 text-sm font-medium">Your Voting Power:</span>
                             <span className="text-2xl font-bold font-display text-white text-glow">
                                {votingPower !== null ? votingPower.toLocaleString() : '...'} ⚡
                             </span>
                        </div>
                   </div>
               )}

               {/* Vote Actions */}
               {isActive ? (
                   <div className="grid grid-cols-2 gap-6 relative z-10">
                        {/* System Offline Warning */}
                        {!systemEnabled && (
                            <div className="col-span-2 bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center gap-3 mb-2 animate-pulse">
                                <AlertTriangle className="text-red-500 w-6 h-6" />
                                <span className="text-red-400 font-bold text-sm">HEADS UP: Voting System is currently PAUSED for maintenance or security.</span>
                            </div>
                        )}
                        
                       <button 
                           onClick={() => handleVote(true)}
                           disabled={votingLoading || !publicKey || !systemEnabled || (userVoterInfo?.voted && userVoterInfo?.vote === true)}
                           className={`group relative overflow-hidden rounded-xl p-6 transition-all duration-300 border ${
                               !systemEnabled || (userVoterInfo?.voted && userVoterInfo?.vote === true)
                               ? 'bg-gray-800/50 border-gray-700 cursor-not-allowed opacity-50' 
                               : 'bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20 hover:border-emerald-500/40 hover:scale-[1.02] active:scale-[0.98]'
                           }`}
                       >
                           <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/0 via-emerald-500/0 to-emerald-500/5 group-hover:to-emerald-500/10 transition-all duration-500"></div>
                           
                           <div className="relative z-10 flex flex-col items-center gap-3">
                               <div className={`p-4 rounded-full transition-colors ${!systemEnabled ? 'bg-gray-700 text-gray-400' : (userVoterInfo?.voted && userVoterInfo?.vote === true ? 'bg-emerald-500 text-black' : 'bg-emerald-500/20 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-black')}`}>
                                   <CheckCircle size={32} />
                               </div>
                               <span className={`font-display font-bold text-lg tracking-wider ${!systemEnabled ? 'text-gray-500' : 'text-white'}`}>
                                   {userVoterInfo?.voted && userVoterInfo?.vote === true ? 'VOTED YES' : (userVoterInfo?.voted ? 'SWITCH TO YES' : 'VOTE YES')}
                               </span>
                           </div>
                       </button>

                       <button 
                           onClick={() => handleVote(false)}
                           disabled={votingLoading || !publicKey || !systemEnabled || (userVoterInfo?.voted && userVoterInfo?.vote === false)}
                           className={`group relative overflow-hidden rounded-xl p-6 transition-all duration-300 border ${
                               !systemEnabled || (userVoterInfo?.voted && userVoterInfo?.vote === false)
                               ? 'bg-gray-800/50 border-gray-700 cursor-not-allowed opacity-50' 
                               : 'bg-red-500/10 border-red-500/20 hover:bg-red-500/20 hover:border-red-500/40 hover:scale-[1.02] active:scale-[0.98]'
                           }`}
                       >
                           <div className="absolute inset-0 bg-gradient-to-br from-red-500/0 via-red-500/0 to-red-500/5 group-hover:to-red-500/10 transition-all duration-500"></div>
                           
                           <div className="relative z-10 flex flex-col items-center gap-3">
                               <div className={`p-4 rounded-full transition-colors ${!systemEnabled ? 'bg-gray-700 text-gray-400' : (userVoterInfo?.voted && userVoterInfo?.vote === false ? 'bg-red-500 text-black' : 'bg-red-500/20 text-red-500 group-hover:bg-red-500 group-hover:text-black')}`}>
                                   <XCircle size={32} />
                               </div>
                               <span className={`font-display font-bold text-lg tracking-wider ${!systemEnabled ? 'text-gray-500' : 'text-white'}`}>
                                   {userVoterInfo?.voted && userVoterInfo?.vote === false ? 'VOTED NO' : (userVoterInfo?.voted ? 'SWITCH TO NO' : 'VOTE NO')}
                               </span>
                           </div>
                       </button>
                       
                        {/* WITHDRAW VOTE BUTTON */}
                       {userVoterInfo?.voted && (
                           <div className="col-span-2 flex justify-center mt-2">
                               <button 
                                   onClick={handleWithdrawVote}
                                   disabled={votingLoading || !systemEnabled}
                                   className="text-gray-400 text-sm hover:text-red-400 underline transition-colors"
                               >
                                   Retract / Withdraw my vote
                               </button>
                           </div>
                       )}
                   </div>
               ) : (
                   <div className="text-center p-6 bg-white/5 rounded-xl border border-white/5 relative z-10">
                       <p className="text-gray-400 flex items-center justify-center gap-2"><AlertTriangle size={16}/> Voting for this proposal has ended.</p>
                   </div>
               )}
           </div>
        </div>
    );
};

export default Proposal;
