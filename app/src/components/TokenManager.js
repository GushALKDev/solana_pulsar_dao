import React, { useState, useEffect } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';

import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  createInitializeMintInstruction,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  getAccount,
  createSetAuthorityInstruction,
  AuthorityType,
  getMint
} from '@solana/spl-token';
import { PublicKey, Keypair, SystemProgram, Transaction } from '@solana/web3.js';
import { BN } from 'bn.js';
import { program, globalAccountPDAAddress, programId, globalStateSeed, delegateProfileSeed, delegationRecordSeed } from '../config';
import { Activity, Coins, Shield, AlertTriangle, Users, Trash2, Loader2 } from 'lucide-react';

const TokenManager = () => {
  const wallet = useWallet();
  const { publicKey, sendTransaction } = wallet;
  const { connection } = useConnection();
  const [tokenMint, setTokenMint] = useState('');
  const [tokenBalance, setTokenBalance] = useState(0);
  const [mintAmount, setMintAmount] = useState('100');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [isInitialized, setIsInitialized] = useState(false);
  const [admin, setAdmin] = useState(null);
  const [systemEnabled, setSystemEnabled] = useState(true); // Default true until fetched
  const [toggling, setToggling] = useState(false);
  
  // Tabs: 'tokens', 'delegation', 'security'
  const [activeTab, setActiveTab] = useState('tokens');
  
  // Delegation State
  const [newDelegateAddress, setNewDelegateAddress] = useState('');
  const [delegates, setDelegates] = useState([]);
  const [delegatorCounts, setDelegatorCounts] = useState({});
  const [delegateActionLoading, setDelegateActionLoading] = useState(false);

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
      fetchTokenInfo();
    }
  }, [publicKey, tokenMint]);


  const fetchTokenInfo = async () => {
    try {
      if (!publicKey || !tokenMint) return;

      const mintPubkey = new PublicKey(tokenMint);
      const mintInfo = await getMint(connection, mintPubkey); // Fetch mint info for decimals
      const ata = await getAssociatedTokenAddress(mintPubkey, publicKey);
      
      try {
          const accountInfo = await getAccount(connection, ata);
          setTokenBalance(Number(accountInfo.amount) / (10 ** mintInfo.decimals)); 
      } catch (e) {
          setTokenBalance(0);
      }
    } catch (error) {
      console.error('Error loading token balance:', error);
    }
  };

  const fetchDelegates = async () => {
       try {
           const daoProgram = program(wallet);
           // Fetch all profiles
           const profiles = await daoProgram.account.delegateProfile.all();
           const activeProfiles = profiles.filter(p => p.account.isActive);
           
           // Fetch all delegation records to count
           const records = await daoProgram.account.delegationRecord.all();
           const counts = {};
           records.forEach(r => {
                const target = r.account.delegateTarget.toString();
                counts[target] = (counts[target] || 0) + 1;
           });

           setDelegates(activeProfiles.map(p => ({
               address: p.account.authority.toString(),
               publicKey: p.account.authority
           })));
           setDelegatorCounts(counts);

       } catch(e) {
           console.error("Error fetching delegates", e);
       }
  };
  
  useEffect(() => {
    if (wallet && wallet.publicKey) {
       fetchTokenInfo();
       if (activeTab === 'delegation') {
           fetchDelegates();
       }
    }
  }, [wallet, activeTab, tokenMint]); // Added tokenMint as dependency for fetchTokenInfo

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

          // Transfer Mint Authority to PDA
          const setAuthorityIx = createSetAuthorityInstruction(
              mintPubkey,
              publicKey, // current authority
              AuthorityType.MintTokens,
              globalAccountPDAAddress // new authority (PDA)
          );
            
          const transaction = new Transaction().add(createMintAccountIx, initMintIx, initDaoIx, setAuthorityIx);
          
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
      
      // Mint using Admin Logic (via Program)
      // Since we transferred authority to the PDA, we can no longer mint directly.
      // We must ask the program to mint for us (if we are admin).
      
      const votingProgram = program(wallet);
      
      const mintTx = await votingProgram.methods
        .adminMint(new BN(mintAmount))
        .accounts({
            globalAccount: globalAccountPDAAddress,
            tokenMint: mintPubkey,
            targetTokenAccount: ata,
            admin: publicKey,
            tokenProgram: TOKEN_PROGRAM_ID
        })
        .transaction();

      transaction.add(mintTx);
      
      const signature = await sendTransaction(transaction, connection);
      await connection.confirmTransaction(signature, 'confirmed');
      
      setMessage(`Successfully minted ${mintAmount} tokens to ${targetPubkey.toString().slice(0, 4)}...${targetPubkey.toString().slice(-4)}!`);
      if (targetPubkey.equals(publicKey)) {
        await fetchTokenInfo(); // Changed to fetchTokenInfo
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
        const votingProgram = program(wallet);
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

  const handleRegisterDelegate = async () => {
       const isAdmin = publicKey && (publicKey.toString() === upgradeAuthority || (admin && publicKey.toString() === admin));
       if (!isAdmin || !newDelegateAddress) return;
       setDelegateActionLoading(true);
       try {
           const daoProgram = program(wallet);
           const targetPubkey = new PublicKey(newDelegateAddress);
           
           // Pre-check: Is this user ALREADY a Delegator?
           const [delegationRecordPDA] = PublicKey.findProgramAddressSync(
               [Buffer.from(delegationRecordSeed), targetPubkey.toBuffer()],
               programId
           );
           
           try {
               await daoProgram.account.delegationRecord.fetch(delegationRecordPDA);
               // If successful, they have a record!
               setMessage("Failed: This user is already delegating to someone. They must revoke first.");
               setDelegateActionLoading(false);
               return; 
           } catch (e) {
               // Expected: Account not found error means they are free
           }

           const [profilePDA] = PublicKey.findProgramAddressSync(
               [Buffer.from(delegateProfileSeed), targetPubkey.toBuffer()],
               programId
           );
           const [globalAccountPDA] = PublicKey.findProgramAddressSync([Buffer.from(globalStateSeed)], programId);

           await daoProgram.methods.registerDelegate()
             .accounts({
                 globalAccount: globalAccountPDA,
                 delegateProfile: profilePDA,
                 targetUser: targetPubkey,
                 admin: publicKey,
                 systemProgram: SystemProgram.programId
             })
             .rpc();
             
           setNewDelegateAddress('');
           setMessage(`Successfully registered delegate: ${targetPubkey.toString()}`);
           
           // Optimistic Update
           setDelegates(prev => [...prev, {
               address: targetPubkey.toString(),
               publicKey: targetPubkey
           }]);
           // Do NOT fetchDelegates immediately as it may return stale data
       } catch(e) {
           console.error("Registration failed", e);
           setMessage("Failed: " + e.message);
       } finally {
           setDelegateActionLoading(false);
       }
  };

  const handleRemoveDelegate = async (targetAddr) => {
       if (!publicKey) return;
       if (!window.confirm("Are you sure you want to remove this delegate? This will close their profile.")) return;

       setDelegateActionLoading(true);
       try {
           const daoProgram = program(wallet);
           const targetPubkey = new PublicKey(targetAddr);
           const [profilePDA] = PublicKey.findProgramAddressSync(
               [Buffer.from(delegateProfileSeed), targetPubkey.toBuffer()],
               programId
           );
           
           const [globalAccountPDA] = PublicKey.findProgramAddressSync([Buffer.from(globalStateSeed)], programId);

           await daoProgram.methods.removeDelegate()
             .accounts({
                 globalAccount: globalAccountPDA,
                 delegateProfile: profilePDA,
                 targetUser: targetPubkey,
                 admin: publicKey,
             })
             .rpc();
            
           setMessage(`Successfully removed delegate: ${targetPubkey.toString()}`);
           
           // Optimistically update UI to avoid RPC latency issues
           setDelegates(prev => prev.filter(d => d.address !== targetAddr));
           // Do NOT fetchDelegates immediately to prevent reversion to stale state
       } catch(e) {
           console.error("Remove failed", e);
           setMessage("Failed: " + e.message);
       } finally {
           setDelegateActionLoading(false);
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
    <div className="max-w-7xl mx-auto p-8">
    <div className="bg-[#0f1117] rounded-2xl p-8 border border-white/10 backdrop-blur-sm">
      <h2 className="text-3xl font-bold text-white mb-6 bg-gradient-to-r from-[#14F195] to-[#9945FF] bg-clip-text text-transparent">
        DAO Admin
      </h2>

      {/* Tabs Navigation */}
      <div className="flex space-x-2 mb-8 border-b border-white/10 pb-4">
          <button
              onClick={() => setActiveTab('tokens')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${activeTab === 'tokens' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
          >
              <Coins size={18} /> Tokens
          </button>
          <button
              onClick={() => setActiveTab('delegation')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${activeTab === 'delegation' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
          >
              <Users size={18} /> Delegation
          </button>
          <button
              onClick={() => setActiveTab('security')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${activeTab === 'security' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
          >
              <Shield size={18} /> Security
          </button>
      </div>

      {/* Message Display */}
      {message && (
        <div className={`mb-6 p-4 rounded-lg flex items-center gap-2 ${
          message.includes('Error') || message.includes('Failed')
            ? 'bg-red-500/10 border border-red-500/20 text-red-400' 
            : 'bg-[#14F195]/10 border border-[#14F195]/20 text-[#14F195]'
        }`}>
          {message.includes('Error') || message.includes('Failed') ? <AlertTriangle size={16} /> : <Activity size={16} />}
          <p className="text-sm">{message}</p>
        </div>
      )}

      {/* TOKENS TAB */}
      {activeTab === 'tokens' && (
          <div className="animate-in fade-in duration-300">
             {/* Token Mint Section */}
             <div className="mb-8">
               <h3 className="text-xl font-semibold text-white mb-4">Token Configuration</h3>
               
               {tokenMint ? (
                 <div className="space-y-4">
                   <div className="bg-[#1a1c2e] rounded-lg p-4 border border-white/5">
                     <p className="text-sm text-gray-400 mb-2">Current Token Mint:</p>
                     <p className="text-white font-mono text-sm break-all">{tokenMint}</p>
                   </div>
                   
                   <div className="bg-[#1a1c2e] rounded-lg p-4 border border-white/5">
                     <p className="text-sm text-gray-400 mb-2">Your Token Balance (Admin):</p>
                     <p className="text-3xl font-bold text-[#14F195]">{tokenBalance.toLocaleString()}</p>
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
                   </div>

                   <div>
                     <label className="block text-sm font-medium text-gray-300 mb-2">
                       Amount to Mint
                     </label>
                     <input
                       type="text"
                       inputMode="numeric"
                       pattern="[0-9]*"
                       value={mintAmount}
                       onChange={(e) => setMintAmount(e.target.value.replace(/[^0-9]/g, ''))}
                       className="w-full bg-[#1a1c2e] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#14F195] transition-colors"
                       placeholder="100"
                       disabled={loading}
                     />
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
          </div>
      )}

      {/* DELEGATION TAB */}
      {activeTab === 'delegation' && (
          <div className="animate-in fade-in duration-300">
             <h3 className="text-xl font-semibold text-white mb-4">Register Delegate</h3>
             <p className="text-sm text-gray-400 mb-6">Authorize a new address to become a Delegate. They will appear in the public Delegation list.</p>
             
             <div className="space-y-4">
                  <div>
                     <label className="block text-sm font-medium text-gray-300 mb-2">
                       Candidate Wallet Address
                     </label>
                     <input
                       type="text"
                       value={newDelegateAddress}
                       onChange={(e) => setNewDelegateAddress(e.target.value)}
                       placeholder="Solana Address"
                       className="w-full bg-[#1a1c2e] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#14F195] transition-colors font-mono"
                       disabled={delegateActionLoading}
                     />
                   </div>
                   
                   <button 
                     onClick={handleRegisterDelegate}
                     disabled={delegateActionLoading || !newDelegateAddress}
                     className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold px-6 py-3 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                   >
                       {delegateActionLoading ? <Loader2 className="animate-spin" /> : <Users size={20} />}
                       Register Delegate
                   </button>
             </div>

            {/* Delegates List */}
            <div className="mt-8">
                <h3 className="text-white font-bold mb-4">Authorized Delegates</h3>
                <div className="space-y-3">
                    {delegates.map(d => (
                        <div key={d.address} className="bg-[#1a1c2e] border border-white/5 p-4 rounded-xl flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-full bg-[#14F195]/20 flex items-center justify-center text-[#14F195] font-bold">
                                    {d.address.slice(0,2)}
                                </div>
                                <div>
                                    <div className="font-mono text-white text-sm">
                                        {d.address.slice(0,6)}...{d.address.slice(-4)}
                                    </div>
                                    <div className="text-xs text-gray-400 flex items-center gap-1">
                                        <Users size={12} />
                                        {delegatorCounts[d.address] || 0} Delegators
                                    </div>
                                </div>
                            </div>
                            
                            <button 
                                onClick={() => handleRemoveDelegate(d.address)}
                                disabled={delegateActionLoading}
                                className="p-2 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors"
                                title="Remove Delegate"
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>
                    ))}
                    {delegates.length === 0 && (
                        <div className="text-center text-gray-500 py-8">No delegates registered</div>
                    )}
                </div>
            </div>
          </div>
      )}

      {/* SECURITY TAB */}
      {activeTab === 'security' && (
          <div className="animate-in fade-in duration-300">
             {isInitialized ? (
                  <div>
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
             ) : (
                 <p className="text-gray-400">Initialize DAO first to access security controls.</p>
             )}
          </div>
      )}
    </div>
    </div>
  );
};

export default TokenManager;
