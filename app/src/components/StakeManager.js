/* global BigInt */
import React, { useState, useEffect } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import * as anchor from '@coral-xyz/anchor';
import { PublicKey, Transaction, SystemProgram, SYSVAR_RENT_PUBKEY, TransactionInstruction } from '@solana/web3.js';
import { BN, Program, AnchorProvider, web3 } from '@coral-xyz/anchor';
import { program, programId, globalStateSeed } from '../config';
import { Lock, Unlock, AlertTriangle, TrendingUp, Loader2, CheckCircle } from 'lucide-react';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import idl from '../idl/pulsar_dao.json';

const STAKE_RECORD_SEED = 'stake_record';

const StakeManager = ({ tokenMintAddress }) => {
    // ... no changes in hooks ...
    const { connection } = useConnection();
    const { publicKey, sendTransaction } = useWallet();
    const [stakeRecord, setStakeRecord] = useState(null);
    const [amount, setAmount] = useState('');
    const [lockPeriod, setLockPeriod] = useState(30);
    const [userBalance, setUserBalance] = useState(0);
    const [loading, setLoading] = useState(false);
    const [decimals, setDecimals] = useState(0);
    const [error, setError] = useState(null);
    const [actionSuccess, setActionSuccess] = useState('');

    // ... useEffects ...
    useEffect(() => {
        if (!publicKey || !tokenMintAddress) return;

        const fetchData = async () => {
            try {
                // Get Token Decimals
                try {
                    const mintInfo = await connection.getParsedAccountInfo(new PublicKey(tokenMintAddress));
                    const decimals = mintInfo.value?.data?.parsed?.info?.decimals || 0;
                    setDecimals(decimals);
                } catch (e) {
                    console.log("Error fetching decimals, defaulting to 0", e);
                }

                // Get User Balance
                const userATA = await getAssociatedTokenAddress(new PublicKey(tokenMintAddress), publicKey);
                try {
                    const balance = await connection.getTokenAccountBalance(userATA);
                    setUserBalance(balance.value.uiAmount || 0);
                } catch (e) {
                    setUserBalance(0);
                }
                 fetchStakeRecord();
            } catch (err) {
                console.error("Error fetching data:", err);
            }
        };

        fetchData();
        const interval = setInterval(fetchData, 10000);
        return () => clearInterval(interval);
    }, [publicKey, tokenMintAddress, connection]);

    useEffect(() => {
        if (stakeRecord) {
             const currentDays = stakeRecord.originalLockDays.toNumber();
             if (lockPeriod < currentDays) {
                 setLockPeriod(currentDays);
             }
        }
    }, [stakeRecord, lockPeriod]);

    const fetchStakeRecord = async () => {
        if (!publicKey) return null;
        try {
            const votingProgram = program({ publicKey });
            const [stakeRecordPDA] = PublicKey.findProgramAddressSync(
                [Buffer.from(STAKE_RECORD_SEED), publicKey.toBuffer()],
                programId
            );

            try {
                const record = await votingProgram.account.voterStakeRecord.fetch(stakeRecordPDA);
                setStakeRecord(record);
                return record;
            } catch (e) {
                setStakeRecord(null); 
                return null;
            }
        } catch (e) {
            console.error("Error fetching stake record:", e);
            return null;
        }
    };
    
    // ... helpers ...
    const getMultiplier = (days) => {
        if (days < 30) return 1;
        const raw = 1 + Math.floor(days / 30);
        return Math.min(raw, 5); // Cap to 5x
    };

    const getPreviewDetails = () => {
        const inputAmount = parseFloat(amount) || 0;
        const currentLiquid = parseFloat(userBalance) || 0;
        const currentStaked = stakeRecord ? parseFloat(stakeRecord.stakedAmount.toString()) : 0; 
        
        const futureLiquid = Math.max(0, currentLiquid - inputAmount);
        const futureStaked = currentStaked + inputAmount;
        const multiplier = getMultiplier(lockPeriod);

        const liquidPower = Math.sqrt(futureLiquid);
        const stakedBase = Math.sqrt(futureStaked);
        const stakedPower = stakedBase * multiplier;

        return {
            total: Math.round(liquidPower + stakedPower),
            liquidVP: Math.round(liquidPower),
            stakedVP: Math.round(stakedPower),
            futureLiquid,
            futureStaked,
            multiplier,
            stakedBaseVP: Math.round(stakedBase)
        };
    };

    const handleStake = async () => {
        if (!publicKey || !amount || !lockPeriod) return;
        setLoading(true);
        setError(null);

        try {
            const votingProgram = program({ publicKey });
            
            // Re-derive PDAs
            const [stakeRecordPDA] = PublicKey.findProgramAddressSync(
                [Buffer.from('stake_record'), publicKey.toBuffer()],
                programId
            );
            const [globalAccountPDA] = PublicKey.findProgramAddressSync(
                [Buffer.from(globalStateSeed)],
                programId
            );
            const [vaultPDA] = PublicKey.findProgramAddressSync(
                [Buffer.from('vault'), new PublicKey(tokenMintAddress).toBuffer()],
                programId
            );
            const userATA = await getAssociatedTokenAddress(new PublicKey(tokenMintAddress), publicKey);

            const transaction = new Transaction();

            // 1. Check Init (Fetch manually)
            const stakeAccountInfo = await connection.getAccountInfo(stakeRecordPDA);
            if (!stakeAccountInfo) {
                const initIx = await votingProgram.methods
                    .initializeStake()
                    .accounts({
                        stakeRecord: stakeRecordPDA,
                        user: publicKey,
                        systemProgram: SystemProgram.programId,
                    })
                    .instruction();
                transaction.add(initIx);
            }

            // 2. Deposit Instruction
            // 2. Deposit Instruction
            const depositIx = await votingProgram.methods
                .depositTokens(new BN(amount), new BN(lockPeriod))
                .accounts({
                    globalAccount: globalAccountPDA,
                    stakeRecord: stakeRecordPDA,
                    vault: vaultPDA,
                    tokenMint: new PublicKey(tokenMintAddress),
                    userTokenAccount: userATA,
                    user: publicKey,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                    rent: SYSVAR_RENT_PUBKEY
                })
                .instruction();
            transaction.add(depositIx);

            // Send
            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = publicKey;

            const signature = await sendTransaction(transaction, connection);

            await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight });
            
            // Helper for success effects (polling handled in UI or reload)
            // Wait a bit for polling to catch up or manually trigger
            let retries = 10;
            const initialStaked = stakeRecord ? Number(stakeRecord.stakedAmount) : 0;
            while (retries > 0) {
                 await new Promise(r => setTimeout(r, 1000));
                 const updated = await fetchStakeRecord();
                 const newStaked = updated ? Number(updated.stakedAmount) : 0;
                 if (newStaked !== initialStaked) break;
                 retries--;
            }

             setLoading(false);
             setActionSuccess('Tokens Staked!');
             setTimeout(() => setActionSuccess(''), 2000);
             setAmount('');

        } catch (err) {
            console.error("Staking Error:", err);
            setError("Failed to stake tokens: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleUnstake = async () => {
        if (!publicKey) return;
        setLoading(true);
        setError(null);

        try {
            const votingProgram = program({ publicKey, sendTransaction });
            
            // Re-derive PDAs (Clean way)
            const [stakeRecordPDA] = PublicKey.findProgramAddressSync([Buffer.from(STAKE_RECORD_SEED), publicKey.toBuffer()], programId);
            const tokenMint = new PublicKey(tokenMintAddress);
            const [vaultPDA] = PublicKey.findProgramAddressSync([Buffer.from('vault'), tokenMint.toBuffer()], programId);
            const userATA = await getAssociatedTokenAddress(tokenMint, publicKey);
            
            const transaction = await votingProgram.methods
                .unstakeTokens()
                .accounts({
                    stakeRecord: stakeRecordPDA,
                    vault: vaultPDA,
                    tokenMint: tokenMint,
                    userTokenAccount: userATA,
                    user: publicKey,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                })
                .transaction();

            // Send
            const signature = await sendTransaction(transaction, connection);
            await connection.confirmTransaction(signature, 'finalized');
            
            // Wait for data update
            const initialStaked = stakeRecord ? stakeRecord.stakedAmount.toNumber() : 0;
            let retries = 10;
            while (retries > 0) {
                 await new Promise(r => setTimeout(r, 1000));
                 const updated = await fetchStakeRecord();
                 const newStaked = updated ? updated.stakedAmount.toNumber() : 0;
                 if (newStaked !== initialStaked) break;
                 retries--;
            }

            setLoading(false);
            setActionSuccess('Tokens Unstaked!');
            setTimeout(() => setActionSuccess(''), 2000);

        } catch (err) {
            console.error("Unstake Error:", err);
            setError("Failed to unstake: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const preview = getPreviewDetails();

    return (
        <div className="bg-[#13141f] rounded-2xl border border-white/5 p-6 mb-8 relative overflow-hidden">
            {/* LOADING / SUCCESS OVERLAY */}
            {(loading || actionSuccess) && (
                <div className="absolute inset-0 bg-black/50 backdrop-blur-sm z-50 flex flex-col items-center justify-center transition-all duration-300">
                    {actionSuccess ? (
                         <>
                             <CheckCircle className="w-12 h-12 text-pulsar-primary animate-bounce mb-4" />
                             <span className="text-white font-bold text-xl animate-in fade-in">{actionSuccess}</span>
                         </>
                    ) : (
                        <>
                             <Loader2 className="w-10 h-10 text-pulsar-primary animate-spin mb-2" />
                             <span className="text-white font-medium text-sm animate-pulse">Updating Vault...</span>
                        </>
                    )}
                </div>
            )}

            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                <Lock className="text-pulsar-primary h-5 w-5" />
                Staking & Voting Power
            </h2>

            {/* ERROR MESSAGE */}
            {error && (
                <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-500 p-3 rounded-lg text-sm flex items-center gap-2">
                    <AlertTriangle size={16} />
                    {error}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* STAKE FORM */}
                <div className="space-y-6">
                    <div>
                        <div className="flex justify-between mb-2">
                             <label className="block text-gray-400 text-sm">Amount to Stake</label>
                             <span className="text-xs text-gray-400">
                                 Balance: <span className="text-white font-mono">{userBalance.toLocaleString()}</span>
                             </span>
                        </div>
                        <div className="relative">
                            <input 
                                type="number" 
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="w-full bg-black/20 border border-white/10 rounded-xl p-4 text-white placeholder-gray-600 focus:outline-none focus:border-pulsar-primary transition-colors"
                                placeholder="0.00"
                            />
                            <button 
                                onClick={() => setAmount(userBalance)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs bg-pulsar-primary/20 text-pulsar-primary px-2 py-1 rounded hover:bg-pulsar-primary/30"
                            >
                                MAX
                            </button>
                        </div>
                        <p className="text-[10px] text-gray-600 mt-1 font-mono">Mint: {tokenMintAddress?.slice(0,6)}...{tokenMintAddress?.slice(-4)}</p>
                    </div>

                    <div>
                        <label className="block text-gray-400 text-sm mb-2">Lock Duration</label>
                        <div className="grid grid-cols-4 gap-2">
                            {[30, 90, 180, 360].map((days) => {
                                const currentDays = stakeRecord ? stakeRecord.originalLockDays.toNumber() : 0;
                                const isInvalid = currentDays > days;
                                return (
                                <button
                                    key={days}
                                    onClick={() => !isInvalid && setLockPeriod(days)}
                                    disabled={isInvalid}
                                    className={`p-3 rounded-lg border text-sm font-medium transition-all ${
                                        lockPeriod === days 
                                        ? 'bg-pulsar-primary/20 border-pulsar-primary text-white'
                                        : isInvalid
                                            ? 'bg-black/10 border-white/5 text-gray-600 cursor-not-allowed opacity-50'
                                            : 'bg-black/20 border-white/5 text-gray-400 hover:border-white/20'
                                    }`}
                                >
                                    {days}s
                                    <span className="block text-[10px] opacity-70 mt-1">
                                        {getMultiplier(days)}x Boost
                                    </span>
                                </button>
                                );
                            })}
                        </div>
                    </div>
                     
                    {/* PREVIEW */}
                    {/* PREVIEW */}
                    <div className="bg-black/20 rounded-xl p-4 border border-white/5">
                        <div className="flex justify-between items-center text-sm text-gray-400 mb-3">
                            <span>Projected Total Voting Power</span>
                            <div className="flex items-center gap-1 text-pulsar-primary">
                                <TrendingUp size={14} />
                                {preview.multiplier}x Staking Boost
                            </div>
                        </div>
                        
                        {/* COMPARISON HEADER */}
                        <div className="flex items-baseline gap-3 mb-4 font-mono">
                             <span className="text-gray-500 line-through text-lg">
                                {stakeRecord 
                                 ? (Math.round(Math.sqrt(parseFloat(userBalance) || 0) + Math.sqrt(stakeRecord.stakedAmount.toString()) * stakeRecord.multiplier.toNumber())).toLocaleString()
                                 : Math.round(Math.sqrt(parseFloat(userBalance) || 0)).toLocaleString()
                                }
                             </span>
                             <span className="text-gray-500">→</span>
                             <span className="text-3xl font-bold text-white text-glow">
                                {preview.total.toLocaleString()}
                             </span>
                        </div>
                        
                        {/* Formula Breakdown */}
                        <div className="space-y-2 bg-black/40 rounded-lg p-3 text-xs font-mono border border-white/5">
                             <div className="flex justify-between items-center text-gray-400">
                                 <span>Liquid: √{preview.futureLiquid.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                                 <span>{preview.liquidVP}</span>
                             </div>
                             <div className="flex justify-between items-center text-pulsar-primary font-bold">
                                  <span>Staked: √{preview.futureStaked.toLocaleString(undefined, { maximumFractionDigits: 2 })} × {preview.multiplier}x</span>
                                  <span>+ {preview.stakedVP}</span>
                             </div>
                             <div className="h-px bg-white/10 my-1"></div>
                             <div className="flex justify-between items-center text-white">
                                  <span>Total</span>
                                  <span>= {preview.total}</span>
                             </div>
                        </div>
                    </div>

                    <button 
                        onClick={handleStake}
                        disabled={loading || !amount || parseFloat(amount) <= 0 || parseFloat(amount) > userBalance}
                        className="w-full bg-pulsar-primary hover:bg-pulsar-primary/80 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2"
                    >
                        {loading ? <><Loader2 className="animate-spin" /> Processing...</> : 'Lock & Stake Tokens'}
                    </button>
                </div>

                {/* CURRENT STATUS */}
                <div className="bg-gradient-to-br from-pulsar-secondary/10 to-transparent rounded-xl border border-pulsar-secondary/20 p-6 flex flex-col justify-between">
                    <div>
                        <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                            The Vault
                        </h3>
                        
                        <div className="space-y-4">
                            <div className="flex justify-between items-start">
                                <span className="text-gray-400 text-sm">Staked Balance</span>
                                <div className="text-right">
                                    <div className="text-xl font-mono text-white">
                                        {stakeRecord ? (stakeRecord.stakedAmount.toString()) : "0"}
                                    </div>
                                    <div className="text-xs text-pulsar-secondary">Tokens Locked</div>
                                </div>
                            </div>

                            <div className="h-px bg-white/10" />

                            <div className="flex justify-between items-start">
                                <span className="text-gray-400 text-sm">Current Voting Power</span>
                                <div className="text-right">
                                    <div className="text-2xl font-bold text-white text-glow">
                                         {stakeRecord 
                                         ? (Math.round(Math.sqrt(parseFloat(userBalance) || 0) + Math.sqrt(stakeRecord.stakedAmount.toString()) * stakeRecord.multiplier.toNumber())).toLocaleString()
                                         : Math.round(Math.sqrt(parseFloat(userBalance) || 0)).toLocaleString()
                                         }
                                    </div>
                                    <div className="text-xs text-emerald-400 flex items-center justify-end gap-1">
                                        {stakeRecord ? `${stakeRecord.multiplier.toString()}x Boost Active` : "No Active Boost"}
                                    </div>
                                </div>
                            </div>

                            <div className="h-px bg-white/10" />

                             <div className="flex justify-between items-start">
                                <span className="text-gray-400 text-sm">Unlock Date</span>
                                <div className="text-right">
                                    <div className="text-sm text-white">
                                        {stakeRecord && stakeRecord.lockEndTime.toNumber() > 0
                                            ? new Date(stakeRecord.lockEndTime.toNumber() * 1000).toLocaleDateString() 
                                            : "No Lock"}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                         {stakeRecord && stakeRecord.lockEndTime.toNumber() * 1000 > Date.now() 
                                         ? `${Math.ceil((stakeRecord.lockEndTime.toNumber() * 1000 - Date.now()) / 1000)}s left` 
                                         : "Unlocked"}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <button 
                        onClick={handleUnstake}
                        disabled={loading || !stakeRecord || stakeRecord.stakedAmount.toNumber() === 0 || stakeRecord.lockEndTime.toNumber() * 1000 > Date.now()}
                        className="w-full mt-6 border border-white/20 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed text-white font-medium py-3 rounded-xl transition-all flex items-center justify-center gap-2"
                    >
                        {loading ? (
                             <><Loader2 className="animate-spin" /> Processing...</>
                        ) : (
                            <>
                                {stakeRecord && stakeRecord.lockEndTime.toNumber() * 1000 > Date.now() 
                                ? <Lock size={16} /> 
                                : <Unlock size={16} />}
                                {stakeRecord && stakeRecord.lockEndTime.toNumber() * 1000 > Date.now() 
                                 ? "Tokens Locked" 
                                 : "Unstake & Withdraw"}
                            </>
                        )}
                    </button>
                    
                </div>
            </div>
        </div>
    );
};

export default StakeManager;
