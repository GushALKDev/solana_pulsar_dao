import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import { SystemProgram, PublicKey, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { connection, program, globalAccountPDAAddress, proposalSeed, programId, proposalEscrowSeed } from '../config';
import { BN } from 'bn.js';
import { Loader2, CheckCircle, Coins, ToggleLeft, ToggleRight } from 'lucide-react';

const CreateProposal = () => {
    // ... (state vars) 
  const { publicKey, sendTransaction } = useWallet();
  const [proposalTitle, setProposalTitle] = useState('');
  const [proposalDescription, setProposalDescription] = useState('');
  const [duration, setDuration] = useState(10);
  const [loading, setLoading] = useState(false);

  const [createSuccess, setCreateSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const navigate = useNavigate();

  // Treasury proposal state
  const [isTreasuryProposal, setIsTreasuryProposal] = useState(false);
  const [transferAmount, setTransferAmount] = useState('');
  const [destinationAddress, setDestinationAddress] = useState('');
  const [timelockSeconds, setTimelockSeconds] = useState('60'); // Default 60 seconds for demo
  const [tokenMint, setTokenMint] = useState(null);
  const [userBalance, setUserBalance] = useState(0);

  // Fetch token mint and user balance on load
  useEffect(() => {
    const fetchMintAndBalance = async () => {
      try {
        const votingProgram = program({ publicKey: null });
        const globalAccount = await votingProgram.account.globalAccount.fetch(globalAccountPDAAddress);
        setTokenMint(globalAccount.tokenMint);
        
        // Fetch user balance if wallet connected
        if (publicKey && globalAccount.tokenMint) {
          const ata = await getAssociatedTokenAddress(globalAccount.tokenMint, publicKey);
          try {
            const balanceResult = await connection.getTokenAccountBalance(ata);
            setUserBalance(Number(balanceResult.value.amount));
          } catch (e) {
            setUserBalance(0);
          }
        }
      } catch (e) {
        console.warn("Could not fetch token mint", e);
      }
    };
    fetchMintAndBalance();
  }, [publicKey]);

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
    if (!proposalTitle.trim()) {
      setErrorMessage('Please enter a title for your proposal.');
      return;
    }
    if (!proposalDescription.trim()) {
      setErrorMessage('Please enter a description for your proposal.');
      return;
    }

    // Validate treasury fields if enabled
    if (isTreasuryProposal) {
      if (!transferAmount || parseFloat(transferAmount) <= 0) {
        setErrorMessage('Please enter a valid transfer amount.');
        return;
      }
      try {
        new PublicKey(destinationAddress);
      } catch {
        setErrorMessage('Please enter a valid destination address.');
        return;
      }
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

      const proposalsCounter = Number(globalAccount.proposalCount.toString());
      const nextProposalId = proposalsCounter + 1;

      const [proposalPDAAddress] = PublicKey.findProgramAddressSync(
        [Buffer.from(proposalSeed), Buffer.from(toLittleEndian8Bytes(nextProposalId))],
        programId
      );

      // Contract expects an absolute timestamp (deadline), not duration.
      // So we calculate: Now (seconds) + Duration (seconds)
      const now = Math.floor(Date.now() / 1000);
      const deadlineTimestamp = new BN(now + (duration * 60));

      let transaction;

      if (isTreasuryProposal) {
        // Treasury Proposal - with token escrow
        const [proposalEscrowPDA] = PublicKey.findProgramAddressSync(
          [Buffer.from(proposalEscrowSeed), Buffer.from(toLittleEndian8Bytes(nextProposalId))],
          programId
        );

        const mintPubkey = new PublicKey(tokenMint);
        const authorATA = await getAssociatedTokenAddress(mintPubkey, publicKey);
        const amountInLamports = new BN(parseInt(transferAmount)); // Token has 0 decimals
        const destination = new PublicKey(destinationAddress);

        transaction = await votingProgram.methods
          .createTreasuryProposal(
            proposalTitle,
            proposalDescription, 
            deadlineTimestamp, 
            amountInLamports, 
            destination,
            new BN(timelockSeconds)
          )
          .accounts({
            globalAccount: globalAccountPDAAddress,
            proposalAccount: proposalPDAAddress,
            proposalEscrow: proposalEscrowPDA,
            tokenMint: mintPubkey,
            authorTokenAccount: authorATA,
            author: publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            rent: SYSVAR_RENT_PUBKEY,
          })
          .transaction();
      } else {
        // Standard Proposal - no treasury
        transaction = await votingProgram.methods
          .createProposal(proposalTitle, proposalDescription, deadlineTimestamp)
          .accounts({
            globalAccount: globalAccountPDAAddress,
            proposalAccount: proposalPDAAddress,
            author: publicKey,
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
      
      // Success Transition
      setLoading(false);
      setCreateSuccess(true);
      setTimeout(() => {
            navigate(`/proposal/${nextProposalId}`);
      }, 2000);

    } catch (error) {
      console.error('Failed to create new proposal:', error);
      setErrorMessage('Failed to create new proposal: ' + error.message);
      setLoading(false);
    }
  };
  


  return (
    <div className="bg-[#0f1117] rounded-2xl p-8 border border-white/10 backdrop-blur-sm max-w-2xl mx-auto relative overflow-hidden">
      {/* Loading Overlay */}
      {(loading || createSuccess) && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md z-50 flex flex-col items-center justify-center animate-in fade-in duration-300">
              {createSuccess ? (
                  <>
                     <CheckCircle className="w-16 h-16 text-[#14F195] mb-6 animate-bounce" />
                     <h3 className="text-2xl font-bold text-white mb-2 tracking-wide">Proposal Created!</h3>
                     <p className="text-gray-400 text-sm animate-pulse">Redirecting to proposal...</p>
                  </>
              ) : (
                  <>
                    <Loader2 className="w-16 h-16 text-[#14F195] animate-spin mb-6" />
                    <h3 className="text-2xl font-bold text-white mb-2 tracking-wide">Creating Proposal</h3>
                    <p className="text-gray-400 text-sm animate-pulse">Confirming transaction on blockchain...</p>
                  </>
              )}
          </div>
      )}

      <h2 className="text-3xl font-bold text-white mb-6 bg-gradient-to-r from-[#14F195] to-[#9945FF] bg-clip-text text-transparent">
        Create New Proposal
      </h2>

      <div className="space-y-6">
        {/* Proposal Title Input */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Proposal Title
          </label>
          <input
            type="text"
            value={proposalTitle}
            onChange={(e) => setProposalTitle(e.target.value)}
            placeholder="Short title for your proposal"
            maxLength={100}
            className="w-full bg-[#1a1c2e] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#14F195] transition-colors"
            disabled={loading}
          />
        </div>

        {/* Proposal Description Input */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Description
          </label>
          <textarea
            value={proposalDescription}
            onChange={(e) => setProposalDescription(e.target.value)}
            placeholder="Provide more details about your proposal..."
            maxLength={500}
            rows={4}
            className="w-full bg-[#1a1c2e] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#14F195] transition-colors resize-none"
            disabled={loading}
          />
        </div>

        {/* Duration Input */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Duration (minutes)
          </label>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={duration}
            onChange={(e) => setDuration(e.target.value.replace(/[^0-9]/g, ''))}
            className="w-full bg-[#1a1c2e] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#14F195] transition-colors"
            placeholder="10"
            disabled={loading}
          />
          <p className="text-xs text-gray-500 mt-2">
            The proposal will be active for this duration.
          </p>
        </div>

        {/* Treasury Toggle */}
        <div className="border-t border-white/10 pt-6">
          <button
            type="button"
            onClick={() => setIsTreasuryProposal(!isTreasuryProposal)}
            disabled={loading}
            className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${
              isTreasuryProposal 
                ? 'bg-[#14F195]/10 border-[#14F195]/30' 
                : 'bg-[#1a1c2e] border-white/10 hover:border-white/20'
            }`}
          >
            <div className="flex items-center gap-3">
              <Coins className={`w-5 h-5 ${isTreasuryProposal ? 'text-[#14F195]' : 'text-gray-400'}`} />
              <div className="text-left">
                <span className={`font-medium ${isTreasuryProposal ? 'text-[#14F195]' : 'text-white'}`}>
                  Treasury Transfer
                </span>
                <p className="text-xs text-gray-500">Include tokens to be sent upon approval</p>
              </div>
            </div>
            {isTreasuryProposal ? (
              <ToggleRight className="w-8 h-8 text-[#14F195]" />
            ) : (
              <ToggleLeft className="w-8 h-8 text-gray-500" />
            )}
          </button>
        </div>

        {/* Treasury Fields (Conditional) */}
        {isTreasuryProposal && (
          <div className="space-y-4 p-4 bg-[#14F195]/5 rounded-xl border border-[#14F195]/20 animate-in slide-in-from-top duration-300">
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium text-[#14F195]">
                  Transfer Amount ($PULSAR)
                </label>
                <span className="text-xs text-gray-400">
                  Balance: <span className="text-[#14F195] font-mono">{userBalance.toLocaleString()}</span>
                  <button
                    type="button"
                    onClick={() => setTransferAmount(userBalance.toString())}
                    className="ml-2 text-[#14F195] hover:underline"
                  >
                    MAX
                  </button>
                </span>
              </div>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={transferAmount}
                onChange={(e) => setTransferAmount(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="100"
                className="w-full bg-[#1a1c2e] border border-[#14F195]/30 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#14F195] transition-colors"
                disabled={loading}
              />
              <p className="text-xs text-gray-500 mt-1">
                These tokens will be escrowed until the vote ends.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#14F195] mb-2">
                Destination Address
              </label>
              <input
                type="text"
                value={destinationAddress}
                onChange={(e) => setDestinationAddress(e.target.value)}
                placeholder="Recipient wallet address..."
                className="w-full bg-[#1a1c2e] border border-[#14F195]/30 rounded-lg px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-[#14F195] transition-colors"
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#14F195] mb-2">
                Timelock (seconds after voting ends)
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={timelockSeconds}
                onChange={(e) => setTimelockSeconds(e.target.value.replace(/[^0-9]/g, ''))}
                className="w-full bg-[#1a1c2e] border border-[#14F195]/30 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#14F195] transition-colors"
                placeholder="60"
                disabled={loading}
              />
              <p className="text-xs text-gray-500 mt-1">
                Grace period before execution is allowed. Set to 0 for immediate.
              </p>
            </div>
          </div>
        )}

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
            {loading ? 'Creating...' : (isTreasuryProposal ? 'Create & Deposit Tokens' : 'Create Proposal')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateProposal;

