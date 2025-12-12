/* global BigInt, BigInt64Array */
import React, { useEffect, useState } from 'react';
import { useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { program, programId, proposalSeed, globalStateSeed } from '../config';

const Analytics = () => {
    const { connection } = useConnection();
    const [proposals, setProposals] = useState([]);
    const [stats, setStats] = useState({
        totalVotes: 0,
        activeProposalsCount: 0,
        endedProposalsCount: 0
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async (isInitial = false) => {
            if (isInitial) setLoading(true);
            try {
                // Fetch Global Account fo Proposal Count
                // We use a dummy public key for read-only access if needed, or just connection
                const votingProgram = program({ publicKey: null }); 
                const [globalAccountPDA] = PublicKey.findProgramAddressSync([Buffer.from(globalStateSeed)], programId);
                const globalAccount = await votingProgram.account.globalAccount.fetch(globalAccountPDA);
                const count = globalAccount.proposalCount.toNumber();

                const fetchedProposals = [];
                let totalVotesAll = 0;
                let activeCount = 0;
                let endedCount = 0;

                for (let i = 1; i <= count; i++) {
                     const [proposalPDA] = PublicKey.findProgramAddressSync(
                        [Buffer.from(proposalSeed), Buffer.from(new Uint8Array(new BigInt64Array([BigInt(i)]).buffer))], // Little-endian i64/u64 
                         programId
                     );
                     
                     // NOTE: The previous Little Endian conversion in Home.js was slightly custom. 
                     // Let's reuse a simple Buffer wrapper or the consistent helper.
                     // A safe way for seed (u64 le) is:
                     const bnBuffer = Buffer.alloc(8);
                     bnBuffer.writeBigUInt64LE(BigInt(i));
                     
                     const [pda] = PublicKey.findProgramAddressSync(
                         [Buffer.from(proposalSeed), bnBuffer],
                         programId
                     );

                     try {
                        const account = await votingProgram.account.proposalAccount.fetch(pda);
                        const yes = account.yes.toNumber();
                        const no = account.no.toNumber();
                        const total = yes + no;
                        totalVotesAll += total;

                        const isActive = Date.now() / 1000 < account.deadline.toNumber();
                        if(isActive) activeCount++; else endedCount++;

                        fetchedProposals.push({
                            name: `Prop #${i}`, // Short name for chart
                            fullName: account.title ? account.title.toString() : account.description.toString(),
                            yes,
                            no,
                            total,
                            isActive
                        });
                     } catch(e) { /* skip */ }
                }

                setProposals(fetchedProposals);
                setStats({
                    totalVotes: totalVotesAll,
                    activeProposalsCount: activeCount,
                    endedProposalsCount: endedCount
                });

            } catch (error) {
                console.error("Error fetching analytics:", error);
            } finally {
                if (isInitial) setLoading(false);
            }
        };

        fetchData(true);
        const interval = setInterval(() => fetchData(false), 15000);
        return () => clearInterval(interval);
    }, [connection]);

    // Data for Distribution Pie Chart (Total YES vs NO across all proposals)
    const distributionData = [
        { name: 'YES Votes', value: proposals.reduce((acc, p) => acc + p.yes, 0) },
        { name: 'NO Votes', value: proposals.reduce((acc, p) => acc + p.no, 0) },
    ];
    const COLORS = ['#14F195', '#F43F5E']; // Green, Red

    if (loading) {
        return <div className="p-8 text-white">Loading Analytics...</div>;
    }

    return (
        <div className="space-y-8 p-8 max-w-7xl mx-auto text-white">
            <h1 className="text-3xl font-display font-bold mb-6">DAO Analytics</h1>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-card-nebula p-6 rounded-xl border border-white/5">
                    <p className="text-pulsar-muted text-sm">Total Lifetime Votes</p>
                    <p className="text-3xl font-mono font-bold mt-2 text-pulsar-primary">{stats.totalVotes.toLocaleString()}</p>
                </div>
                <div className="bg-card-nebula p-6 rounded-xl border border-white/5">
                    <p className="text-pulsar-muted text-sm">Active Proposals</p>
                    <p className="text-3xl font-mono font-bold mt-2 text-white">{stats.activeProposalsCount}</p>
                </div>
                <div className="bg-card-nebula p-6 rounded-xl border border-white/5">
                    <p className="text-pulsar-muted text-sm">Ended Proposals</p>
                    <p className="text-3xl font-mono font-bold mt-2 text-gray-400">{stats.endedProposalsCount}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                 {/* Authorization / Participation Chart */}
                 <div className="bg-card-nebula p-6 rounded-xl border border-white/5 min-h-[400px]">
                    <h3 className="text-xl font-bold mb-4">Votes per Proposal</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={proposals.slice(-10)}>
                            <XAxis dataKey="name" stroke="#6b7280" />
                            <YAxis stroke="#6b7280" />
                            <Tooltip 
                                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }}
                                itemStyle={{ color: '#fff' }}
                            />
                            <Legend />
                            <Bar dataKey="yes" name="YES" stackId="a" fill="#14F195" />
                            <Bar dataKey="no" name="NO" stackId="a" fill="#F43F5E" />
                        </BarChart>
                    </ResponsiveContainer>
                 </div>

                 {/* Distribution Pie Chart */}
                 <div className="bg-card-nebula p-6 rounded-xl border border-white/5 min-h-[400px]">
                    <h3 className="text-xl font-bold mb-4">Global Sentiment (YES vs NO)</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie
                                data={distributionData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={100}
                                fill="#8884d8"
                                paddingAngle={5}
                                dataKey="value"
                            >
                                {distributionData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                 </div>
            </div>
            
            {/* Top Proposals Table */}
             <div className="bg-card-nebula rounded-xl border border-white/5 overflow-hidden">
                <div className="p-6 border-b border-white/5">
                    <h3 className="text-xl font-bold">Top Proposals by Engagement</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-center text-sm">
                        <thead className="bg-white/5 text-xs uppercase text-gray-400">
                            <tr>
                                <th className="px-6 py-4 text-left">Proposal</th>
                                <th className="px-6 py-4">Total Votes</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4">% YES</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-gray-300">
                            {[...proposals].sort((a,b) => b.total - a.total).slice(0, 5).map((p, idx) => (
                                <tr key={idx} className="hover:bg-white/5 transition-colors">
                                    <td className="px-6 py-4 font-medium max-w-xs truncate text-left">{p.fullName}</td>
                                    <td className="px-6 py-4 font-mono">{p.total}</td>
                                    <td className="px-6 py-4">
                                         <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${p.isActive ? "bg-green-500/20 text-green-400" : "bg-gray-700/50 text-gray-400"}`}>
                                            {p.isActive ? "ACTIVE" : "ENDED"}
                                         </span>
                                    </td>
                                    <td className="px-6 py-4 font-mono text-pulsar-primary">
                                        {p.total > 0 ? ((p.yes / p.total) * 100).toFixed(1) : 0}%
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default Analytics;
