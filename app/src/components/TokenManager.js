import React, { useState, useEffect } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';

import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  createInitializeMintInstruction,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  getAccount
} from '@solana/spl-token';
import { PublicKey, Keypair, SystemProgram, Transaction } from '@solana/web3.js';
import { program, globalAccountPDAAddress, programId, globalStateSeed } from '../config';
import { Activity } from 'lucide-react';

const TokenManager = () => {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const [tokenMint, setTokenMint] = useState('');
  const [tokenBalance, setTokenBalance] = useState(0);
  const [mintAmount, setMintAmount] = useState(100);
  const [recipientAddress, setRecipientAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [isInitialized, setIsInitialized] = useState(false);
  const [admin, setAdmin] = useState(null);
  const [systemEnabled, setSystemEnabled] = useState(true); // Default true until fetched
  const [toggling, setToggling] = useState(false);

  // Fetch Global Account to check for existing mint
  useEffect(() => {
    const fetchGlobalAccount = async () => {
        try {
            const votingProgram = program({ publicKey: null });
            const globalAccount = await votingProgram.account.globalAccount.fetch(globalAccountPDAAddress);
            setAdmin(globalAccount.admin.toString());
            if (globalAccount.tokenMint) {
                setTokenMint(globalAccount.tokenMint.toString());
                setIsInitialized(true);
            }
            if (globalAccount.systemEnabled !== undefined) {
               setSystemEnabled(globalAccount.systemEnabled);
            }
        } catch (e) {
            console.log("Global account not initialized or error fetching", e);
            setIsInitialized(false);
        }
    };
    fetchGlobalAccount();
  }, []);

  // Load token balance when wallet connects and mint is known
  useEffect(() => {
    if (publicKey && tokenMint) {
      loadTokenBalance();
    }
  }, [publicKey, tokenMint]);


  const loadTokenBalance = async () => {
    try {
      if (!publicKey || !tokenMint) return;

      const mintPubkey = new PublicKey(tokenMint);
      const ata = await getAssociatedTokenAddress(mintPubkey, publicKey);
      
      try {
          const accountInfo = await getAccount(connection, ata);
          setTokenBalance(Number(accountInfo.amount));
      } catch (e) {
          setTokenBalance(0);
      }
    } catch (error) {
      console.error('Error loading token balance:', error);
    }
  };

  const handleInitializeDAO = async () => {
      if (!publicKey) {
          setMessage('Please connect your wallet first');
          return;
      }
      setLoading(true);
      setMessage('Initializing DAO...');
      
      try {
          // 1. Create Mint Keypair
          const mintKeypair = Keypair.generate();
          const mintPubkey = mintKeypair.publicKey;
          
          // 2. Create Instructions
          const lamports = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);
          
          const createMintAccountIx = SystemProgram.createAccount({
              fromPubkey: publicKey,
              newAccountPubkey: mintPubkey,
              space: MINT_SIZE,
              lamports,
              programId: TOKEN_PROGRAM_ID,
          });
          
          const initMintIx = createInitializeMintInstruction(
              mintPubkey,
              0, // decimals
              publicKey, // mint authority
              publicKey // freeze authority
          );
          
          const votingProgram = program({ publicKey });
          const initDaoIx = await votingProgram.methods
            .initialize()
            .accounts({
                globalAccount: globalAccountPDAAddress,
                tokenMint: mintPubkey,
                user: publicKey,
                systemProgram: SystemProgram.programId,
            })
            .instruction();
            
          const transaction = new Transaction().add(createMintAccountIx, initMintIx, initDaoIx);
          
          // Sign with wallet AND mint keypair
          const signature = await sendTransaction(transaction, connection, { signers: [mintKeypair] });
          
          await connection.confirmTransaction(signature, 'confirmed');
          
          setTokenMint(mintPubkey.toString());
          setIsInitialized(true);
          setMessage(`DAO Initialized with Mint: ${mintPubkey.toString()}`);
          
      } catch (error) {
          console.error(error);
          setMessage(`Error: ${error.message}`);
      } finally {
          setLoading(false);
      }
  };

  const handleMintTokens = async () => {
    if (!publicKey || !tokenMint) return;

    setLoading(true);
    setMessage('Minting tokens...');

    try {
      const mintPubkey = new PublicKey(tokenMint);
      let targetPubkey = publicKey;

      if (recipientAddress) {
        try {
          targetPubkey = new PublicKey(recipientAddress);
        } catch (e) {
          throw new Error('Invalid recipient address');
        }
      }

      const ata = await getAssociatedTokenAddress(mintPubkey, targetPubkey);
      
      const transaction = new Transaction();
      
      // Check if ATA exists
      try {
          await getAccount(connection, ata);
      } catch (e) {
          // Create ATA if it doesn't exist
          transaction.add(
              createAssociatedTokenAccountInstruction(
                  publicKey, // payer
                  ata, // associatedToken
                  targetPubkey, // owner
                  mintPubkey // mint
              )
          );
      }
      
      // Mint tokens
      transaction.add(
          createMintToInstruction(
              mintPubkey,
              ata,
              publicKey, // authority
              mintAmount
          )
      );
      
      const signature = await sendTransaction(transaction, connection);
      await connection.confirmTransaction(signature, 'confirmed');
      
      setMessage(`Successfully minted ${mintAmount} tokens to ${targetPubkey.toString().slice(0, 4)}...${targetPubkey.toString().slice(-4)}!`);
      if (targetPubkey.equals(publicKey)) {
        await loadTokenBalance();
      }
      
    } catch (error) {
      console.error('Error minting tokens:', error);
      setMessage(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const toggleCircuitBreaker = async () => {
    // Define isAdmin based on the existing access control logic
    const isAdmin = publicKey && (publicKey.toString() === upgradeAuthority || (admin && publicKey.toString() === admin));
    if (!isAdmin) return;
    setToggling(true);
    setMessage('');

    try {
        const votingProgram = program({ publicKey });
        const [globalAccountPDA] = PublicKey.findProgramAddressSync([Buffer.from(globalStateSeed)], programId);

        const tx = await votingProgram.methods.toggleCircuitBreaker()
            .accounts({
                globalAccount: globalAccountPDA,
                user: publicKey,
            })
            .transaction();
            
        const signature = await sendTransaction(tx, connection);
        await connection.confirmTransaction(signature, 'confirmed');

        setSystemEnabled(prev => !prev);
        setMessage(!systemEnabled ? "System Restored: Voting Enabled" : "System Shutdown: Voting Disabled");

    } catch (e) {
        console.error("Error toggling CB:", e);
        setMessage("Error: " + e.message);
    } finally {
        setToggling(false);
    }
  };

  // Dynamic Admin Check via Upgrade Authority
  const [upgradeAuthority, setUpgradeAuthority] = useState(null);

  useEffect(() => {
     const getUpgradeAuthority = async () => {
         try {
             // See Sidebar.js for logic explanation
             const programAccountInfo = await connection.getAccountInfo(programId);
             const programDataAddress = new PublicKey(programAccountInfo.data.slice(4, 36));
             const programDataAccountInfo = await connection.getAccountInfo(programDataAddress);
             const upgradeAuthorityAddress = new PublicKey(programDataAccountInfo.data.slice(13, 45));
             setUpgradeAuthority(upgradeAuthorityAddress.toString());
         } catch (e) {
             console.log("Error fetching UA", e);
         }
     };
     if (connection && programId) getUpgradeAuthority();
  }, [connection]);

  // Define isAdmin here to be used in the render logic and toggleCircuitBreaker
  const isAdmin = publicKey && (publicKey.toString() === upgradeAuthority || (admin && publicKey.toString() === admin));

  if (!publicKey || !isAdmin) {
    return (
      <div className="bg-[#0f1117] rounded-2xl p-8 border border-white/10 backdrop-blur-sm text-center">
        <h2 className="text-2xl font-bold text-white mb-4">Access Denied</h2>
        <p className="text-gray-400">Only the DAO Admin can access the Token Manager.</p>
        {!publicKey && <p className="text-sm text-gray-500 mt-2">Please connect your wallet.</p>}
      </div>
    );
  }

  return (
    <div className="bg-[#0f1117] rounded-2xl p-8 border border-white/10 backdrop-blur-sm">
      <h2 className="text-3xl font-bold text-white mb-6 bg-gradient-to-r from-[#14F195] to-[#9945FF] bg-clip-text text-transparent">
        DAO Admin
      </h2>

      {/* Token Mint Section */}
      <div className="mb-8">
        <h3 className="text-xl font-semibold text-white mb-4">Token Mint</h3>
        
        {tokenMint ? (
          <div className="space-y-4">
            <div className="bg-[#1a1c2e] rounded-lg p-4 border border-white/5">
              <p className="text-sm text-gray-400 mb-2">Current Token Mint:</p>
              <p className="text-white font-mono text-sm break-all">{tokenMint}</p>
            </div>
            
            <div className="bg-[#1a1c2e] rounded-lg p-4 border border-white/5">
              <p className="text-sm text-gray-400 mb-2">Your Token Balance:</p>
              <p className="text-3xl font-bold text-[#14F195]">{tokenBalance.toLocaleString()}</p>
              <p className="text-xs text-gray-500 mt-1">
                Voting Power: {Math.floor(Math.sqrt(tokenBalance))} votes
              </p>
            </div>
          </div>
        ) : (
          <button
            onClick={handleInitializeDAO}
            disabled={loading || !publicKey}
            className="w-full bg-gradient-to-r from-[#14F195] to-[#9945FF] text-white font-bold py-3 px-6 rounded-xl hover:shadow-[0_0_20px_rgba(20,241,149,0.5)] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Initializing...' : 'Initialize DAO & Create Mint'}
          </button>
        )}
      </div>

      {/* Mint Tokens Section */}
      {tokenMint && (
        <div className="mb-8">
          <h3 className="text-xl font-semibold text-white mb-4">Mint Tokens</h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Recipient Address (Optional)
              </label>
              <input
                type="text"
                value={recipientAddress}
                onChange={(e) => setRecipientAddress(e.target.value)}
                placeholder="Leave empty to mint to yourself"
                className="w-full bg-[#1a1c2e] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#14F195] transition-colors mb-1"
                disabled={loading}
              />
              <p className="text-xs text-gray-500">
                Enter a Solana wallet address to airdrop tokens to another user.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Amount to Mint
              </label>
              <input
                type="number"
                value={mintAmount}
                onChange={(e) => setMintAmount(Number(e.target.value))}
                className="w-full bg-[#1a1c2e] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#14F195] transition-colors"
                min="1"
                disabled={loading}
              />
              <p className="text-xs text-gray-500 mt-2">
                This will give you {Math.floor(Math.sqrt(mintAmount))} voting power
              </p>
            </div>

            <button
              onClick={handleMintTokens}
              disabled={loading || !publicKey}
              className="w-full bg-gradient-to-r from-[#9945FF] to-[#14F195] text-white font-bold py-3 px-6 rounded-xl hover:shadow-[0_0_20px_rgba(153,69,255,0.5)] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Minting...' : 'Mint Tokens'}
            </button>
          </div>
        </div>
      )}

      {/* Message Display */}
      {message && (
        <div className={`mt-6 p-4 rounded-lg ${
          message.includes('Error') 
            ? 'bg-red-500/10 border border-red-500/20 text-red-400' 
            : 'bg-[#14F195]/10 border border-[#14F195]/20 text-[#14F195]'
        }`}>
          <p className="text-sm">{message}</p>
        </div>
      )}

      {/* Info Box */}
      {/* ... Info Box removed ... */}

       {/* Circuit Breaker Section */}
      {isInitialized && isAdmin && (
          <div className="mt-8 pt-8 border-t border-white/10">
              <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                 <Activity className="text-red-500" /> Circuit Breaker
              </h3>
              
              <div className="bg-black/40 rounded-xl p-6 border border-red-500/20">
                  <div>
                      <p className="text-gray-300 font-medium mb-1">Emergency Stop</p>
                      <p className="text-sm text-gray-500">
                              Current Status: <span className={systemEnabled ? "text-green-400 font-bold" : "text-red-500 font-bold"}>
                                  {systemEnabled ? "SYSTEM ONLINE" : "SYSTEM OFFLINE"}
                              </span>
                          </p>
                      </div>
                      
                      <p className="text-gray-500 text-xs mt-2">
                          Manually prevent any new votes from being cast in case of emergency. <br/>
                          Current: {systemEnabled ? "Voting Active" : "Voting Paused"}
                      </p>

                      <button 
                          onClick={toggleCircuitBreaker}
                          disabled={toggling}
                          className={`mt-4 w-full py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition-all ${
                              systemEnabled 
                              ? 'bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20' 
                              : 'bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20'
                          }`}
                      >
                          {toggling ? 'Processing...' : (systemEnabled ? 'SHUT DOWN SYSTEM' : 'RESTORE SYSTEM')}
                      </button>
              </div>
          </div>
      )}
    </div>
  );
};

export default TokenManager;
