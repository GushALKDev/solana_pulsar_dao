import React, { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Trophy, Medal, Award, Loader2 } from 'lucide-react';
import { program, programId, userStatsSeed, badgeMintSeed, connection } from '../config';

const METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

const Leaderboard = () => {
    const { publicKey, sendTransaction } = useWallet();
    const [leaders, setLeaders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [userRank, setUserRank] = useState(null);

    useEffect(() => {
        const fetchLeaderboard = async () => {
             try {
                 const votingProgram = program({ publicKey: null });
                 
                 // Fetch all UserStats accounts
                 // We rely on the discriminator filter or just fetch all and filter client side
                 // Since we don't have discriminator exposed easily in IDL types sometimes, 
                 // we might just try fetching all of that specific account type if Anchor supports it.
                 // Anchor's program.account.userStats.all() does exactly this.
                 
                 const allStats = await votingProgram.account.userStats.all();
                 
                 const formatted = allStats.map(a => ({
                     pubkey: a.publicKey.toString(),
                     user: a.account.user.toString(),
                     proposalCount: Number(a.account.proposalCount),
                     score: Number(a.account.score),
                     lastVoteTime: Number(a.account.lastVoteTime),
                     badgeClaimed: a.account.badgeClaimed,
                 }));

                 // Sort by Score DESC, then ProposalCount DESC
                 formatted.sort((a, b) => {
                     if (b.score !== a.score) return b.score - a.score;
                     return b.proposalCount - a.proposalCount;
                 });

                 setLeaders(formatted);
                 
                 if (publicKey) {
                     const myIndex = formatted.findIndex(l => l.user === publicKey.toString());
                     if (myIndex !== -1) {
                         setUserRank({ rank: myIndex + 1, ...formatted[myIndex] });
                     }
                 }

                 setLoading(false);

             } catch (e) {
                 console.error("Error fetching leaderboard:", e);
                 setLoading(false);
             }
        };

        fetchLeaderboard();
        const interval = setInterval(fetchLeaderboard, 15000); // 15s Refresh
        return () => clearInterval(interval);
    }, [publicKey]);

    const getBadge = (rank) => {
        if (rank === 1) return <Trophy className="text-yellow-400" size={24} />;
        if (rank === 2) return <Medal className="text-gray-300" size={24} />;
        if (rank === 3) return <Medal className="text-amber-600" size={24} />;
        return <span className="text-gray-500 font-mono font-bold">#{rank}</span>;
    };
    
    const getLevel = (score) => {
        if (score >= 1000) return "Grandmaster Voter";
        if (score >= 500) return "Master Voter";
        if (score >= 100) return "Active Citizen";
        if (score >= 10) return "Novice Voter";
        return "Newcomer";
    }

    const handleClaimBadge = async () => {
        if (!publicKey) return;
        setActionLoading(true);
        try {
            const votingProgram = program({ publicKey, sendTransaction });
            
            // PDAs
            const [userStatsPDA] = PublicKey.findProgramAddressSync(
                [Buffer.from(userStatsSeed), publicKey.toBuffer()],
                programId
            );
            
            const [badgeMintPDA] = PublicKey.findProgramAddressSync(
                [Buffer.from(badgeMintSeed), publicKey.toBuffer()],
                programId
            );
            
            const userBadgeATA = await getAssociatedTokenAddress(badgeMintPDA, publicKey);
            
            const [metadataPDA] = PublicKey.findProgramAddressSync(
                [Buffer.from("metadata"), METADATA_PROGRAM_ID.toBuffer(), badgeMintPDA.toBuffer()],
                METADATA_PROGRAM_ID
            );
            
            const [masterEditionPDA] = PublicKey.findProgramAddressSync(
                [Buffer.from("metadata"), METADATA_PROGRAM_ID.toBuffer(), badgeMintPDA.toBuffer(), Buffer.from("edition")],
                METADATA_PROGRAM_ID
            );
            
            const tx = await votingProgram.methods.claimBadge()
                .accounts({
                    userStats: userStatsPDA,
                    badgeMint: badgeMintPDA,
                    metadataAccount: metadataPDA,
                    masterEdition: masterEditionPDA,
                    userBadgeTokenAccount: userBadgeATA,
                    user: publicKey,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                    tokenMetadataProgram: METADATA_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                    rent: SYSVAR_RENT_PUBKEY,
                })
                .transaction();
                
            const signature = await sendTransaction(tx, connection);
            await connection.confirmTransaction(signature, 'finalized');
            
            alert("Badge Clamied! You are now a Commander.");
            // Refresh
            window.location.reload();

        } catch(e) {
            console.error("Claim Error:", e);
            alert("Failed to claim badge: " + e.message);
        } finally {
            setActionLoading(false);
        }
    };

    return (
        <div className="space-y-8 p-8 max-w-5xl mx-auto">
             <div className="flex justify-between items-center border-b border-white/10 pb-6">
                <div>
                     <h2 className="text-4xl font-display font-bold text-white mb-2">Voter Leaderboard</h2>
                     <p className="text-pulsar-muted">Top contributors and active participants in the DAO governance.</p>
                </div>
                
                {userRank && (
                    <div className="px-6 py-3 bg-pulsar-primary/10 border border-pulsar-primary/30 rounded-xl flex items-center gap-4">
                        <div className="text-right">
                            <p className="text-xs text-pulsar-primary uppercase font-bold">Your Rank</p>
                            <p className="text-2xl font-mono text-white">#{userRank.rank}</p>
                        </div>
                        <div className="h-10 w-[1px] bg-pulsar-primary/20"></div>
                        <div className="text-right">
                             <p className="text-xs text-pulsar-primary uppercase font-bold">Score</p>
                             <p className="text-2xl font-mono text-white">{userRank.score}</p>
                        </div>
                    </div>
                )}
             </div>

             {loading ? (
                 <div className="text-center py-20">
                     <p className="text-pulsar-muted animate-pulse">Loading rankings...</p>
                 </div>
             ) : (
                 <div className="glass-card bg-card-nebula rounded-xl border border-white/5 overflow-hidden">
                     <table className="w-full text-left">
                         <thead className="bg-white/5">
                             <tr>
                                 <th className="p-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-center">Rank</th>
                                 <th className="p-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-center">User</th>
                                 <th className="p-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-center">Votes Cast</th>
                                 <th className="p-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-center">Score</th>
                                 <th className="p-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-center">Level</th>
                                 <th className="p-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-center">Action</th>
                             </tr>
                         </thead>
                         <tbody className="divide-y divide-white/5">
                             {leaders.map((stats, index) => (
                                 <tr key={stats.pubkey} className="hover:bg-white/5 transition-colors">
                                     <td className="p-4 text-center">
                                         <div className="flex items-center justify-center gap-3">
                                             {getBadge(index + 1)}
                                         </div>
                                     </td>
                                     <td className="p-4 text-center">
                                         <span className={`font-mono ${stats.user === (publicKey?.toString()) ? 'text-pulsar-primary font-bold' : 'text-gray-300'}`}>
                                            {stats.user.slice(0, 4)}...{stats.user.slice(-4)}
                                            {stats.user === (publicKey?.toString()) && " (You)"}
                                         </span>
                                     </td>
                                     <td className="p-4 text-center text-white font-mono">
                                         {stats.proposalCount}
                                     </td>
                                     <td className="p-4 text-center text-pulsar-secondary font-bold font-mono">
                                         {stats.score}
                                     </td>
                                     <td className="p-4 text-center">
                                         <span className="text-xs px-2 py-1 rounded bg-white/5 text-gray-400 border border-white/10 uppercase tracking-wide">
                                             {getLevel(stats.score)}
                                         </span>
                                     </td>
                                     <td className="p-4 text-center">
                                        {stats.user === (publicKey?.toString()) && stats.score >= 50 && !stats.badgeClaimed ? (
                                            <div className="flex justify-center">
                                                <button 
                                                    onClick={handleClaimBadge}
                                                    disabled={actionLoading}
                                                    className="px-3 py-1 bg-gradient-to-r from-[#9945FF] to-[#14F195] text-black font-bold text-xs rounded-full hover:shadow-[0_0_15px_rgba(153,69,255,0.5)] transition-all flex items-center gap-2"
                                                >
                                                    {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <Award size={14} />}
                                                    Claim Badge
                                                </button>
                                            </div>
                                        ) : (
                                            stats.badgeClaimed && (
                                                <div className="flex items-center justify-center gap-1 text-[#14F195] text-xs font-bold">
                                                    <Award size={14} /> Claimed
                                                </div>
                                            )
                                        )}
                                     </td>
                                 </tr>
                             ))}
                             
                             {leaders.length === 0 && (
                                 <tr>
                                     <td colSpan="5" className="p-8 text-center text-gray-500">
                                         No votes recorded yet. Be the first!
                                     </td>
                                 </tr>
                             )}
                         </tbody>
                     </table>
                 </div>
             )}
        </div>
    );
};

export default Leaderboard;
