import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import { SystemProgram, PublicKey } from '@solana/web3.js';
import { connection, program, globalAccountPDAAddress, proposalSeed, programId } from '../config';
import { BN } from 'bn.js';

const CreateProposal = () => {
  const { publicKey, sendTransaction } = useWallet();
  const [proposalQuestion, setProposalQuestion] = useState('');
  const [duration, setDuration] = useState(10);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const navigate = useNavigate();

  function toLittleEndian8Bytes(num) {
    const buffer = Buffer.alloc(8);
    buffer.writeUInt32LE(num, 0);
    return buffer;
  }

  const createNewProposal = async () => {
    if (!publicKey) {
        setErrorMessage('Please connect your wallet first.');
        return;
    }
    if (!proposalQuestion.trim()) {
      setErrorMessage('Please enter a valid question.');
      return;
    }

    setErrorMessage('');
    setLoading(true);

    try {
      const votingProgram = program({ publicKey });

      // Fetch global account to get the current proposals counter
      let globalAccount;
      try {
        globalAccount = await votingProgram.account.globalAccount.fetch(globalAccountPDAAddress);
      } catch (error) {
        console.error("Error fetching global account:", error);
        setErrorMessage(
          <span>
            DAO not initialized. Please go to <a href="/tokens" className="text-[#14F195] underline">Token Management</a> to initialize the DAO.
          </span>
        );
        setLoading(false);
        return;
      }

      const proposalsCounter = Number(globalAccount.proposalsCounter.toString());

      // Derive the proposal PDA
      const [proposalPDAAddress] = await PublicKey.findProgramAddress(
        [Buffer.from(proposalSeed), Buffer.from(toLittleEndian8Bytes(proposalsCounter))],
        programId
      );

      const transaction = await votingProgram.methods
        .createProposal(proposalQuestion, new BN(duration * 60))
        .accounts({
          globalAccount: globalAccountPDAAddress,
          proposalAccount: proposalPDAAddress,
          user: publicKey,
          systemProgram: SystemProgram.programId,
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

      console.log('Transaction confirmed.');
      navigate('/');
    } catch (error) {
      console.error('Failed to create new proposal:', error);
      setErrorMessage('Failed to create new proposal: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#0f1117] rounded-2xl p-8 border border-white/10 backdrop-blur-sm max-w-2xl mx-auto">
      <h2 className="text-3xl font-bold text-white mb-6 bg-gradient-to-r from-[#14F195] to-[#9945FF] bg-clip-text text-transparent">
        Create New Proposal
      </h2>

      <div className="space-y-6">
        {/* Proposal Question Input */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Proposal Question
          </label>
          <input
            type="text"
            value={proposalQuestion}
            onChange={(e) => setProposalQuestion(e.target.value)}
            placeholder="What should the DAO vote on?"
            className="w-full bg-[#1a1c2e] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#14F195] transition-colors"
            disabled={loading}
          />
        </div>

        {/* Duration Input */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Duration (minutes)
          </label>
          <input
            type="number"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="w-full bg-[#1a1c2e] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#14F195] transition-colors"
            min="1"
            disabled={loading}
          />
          <p className="text-xs text-gray-500 mt-2">
            The proposal will be active for this duration.
          </p>
        </div>

        {/* Error Message */}
        {errorMessage && (
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {errorMessage}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-4 pt-4">
          <button
            onClick={() => navigate('/')}
            disabled={loading}
            className="flex-1 px-6 py-3 rounded-xl border border-white/10 text-white font-semibold hover:bg-white/5 transition-all duration-300 disabled:opacity-50"
          >
            Cancel
          </button>
          
          <button
            onClick={createNewProposal}
            disabled={loading || !publicKey}
            className="flex-1 bg-gradient-to-r from-[#14F195] to-[#9945FF] text-white font-bold py-3 px-6 rounded-xl hover:shadow-[0_0_20px_rgba(20,241,149,0.5)] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating...' : 'Create Proposal'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateProposal;
