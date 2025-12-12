import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { CheckCircle, XCircle, ArrowLeft, Clock, Vote, AlertTriangle, Loader2, Users, Lock, Coins, ExternalLink, Play, Undo2 } from 'lucide-react';
import { program, programId, proposalSeed, globalStateSeed, delegationRecordSeed, delegateProfileSeed, proposalEscrowSeed, userStatsSeed } from '../config';
import { BN } from 'bn.js';

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
    const [votingPower, setVotingPower] = useState(0);
    const [delegatedPower, setDelegatedPower] = useState(0); 
    const [delegatorsList, setDelegatorsList] = useState([]); // Store delegators for proxy voting
    const [delegatedTo, setDelegatedTo] = useState(null);
    const [systemEnabled, setSystemEnabled] = useState(true);
    const [userVoterInfo, setUserVoterInfo] = useState(null); // { voted: bool, vote: bool, votedByProxy: bool }
    
    // Treasury proposal state
    const [treasuryInfo, setTreasuryInfo] = useState(null);
    const [executingProposal, setExecutingProposal] = useState(false);
    const [escrowEmpty, setEscrowEmpty] = useState(false); // True if escrow has no tokens (transfer completed)
    const [escrowBalance, setEscrowBalance] = useState(0); // Current escrow balance
    const [timelockRemaining, setTimelockRemaining] = useState(null); // Seconds remaining for timelock

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
                 const votingProgram = program({ publicKey }); 
                 
                 try {
                     const [stakeRecordPDA] = PublicKey.findProgramAddressSync(
                        [Buffer.from(STAKE_RECORD_SEED), publicKey.toBuffer()],
                        programId
                     );
                     const record = await votingProgram.account.voterStakeRecord.fetch(stakeRecordPDA);
                     stakedAmount = parseFloat(record.stakedAmount.toString());
                     multiplier = parseFloat(record.multiplier.toString());
                 } catch(e) {}
                 
                 // Mimic Rust's integer arithmetic exactly: floor(sqrt(a)) + floor(sqrt(b)) * m
                 const liquidPower = Math.floor(Math.sqrt(liquidAmount));
                 const stakedPower = Math.floor(Math.sqrt(stakedAmount)) * multiplier;

                 setVotingPower(liquidPower + stakedPower);

                 // Check Delegation
                 try {
                     const [delegationRecordPDA] = PublicKey.findProgramAddressSync(
                        [Buffer.from(delegationRecordSeed), publicKey.toBuffer()],
                        programId
                     );
                     const record = await votingProgram.account.delegationRecord.fetch(delegationRecordPDA);
                     setDelegatedTo(record.delegateTarget.toString());
                 } catch(e) { setDelegatedTo(null); }

                  // Check if I am a Delegate & Calc Delegated Power
                   try {
                         const [myProfilePDA] = PublicKey.findProgramAddressSync(
                            [Buffer.from(delegateProfileSeed), publicKey.toBuffer()],
                            programId
                         );
                         const profile = await votingProgram.account.delegateProfile.fetch(myProfilePDA);
                         if (profile && profile.isActive) {
                             // Fetch Delegators
                             const allRecords = await votingProgram.account.delegationRecord.all();
                             const myDelegators = allRecords.filter(r => r.account.delegateTarget.toString() === publicKey.toString());
                             setDelegatorsList(myDelegators);
                             
                             let totalDelegated = 0;
                             await Promise.all(myDelegators.map(async (record) => {
                                 const delegatorPubkey = record.account.delegator;
                                 let dLiquid = 0;
                                 try {
                                     const dATA = await getAssociatedTokenAddress(new PublicKey(tokenMint), delegatorPubkey);
                                     const dBal = await connection.getTokenAccountBalance(dATA);
                                     dLiquid = dBal.value.uiAmount || 0;
                                 } catch(e) {}
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
                                 totalDelegated += Math.floor(Math.sqrt(dLiquid)) + Math.floor(Math.sqrt(dStaked)) * dMult;
                             }));
                             setDelegatedPower(totalDelegated);
                         }
                    } catch (e) {
                        setDelegatedPower(0);
                    }
                  
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
                    title: proposalAccount.title?.toString() || proposalAccount.description.toString(),
                    description: proposalAccount.description.toString(),
                    yes: Number(proposalAccount.yes.toString()),
                    no: Number(proposalAccount.no.toString()),
                    deadline: Number(proposalAccount.deadline.toString()),
                    pda: proposalPDAAddress.toBase58(),
                    isActive: true,
                    author: proposalAccount.author.toBase58(),
                });

                // Check if treasury proposal
                const proposalType = proposalAccount.proposalType;
                if (proposalType === 1) {
                    setTreasuryInfo({
                        transferAmount: Number(proposalAccount.transferAmount.toString()),
                        transferDestination: proposalAccount.transferDestination.toBase58(),
                        timelockSeconds: Number(proposalAccount.timelockSeconds.toString()),
                        executed: proposalAccount.executed,
                    });
                    
                    // Check escrow balance to verify transfer status
                    try {
                        const [escrowPDA] = PublicKey.findProgramAddressSync(
                            [Buffer.from(proposalEscrowSeed), Buffer.from(toLittleEndian8Bytes(proposalNumber))],
                            programId
                        );
                        const escrowBalanceResult = await connection.getTokenAccountBalance(escrowPDA);
                        const balance = Number(escrowBalanceResult.value.amount);
                        setEscrowBalance(balance);
                        setEscrowEmpty(balance === 0);
                    } catch (e) {
                        // Escrow account might not exist yet or was closed
                        setEscrowBalance(0);
                        setEscrowEmpty(true);
                    }
                } else {
                    setTreasuryInfo(null);
                }

                // Fetch User Vote Status
                if (publicKey) {
                     const [voterRecordPDA] = PublicKey.findProgramAddressSync(
                        [Buffer.from('voter'), proposalPDAAddress.toBuffer(), publicKey.toBuffer()],
                        programId
                    );
                    try {
                        const record = await votingProgram.account.voterRecord.fetch(voterRecordPDA);

                        const vp = record.votingPower ? record.votingPower.toString() : (record.voting_power ? record.voting_power.toString() : "0");
                        setUserVoterInfo({ 
                            voted: record.voted, 
                            vote: record.vote,
                            votedByProxy: record.votedByProxy ?? record.voted_by_proxy,
                            votingPower: vp
                        });
                    } catch (err) {
                        // If self-record fails/empty, check if we are a proxy who voted for delegators
                        // This block is for the DELEGATE, not the DELEGATOR.
                        // So, if the current user is a delegate, and they voted for their delegators,
                        // their own userVoterInfo should not reflect 'votedByProxy'.
                        // 'votedByProxy' is for the delegator whose vote was cast by someone else.
                        let foundProxyVoteForDelegator = false;
                        if (delegatorsList.length > 0) {
                             // This logic is primarily to show the delegate that *some* action happened.
                             // It doesn't mean *their* vote was cast by proxy.
                             // For now, we'll keep userVoterInfo null if no direct vote record for the delegate.
                             // The UI will handle showing delegated power separately.
                        }
                        
                        if (!foundProxyVoteForDelegator) setUserVoterInfo(null);
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
    }, [id, delegatorsList, votingPower]); // Add votingPower dependency to refresh proxy status check

    // Countdown Timer
    const [timeLeft, setTimeLeft] = useState('');
    
    // Auto-mark as read
    useEffect(() => {
        if (proposal && proposal.number) {
            const currentLast = parseInt(localStorage.getItem('pulsar_last_read_proposal') || '0');
            if (proposal.number > currentLast) {
                localStorage.setItem('pulsar_last_read_proposal', proposal.number.toString());
                window.dispatchEvent(new Event('pulsar-proposal-read'));
            }
        }
    }, [proposal]);

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
            const [globalAccountPDA] = PublicKey.findProgramAddressSync([Buffer.from(globalStateSeed)], programId);

            const transaction = new Transaction();
            let hasInstructions = false;

            // 1. Direct Vote (Only if user has power themselves)
            // Fixes "AccountNotInitialized" error for Delegates with 0 tokens
            if (votingPower > 0) {
                const [voterRecordPDA] = PublicKey.findProgramAddressSync(
                    [Buffer.from('voter'), proposalPubkey.toBuffer(), publicKey.toBuffer()],
                    programId
                );
                const [stakeRecordPDA] = PublicKey.findProgramAddressSync(
                    [Buffer.from(STAKE_RECORD_SEED), publicKey.toBuffer()],
                    programId
                );
                const userATA = await getAssociatedTokenAddress(new PublicKey(tokenMint), publicKey);

                // Check stake record existence
                let validStakeRecord = null;
                try {
                    const info = await connection.getAccountInfo(stakeRecordPDA);
                    if (info) validStakeRecord = stakeRecordPDA;
                } catch(e) {}

                const [delegationRecordPDA] = PublicKey.findProgramAddressSync(
                    [Buffer.from(delegationRecordSeed), publicKey.toBuffer()],
                    programId
                );

                const ix = await votingProgram.methods
                    .vote(voteYes)
                    .accounts({
                        globalAccount: globalAccountPDA,
                        proposalAccount: proposalPubkey,
                        voterRecord: voterRecordPDA,
                        stakeRecord: validStakeRecord,
                        userTokenAccount: userATA,
                        delegationRecord: delegationRecordPDA,
                        userStats: PublicKey.findProgramAddressSync([Buffer.from(userStatsSeed), publicKey.toBuffer()], programId)[0],
                        user: publicKey,
                    })
                    .instruction();
                
                transaction.add(ix);
                hasInstructions = true;
            }

            // 2. Proxy Votes (For each Delegator)
            if (delegatorsList.length > 0) {
                // Fetch Delegate Profile
                const [myProfilePDA] = PublicKey.findProgramAddressSync(
                     [Buffer.from(delegateProfileSeed), publicKey.toBuffer()],
                     programId
                );

                for (const dRecord of delegatorsList) {
                    const delegatorPubkey = dRecord.account.delegator;
                    
                    // Derivations
                    const [dDelegationRecordPDA] = PublicKey.findProgramAddressSync(
                        [Buffer.from(delegationRecordSeed), delegatorPubkey.toBuffer()],
                        programId
                    );
                    const [dVoterRecordPDA] = PublicKey.findProgramAddressSync(
                        [Buffer.from('voter'), proposalPubkey.toBuffer(), delegatorPubkey.toBuffer()],
                        programId
                    );
                    const [dStakeRecordPDA] = PublicKey.findProgramAddressSync(
                        [Buffer.from(STAKE_RECORD_SEED), delegatorPubkey.toBuffer()],
                        programId
                    );
                    
                    // Check if stake record exists on-chain
                    const stakeRecordInfo = await connection.getAccountInfo(dStakeRecordPDA);
                    const delegatorStakeRecordAccount = stakeRecordInfo ? dStakeRecordPDA : null;
                    
                    // Delegator Must Have an ATA for vote to count (Liquid Power)
                    const dATA = await getAssociatedTokenAddress(new PublicKey(tokenMint), delegatorPubkey);
                    
                    const proxyIx = await votingProgram.methods
                        .voteAsProxy(voteYes)
                        .accounts({
                            globalAccount: globalAccountPDA,
                            proposalAccount: proposalPubkey,
                            delegateProfile: myProfilePDA,
                            delegationRecord: dDelegationRecordPDA,
                            voterRecord: dVoterRecordPDA,
                            delegatorTokenAccount: dATA,
                            delegatorStakeRecord: delegatorStakeRecordAccount,
                            delegatorUser: delegatorPubkey,
                            userStats: PublicKey.findProgramAddressSync([Buffer.from(userStatsSeed), publicKey.toBuffer()], programId)[0],
                            proxyAuthority: publicKey,
                        })
                        .instruction();
                    
                    transaction.add(proxyIx);
                    hasInstructions = true;
                }
            }
            
            if (!hasInstructions) {
                alert("No voting power to cast (0 Personal + 0 Delegated).");
                setVotingLoading(false);
                return;
            }
            
            const signature = await sendTransaction(transaction, connection);
            await connection.confirmTransaction(signature, 'finalized');
            
            setVotingLoading(false);
            setVoteSuccess(true);
            setTimeout(() => setVoteSuccess(false), 2000);
            
            // Refetch Proposal & User status
            // Simple way: reload page or trigger existing poll
            // For now, assume optimistic update is hard for batch, just let poll catch it
            
        } catch (e) {
            console.error("Vote Error:", e);
            setVotingLoading(false);
             if (e.message.includes("Account does not exist") || e.message.includes("Constraint")) {
                 alert("Vote Failed. Check requirements (ATA, Stake).");
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
            const [globalAccountPDA] = PublicKey.findProgramAddressSync([Buffer.from(globalStateSeed)], programId);

            const transaction = new Transaction();
            let hasInstructions = false;

            // 1. Withdraw Self (if has voting power/record)
             // We try blindly or check? Just try. If it fails, maybe simulation fails? 
             // Better only if votingPower > 0
            // 1. Withdraw Self (Only if Voter Record Exists)
            const [voterRecordPDA] = PublicKey.findProgramAddressSync(
                [Buffer.from('voter'), proposalPubkey.toBuffer(), publicKey.toBuffer()],
                programId
            );

            let selfVoted = false;
            try {
                const record = await votingProgram.account.voterRecord.fetch(voterRecordPDA);
                if (record.voted) selfVoted = true;
            } catch (err) {
                // Not found or not initialized
            }

            if (selfVoted) {
                 const ix = await votingProgram.methods
                    .withdrawVote()
                    .accounts({
                        globalAccount: globalAccountPDA,
                        proposalAccount: proposalPubkey,
                        voterRecord: voterRecordPDA,
                        user: publicKey,
                    })
                    .instruction();
                transaction.add(ix);
                hasInstructions = true;
            }

            // 2. Withdraw as Proxy
            if (delegatorsList.length > 0) {
                 const [myProfilePDA] = PublicKey.findProgramAddressSync(
                     [Buffer.from(delegateProfileSeed), publicKey.toBuffer()],
                     programId
                );

                 for (const dRecord of delegatorsList) {
                    const delegatorPubkey = dRecord.account.delegator;
                    
                    const [dDelegationRecordPDA] = PublicKey.findProgramAddressSync(
                        [Buffer.from(delegationRecordSeed), delegatorPubkey.toBuffer()],
                        programId
                    );
                    const [dVoterRecordPDA] = PublicKey.findProgramAddressSync(
                        [Buffer.from('voter'), proposalPubkey.toBuffer(), delegatorPubkey.toBuffer()],
                        programId
                    );

                    const proxyIx = await votingProgram.methods
                        .withdrawAsProxy()
                        .accounts({
                            globalAccount: globalAccountPDA,
                            proposalAccount: proposalPubkey,
                            delegateProfile: myProfilePDA,
                            delegationRecord: dDelegationRecordPDA,
                            voterRecord: dVoterRecordPDA,
                            delegatorUser: delegatorPubkey,
                            proxyAuthority: publicKey,
                        })
                        .instruction();
                    transaction.add(proxyIx);
                    hasInstructions = true;
                }
            }

            if (!hasInstructions) {
                 alert("Nothing to withdraw.");
                 setVotingLoading(false);
                 return;
            }

            const signature = await sendTransaction(transaction, connection);
            await connection.confirmTransaction(signature, 'finalized');

            setVotingLoading(false);
            setVoteSuccess(true); 
            setTimeout(() => setVoteSuccess(false), 2000);
            
            setUserVoterInfo(prev => ({ ...prev, voted: false }));

        } catch (e) {
             console.error("Withdraw Error:", e);
             setVotingLoading(false);
             alert("Failed to withdraw vote: " + e.message);
        }
    };

    // Timelock Countdown Timer
    useEffect(() => {
        if (!proposal || !treasuryInfo || treasuryInfo.executed) {
            setTimelockRemaining(null);
            return;
        }
        
        const calculateRemaining = () => {
            const now = Math.floor(Date.now() / 1000);
            const executionTime = proposal.deadline + treasuryInfo.timelockSeconds;
            const remaining = executionTime - now;
            
            if (remaining <= 0) {
                setTimelockRemaining(0);
            } else {
                setTimelockRemaining(remaining);
            }
        };
        
        calculateRemaining();
        const interval = setInterval(calculateRemaining, 1000);
        return () => clearInterval(interval);
    }, [proposal, treasuryInfo]);

    // Treasury Execution Handlers
    const handleExecuteProposal = async () => {
        if (!publicKey || !tokenMint || !treasuryInfo) return;
        
        setExecutingProposal(true);
        try {
            const votingProgram = program({ publicKey, sendTransaction });
            const proposalNumber = proposal.number;
            
            const [proposalPDAAddress] = PublicKey.findProgramAddressSync(
                [Buffer.from(proposalSeed), Buffer.from(toLittleEndian8Bytes(proposalNumber))],
                programId
            );
            
            const [proposalEscrowPDA] = PublicKey.findProgramAddressSync(
                [Buffer.from(proposalEscrowSeed), Buffer.from(toLittleEndian8Bytes(proposalNumber))],
                programId
            );
            
            const [globalAccountPDA] = PublicKey.findProgramAddressSync([Buffer.from(globalStateSeed)], programId);
            
            // Get destination ATA
            const destinationPubkey = new PublicKey(treasuryInfo.transferDestination);
            const destinationATA = await getAssociatedTokenAddress(new PublicKey(tokenMint), destinationPubkey);
            
            const transaction = await votingProgram.methods
                .executeProposal(new BN(proposalNumber))
                .accounts({
                    globalAccount: globalAccountPDA,
                    proposalAccount: proposalPDAAddress,
                    proposalEscrow: proposalEscrowPDA,
                    destinationTokenAccount: destinationATA,
                    tokenMint: new PublicKey(tokenMint),
                    executor: publicKey,
                    tokenProgram: TOKEN_PROGRAM_ID,
                })
                .transaction();
            
            const signature = await sendTransaction(transaction, connection);
            await connection.confirmTransaction(signature, 'finalized');
            
            setExecutingProposal(false);
            // Reload to refresh state
            window.location.reload();
            
        } catch (e) {
            console.error("Execute Error:", e);
            setExecutingProposal(false);
            alert("Failed to execute proposal: " + e.message);
        }
    };
    
    const handleReclaimFunds = async () => {
        if (!publicKey || !tokenMint || !treasuryInfo) return;
        if (proposal.author !== publicKey.toBase58()) {
            alert("Only the proposal author can reclaim funds.");
            return;
        }
        
        setExecutingProposal(true);
        try {
            const votingProgram = program({ publicKey, sendTransaction });
            const proposalNumber = proposal.number;
            
            const [proposalPDAAddress] = PublicKey.findProgramAddressSync(
                [Buffer.from(proposalSeed), Buffer.from(toLittleEndian8Bytes(proposalNumber))],
                programId
            );
            
            const [proposalEscrowPDA] = PublicKey.findProgramAddressSync(
                [Buffer.from(proposalEscrowSeed), Buffer.from(toLittleEndian8Bytes(proposalNumber))],
                programId
            );
            
            const [globalAccountPDA] = PublicKey.findProgramAddressSync([Buffer.from(globalStateSeed)], programId);
            
            const authorATA = await getAssociatedTokenAddress(new PublicKey(tokenMint), publicKey);
            
            const transaction = await votingProgram.methods
                .reclaimProposalFunds(new BN(proposalNumber))
                .accounts({
                    globalAccount: globalAccountPDA,
                    proposalAccount: proposalPDAAddress,
                    proposalEscrow: proposalEscrowPDA,
                    authorTokenAccount: authorATA,
                    tokenMint: new PublicKey(tokenMint),
                    author: publicKey,
                    tokenProgram: TOKEN_PROGRAM_ID,
                })
                .transaction();
            
            const signature = await sendTransaction(transaction, connection);
            await connection.confirmTransaction(signature, 'finalized');
            
            setExecutingProposal(false);
            // Reload to refresh state
            window.location.reload();
            
        } catch (e) {
            console.error("Reclaim Error:", e);
            setExecutingProposal(false);
            alert("Failed to reclaim funds: " + e.message);
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
                       <h1 className="text-4xl font-display font-medium text-white leading-tight max-w-2xl">{proposal.title}</h1>
                       <p className="text-pulsar-muted mt-3 max-w-2xl">{proposal.description}</p>
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

               {/* Treasury Info Section */}
               {treasuryInfo && (
                   <div className="mb-8 p-6 bg-gradient-to-br from-[#14F195]/10 to-[#9945FF]/10 rounded-xl border border-[#14F195]/20 relative z-10">
                       <div className="flex items-center gap-3 mb-4">
                           <Coins className="w-6 h-6 text-[#14F195]" />
                           <h3 className="text-lg font-bold text-white">Treasury Transfer</h3>
                           {treasuryInfo.executed && (
                               <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs font-bold rounded-full">
                                   EXECUTED
                               </span>
                           )}
                       </div>
                       
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                           <div>
                               <span className="text-gray-400 text-xs uppercase">Transfer Amount</span>
                               <div className="text-2xl font-bold text-[#14F195]">
                                   {treasuryInfo.transferAmount.toLocaleString()} $PULSAR
                               </div>
                           </div>
                           <div>
                               <span className="text-gray-400 text-xs uppercase">Destination</span>
                               <div className="text-sm font-mono text-white break-all">
                                   {treasuryInfo.transferDestination}
                               </div>
                           </div>
                       </div>
                       
                       {treasuryInfo.timelockSeconds > 0 && (
                           <div className="text-xs text-gray-400 mb-4">
                               Timelock: {treasuryInfo.timelockSeconds} seconds after voting ends
                           </div>
                       )}
                       
                       {/* Execution Buttons */}
                       {!isActive && !treasuryInfo.executed && !escrowEmpty && (
                           <div className="flex flex-col gap-4 mt-4">
                               {/* Timelock Countdown */}
                               {timelockRemaining !== null && timelockRemaining > 0 && (
                                   <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 flex items-center gap-3">
                                       <Clock className="w-5 h-5 text-yellow-400" />
                                       <div>
                                           <div className="text-yellow-400 font-bold text-sm">Timelock Active</div>
                                           <div className="text-white font-mono text-lg">
                                               {Math.floor(timelockRemaining / 60)}m {timelockRemaining % 60}s remaining
                                           </div>
                                       </div>
                                   </div>
                               )}
                               
                               {/* Execute/Reclaim Buttons - only show when timelock passed */}
                               {(timelockRemaining === 0 || timelockRemaining === null) && (
                                   <>
                                       {proposal.yes > proposal.no ? (
                                           <button
                                               onClick={handleExecuteProposal}
                                               disabled={executingProposal || !publicKey}
                                               className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#14F195] to-emerald-500 text-black font-bold rounded-xl hover:shadow-[0_0_20px_rgba(20,241,149,0.5)] transition-all disabled:opacity-50"
                                           >
                                               {executingProposal ? (
                                                   <Loader2 className="w-5 h-5 animate-spin" />
                                               ) : (
                                                   <Play className="w-5 h-5" />
                                               )}
                                               Execute Transfer
                                           </button>
                                       ) : (
                                           publicKey?.toBase58() === proposal.author && (
                                               <button
                                                   onClick={handleReclaimFunds}
                                                   disabled={executingProposal || !publicKey}
                                                   className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold rounded-xl hover:shadow-[0_0_20px_rgba(249,115,22,0.5)] transition-all disabled:opacity-50"
                                               >
                                                   {executingProposal ? (
                                                       <Loader2 className="w-5 h-5 animate-spin" />
                                                   ) : (
                                                       <Undo2 className="w-5 h-5" />
                                                   )}
                                                   Reclaim Funds
                                               </button>
                                           )
                                       )}
                                   </>
                               )}
                           </div>
                       )}
                       
                       {(treasuryInfo.executed || escrowEmpty) && (
                           <div className="flex items-center gap-2 text-emerald-400 text-sm mt-4">
                               <CheckCircle className="w-4 h-4" />
                               <span>Transfer completed</span>
                           </div>
                       )}
                   </div>
               )}

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
                             <span className="text-gray-400 text-sm font-medium">
                                {userVoterInfo?.voted ? "Confirmed Power:" : "Your Voting Power:"}
                             </span>
                             <span className="text-2xl font-bold font-display text-white text-glow">
                                {userVoterInfo?.voted 
                                    ? Number(userVoterInfo.votingPower).toLocaleString() 
                                    : (votingPower !== null ? votingPower.toLocaleString() : '...')
                                } ⚡
                             </span>
                             
                             {/* Delegated Power Display */}
                             {delegatedPower > 0 && (
                                <span className="text-xs text-[#14F195] bg-[#14F195]/10 px-2 py-1 rounded ml-2 flex items-center gap-1">
                                    <Users size={12} />
                                    +{delegatedPower.toLocaleString()} Delegated
                                </span>
                             )}

                             {delegatedTo && !userVoterInfo?.voted && (
                                <span className="text-[10px] text-gray-400 bg-white/10 px-2 py-1 rounded ml-2">
                                    Delegated to {delegatedTo.slice(0,4)}...
                                </span>
                             )}
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

                        {/* Delegation Warning */}
                        {delegatedTo && (
                             <div className="col-span-2 bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 flex items-center gap-3 mb-2">
                                <Users className="text-yellow-500 w-6 h-6" />
                                <div>
                                    <span className="text-yellow-400 font-bold text-sm block">You have delegated your power to {delegatedTo.substring(0, 6)}...{delegatedTo.substring(delegatedTo.length - 4)}.</span>
                                    <span className="text-yellow-400/80 text-xs">Revoke your delegation to vote manually.</span>
                                </div>
                            </div>
                        )}

                        {/* Proxy Vote Locked Warning */}
                        {!delegatedTo && userVoterInfo?.votedByProxy && (
                             <div className="col-span-2 bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex items-center gap-3 mb-2">
                                <Lock className="text-blue-500 w-6 h-6" />
                                <div>
                                    <span className="text-blue-400 font-bold text-sm block">Vote Cast by Proxy</span>
                                    <span className="text-blue-400/80 text-xs">This vote was cast by your delegate and is locked for this proposal.</span>
                                </div>
                            </div>
                        )}
                        
                       {!delegatedTo && !userVoterInfo?.votedByProxy && (
                           <>
                               <button 
                                   onClick={() => handleVote(true)}
                                   disabled={votingLoading || !publicKey || !systemEnabled || (userVoterInfo?.voted && userVoterInfo?.vote === true) || userVoterInfo?.votedByProxy}
                                   className={`group relative overflow-hidden rounded-xl p-6 transition-all duration-300 border ${
                                       !systemEnabled || (userVoterInfo?.voted && userVoterInfo?.vote === true) || userVoterInfo?.votedByProxy
                                       ? 'bg-gray-800/50 border-gray-700 cursor-not-allowed opacity-50' 
                                       : 'bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20 hover:border-emerald-500/40 hover:scale-[1.02] active:scale-[0.98]'
                                   }`}
                               >
                                   <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/0 via-emerald-500/0 to-emerald-500/5 group-hover:to-emerald-500/10 transition-all duration-500"></div>
                                   
                                   <div className="relative z-10 flex flex-col items-center gap-3">
                                       <div className={`p-4 rounded-full transition-colors ${!systemEnabled || userVoterInfo?.votedByProxy ? 'bg-gray-700 text-gray-400' : (userVoterInfo?.voted && userVoterInfo?.vote === true ? 'bg-emerald-500 text-black' : 'bg-emerald-500/20 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-black')}`}>
                                           <CheckCircle size={32} />
                                       </div>
                                       <span className={`font-display font-bold text-lg tracking-wider ${!systemEnabled || userVoterInfo?.votedByProxy ? 'text-gray-500' : 'text-white'}`}>
                                           {userVoterInfo?.voted && userVoterInfo?.vote === true ? 'VOTED YES' : (userVoterInfo?.voted ? 'SWITCH TO YES' : 'VOTE YES')}
                                       </span>
                                   </div>
                               </button>

                               <button 
                                   onClick={() => handleVote(false)}
                                   disabled={votingLoading || !publicKey || !systemEnabled || (userVoterInfo?.voted && userVoterInfo?.vote === false) || userVoterInfo?.votedByProxy}
                                   className={`group relative overflow-hidden rounded-xl p-6 transition-all duration-300 border ${
                                       !systemEnabled || (userVoterInfo?.voted && userVoterInfo?.vote === false) || userVoterInfo?.votedByProxy
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
                           </>
                       )}
                       
                         {/* WITHDRAW VOTE BUTTON */}
                        {userVoterInfo?.voted && !delegatedTo && !userVoterInfo?.votedByProxy && (
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
