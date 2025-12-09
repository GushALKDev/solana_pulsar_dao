import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { connection, program, programId, voterSeed, globalAccountPDAAddress } from '../config';
import { SystemProgram } from '@solana/web3.js';

const Proposal = () => {
  const { publicKey, sendTransaction } = useWallet();
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [proposalNumber, setProposalNumber] = useState(0);
  const [proposalAuthor, setProposalAuthor] = useState('');
  const [proposalQuestion, setProposalQuestion] = useState('');
  const [proposalYes, setProposalYes] = useState(0);
  const [proposalNo, setProposalNo] = useState(0);
  const [proposalDeadline, setProposalDeadline] = useState(0);
  const [timeLeft, setTimeLeft] = useState('');
  const [voterAccount, setVoterAccount] = useState(null);
  const [voteUpdatesEnabled, setVoteUpdatesEnabled] = useState(false);
  const [tokenMint, setTokenMint] = useState(null);
  const { proposalPDAAddress } = useParams();

  const fetchProposalInfo = async () => {
    try {
      const votingProgram = program({ publicKey: null });
      const proposalPDA = await votingProgram.account.proposalAccount.fetch(proposalPDAAddress);

      setProposalNumber(Number(proposalPDA.number.toString()));
      setProposalAuthor(proposalPDA.author.toString());
      setProposalQuestion(proposalPDA.question.toString());
      setProposalYes(Number(proposalPDA.yes.toString()));
      setProposalNo(Number(proposalPDA.no.toString()));
      setProposalDeadline(Number(proposalPDA.deadline.toString()));
    } catch (error) {
      console.error('Error in fetchProposalInfo:', error);
    }
  };

  const fetchGlobalAccount = async () => {
    try {
      const votingProgram = program({ publicKey: null });
      const globalAccount = await votingProgram.account.globalAccount.fetch(globalAccountPDAAddress);
      setVoteUpdatesEnabled(globalAccount.voteUpdatesEnabled);
      if (globalAccount.tokenMint) {
        setTokenMint(globalAccount.tokenMint);
      }
    } catch (error) {
      console.error('Error in fetchGlobalAccount:', error);
    }
  };

  const fetchVoterAccount = async () => {
    try {
      const proposalPDAPublicKey = new PublicKey(proposalPDAAddress);
      const votingProgram = program({ publicKey: null });
      const [voterAccountPDAAddress] = await PublicKey.findProgramAddress(
        [Buffer.from(voterSeed), proposalPDAPublicKey.toBuffer(), publicKey.toBuffer()],
        programId
      );

      const voterAccountPDA = await votingProgram.account.voterAccount.fetch(voterAccountPDAAddress);
      setVoterAccount(voterAccountPDA);
    } catch (e) {
      setVoterAccount(null);
    }
  };

  const vote = async (option) => {
    try {
      if (!tokenMint) {
        console.error("Token mint not found");
        return;
      }
      setConfirming(true);
      const votingProgram = program({ publicKey });
      
      const tokenAccount = await getAssociatedTokenAddress(tokenMint, publicKey);

      let transaction;

      const proposalPDAPublicKey = new PublicKey(proposalPDAAddress);
      const [voterAccountPDAAddress] = await PublicKey.findProgramAddress(
          [Buffer.from(voterSeed), proposalPDAPublicKey.toBuffer(), publicKey.toBuffer()],
          programId
      );

      if (voterAccount && voterAccount.voted) {
        transaction = await votingProgram.methods
            .updateVote(option)
            .accounts({
                globalAccount: globalAccountPDAAddress,
                proposalAccount: proposalPDAAddress,
                voterAccount: voterAccountPDAAddress,
                tokenAccount: tokenAccount,
                user: publicKey,
            })
            .transaction();
      } else {
        transaction = await votingProgram.methods
            .vote(option)
            .accounts({
                globalAccount: globalAccountPDAAddress,
                proposalAccount: proposalPDAAddress,
                voterAccount: voterAccountPDAAddress,
                tokenAccount: tokenAccount,
                user: publicKey,
                systemProgram: SystemProgram.programId,
            })
            .transaction();
      }

      const transactionSignature = await sendTransaction(transaction, connection);

      const latestBlockhash = await connection.getLatestBlockhash();
      await connection.confirmTransaction(
        {
          signature: transactionSignature,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        },
        'finalized'
      );

      console.log('Transaction confirmed, refreshing data...');
      await fetchProposalInfo();
      await fetchVoterAccount();
    } catch (error) {
      console.error('Error during voting:', error);
    } finally {
      setConfirming(false);
    }
  };

  const withdrawVote = async () => {
    try {
      setConfirming(true);
      const votingProgram = program({ publicKey });
      const proposalPDAPublicKey = new PublicKey(proposalPDAAddress);
      const [voterAccountPDAAddress] = await PublicKey.findProgramAddress(
        [Buffer.from(voterSeed), proposalPDAPublicKey.toBuffer(), publicKey.toBuffer()],
        programId
      );

      const transaction = await votingProgram.methods
        .withdrawVote()
        .accounts({
          globalAccount: globalAccountPDAAddress,
          proposalAccount: proposalPDAAddress,
          voterAccount: voterAccountPDAAddress,
          user: publicKey,
        })
        .transaction();

      const transactionSignature = await sendTransaction(transaction, connection);

      const latestBlockhash = await connection.getLatestBlockhash();
      await connection.confirmTransaction(
        {
          signature: transactionSignature,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        },
        'finalized'
      );

      console.log('Vote withdrawn, refreshing data...');
      await fetchProposalInfo();
      await fetchVoterAccount();
    } catch (error) {
      console.error('Error withdrawing vote:', error);
    } finally {
      setConfirming(false);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      await fetchProposalInfo();
      await fetchGlobalAccount();
      if (publicKey) {
        await fetchVoterAccount();
      }
      setLoading(false);
    };

    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicKey, proposalPDAAddress]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchProposalInfo();
      fetchGlobalAccount();
      if (publicKey) {
        fetchVoterAccount();
      }
    }, 30000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicKey, proposalPDAAddress]);

  useEffect(() => {
    if (!proposalDeadline) return;

    const updateTimer = () => {
      const now = Math.floor(Date.now() / 1000);
      const remaining = proposalDeadline - now;

      if (remaining <= 0) {
        setTimeLeft('Expired');
      } else {
        const hours = Math.floor(remaining / 3600);
        const minutes = Math.floor((remaining % 3600) / 60);
        const seconds = remaining % 60;
        setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
      }
    };

    updateTimer();
    const timerInterval = setInterval(updateTimer, 1000);

    return () => clearInterval(timerInterval);
  }, [proposalDeadline]);

  return (
    <div className="bg-[#0f1117] rounded-2xl p-8 border border-white/10 backdrop-blur-sm max-w-4xl mx-auto">
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#14F195]"></div>
        </div>
      ) : (
        <>
          <div className="mb-8">
            <div className="flex justify-between items-start mb-4">
                <span className="text-xs font-mono text-gray-400">Proposal #{proposalNumber}</span>
                <span className={`text-sm font-bold ${timeLeft === 'Expired' ? 'text-red-400' : 'text-[#14F195]'}`}>
                    {timeLeft === 'Expired' ? '🔴 Expired' : `⏱️ ${timeLeft}`}
                </span>
            </div>
            <h2 className="text-3xl font-bold text-white mb-4">{proposalQuestion}</h2>
            <p className="text-sm text-gray-400 font-mono break-all">Author: {proposalAuthor}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="bg-[#1a1c2e] rounded-xl p-6 border border-white/5">
                <h3 className="text-xl font-bold text-[#14F195] mb-2">Yes</h3>
                <p className="text-3xl font-bold text-white">{proposalYes}</p>
                <p className="text-xs text-gray-500 mt-1">Total Votes</p>
            </div>
            <div className="bg-[#1a1c2e] rounded-xl p-6 border border-white/5">
                <h3 className="text-xl font-bold text-red-400 mb-2">No</h3>
                <p className="text-3xl font-bold text-white">{proposalNo}</p>
                <p className="text-xs text-gray-500 mt-1">Total Votes</p>
            </div>
          </div>

          <div className="border-t border-white/10 pt-8">
            {confirming ? (
                <div className="flex justify-center items-center py-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#14F195]"></div>
                    <span className="ml-3 text-gray-300">Processing transaction...</span>
                </div>
            ) : publicKey && voterAccount?.voted ? (
                <div className="space-y-4">
                    <div className="bg-[#14F195]/10 border border-[#14F195]/20 rounded-lg p-4 text-center">
                        <p className="text-[#14F195] font-bold">
                            ✅ You voted {voterAccount.vote ? 'YES' : 'NO'}
                        </p>
                    </div>
                    
                    {voteUpdatesEnabled && timeLeft !== 'Expired' && (
                        <div className="flex flex-wrap gap-4 justify-center">
                            <button
                                onClick={() => vote(true)}
                                disabled={voterAccount.vote === true}
                                className="px-6 py-2 rounded-lg border border-[#14F195]/50 text-[#14F195] hover:bg-[#14F195]/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                            >
                                Change to Yes
                            </button>
                            <button
                                onClick={() => vote(false)}
                                disabled={voterAccount.vote === false}
                                className="px-6 py-2 rounded-lg border border-red-500/50 text-red-400 hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                            >
                                Change to No
                            </button>
                            <button
                                onClick={withdrawVote}
                                className="px-6 py-2 rounded-lg border border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10 transition-all"
                            >
                                Withdraw Vote
                            </button>
                        </div>
                    )}
                </div>
            ) : (
                <div className="flex gap-4">
                    <button
                        onClick={() => vote(true)}
                        disabled={!publicKey || confirming || timeLeft === 'Expired'}
                        className="flex-1 bg-gradient-to-r from-[#14F195] to-[#0e9c61] text-black font-bold py-4 rounded-xl hover:shadow-[0_0_20px_rgba(20,241,149,0.3)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Vote YES
                    </button>
                    <button
                        onClick={() => vote(false)}
                        disabled={!publicKey || confirming || timeLeft === 'Expired'}
                        className="flex-1 bg-gradient-to-r from-red-500 to-red-700 text-white font-bold py-4 rounded-xl hover:shadow-[0_0_20px_rgba(239,68,68,0.3)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Vote NO
                    </button>
                </div>
            )}
            
            {!publicKey && (
                <p className="text-center text-gray-500 mt-4 text-sm">
                    Please connect your wallet to vote
                </p>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default Proposal;
