import React, { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Link } from 'react-router-dom';
import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount } from '@solana/spl-token';
import {
  CircularProgress,
  Typography,
} from '@mui/material';
import {
  program,
  programId,
  proposalSeed,
  globalAccountPDAAddress,
  connection,
} from '../config';
import Star from './Star';

const Home = () => {
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [proposalsCounter, setProposalsCounter] = useState(0);
  const [admin, setAdmin] = useState(null);
  const [voteUpdatesEnabled, setVoteUpdatesEnabled] = useState(false);
  const [togglingVoteUpdates, setTogglingVoteUpdates] = useState(false);
  const [votingPower, setVotingPower] = useState(0);
  const [tokenMint, setTokenMint] = useState(null);
  const { connected, publicKey, sendTransaction } = useWallet();

  const fetchGlobalAccount = async () => {
    try {
      const votingProgram = program({ publicKey: null });
      const globalAccountPDA = await votingProgram.account.globalAccount.fetch(globalAccountPDAAddress);
      
      const fetchedCounter = Number(globalAccountPDA.proposalsCounter.toString());
      if (fetchedCounter !== proposalsCounter) {
        setProposalsCounter(fetchedCounter);
      }

      setAdmin(globalAccountPDA.admin.toString());
      setVoteUpdatesEnabled(globalAccountPDA.voteUpdatesEnabled);
      if (globalAccountPDA.tokenMint) {
        setTokenMint(globalAccountPDA.tokenMint.toString());
      }

    } catch (error) {
      console.error('Error fetching global account:', error);
    }
  };

  useEffect(() => {
    const fetchVotingPower = async () => {
      if (!publicKey || !tokenMint) {
        setVotingPower(0);
        return;
      }

      try {
        const mintPubkey = new PublicKey(tokenMint);
        const ata = await getAssociatedTokenAddress(mintPubkey, publicKey);
        const accountInfo = await getAccount(connection, ata);
        const balance = Number(accountInfo.amount);
        setVotingPower(Math.floor(Math.sqrt(balance)));
      } catch (e) {
        console.log("Error fetching token balance or no account found", e);
        setVotingPower(0);
      }
    };

    fetchVotingPower();
  }, [publicKey, tokenMint]);

  const toggleVoteUpdates = async () => {
    if (!publicKey) return;

    setTogglingVoteUpdates(true);
    try {
        const votingProgram = program({ publicKey });
        const transaction = await votingProgram.methods
            .toggleVoteUpdates()
            .accounts({
                globalAccount: globalAccountPDAAddress,
                user: publicKey,
            })
            .transaction();
        
        const signature = await sendTransaction(transaction, connection);
        await connection.confirmTransaction(signature, 'finalized');
        
        await fetchGlobalAccount();
    } catch (error) {
        console.error("Error toggling vote updates:", error);
    } finally {
        setTogglingVoteUpdates(false);
    }
  };

  const fetchProposals = async () => {
    if (proposalsCounter === 0) return;

    try {
      const votingProgram = program({ publicKey: null });
      const foundProposals = [];

      for (let counter = 1; counter <= proposalsCounter; counter++) {
        const [proposalPDAAddress] = await PublicKey.findProgramAddress(
          [Buffer.from(proposalSeed), Buffer.from(toLittleEndian8Bytes(counter))],
          programId
        );

        try {
          const proposalAccount = await votingProgram.account.proposalAccount.fetch(proposalPDAAddress);
          if (proposalAccount) {
            const proposalData = {
              number: counter,
              question: proposalAccount.question.toString(),
              totalVotes: Number(proposalAccount.yes.toString()) + Number(proposalAccount.no.toString()),
              deadline: Number(proposalAccount.deadline.toString()),
              pda: proposalPDAAddress.toBase58(),
            };
            foundProposals.push(proposalData);
          }
        } catch (proposalFetchError) {
          console.warn(`Failed to fetch proposal at counter ${counter}`, proposalFetchError);
        }
      }

      if (JSON.stringify(foundProposals) !== JSON.stringify(proposals)) {
        setProposals(foundProposals);
      }
    } catch (error) {
      console.error('Error fetching proposals:', error);
    }
  };

  function toLittleEndian8Bytes(num) {
    const buffer = Buffer.alloc(8);
    buffer.writeUInt32LE(num, 0);
    return buffer;
  }

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      await fetchGlobalAccount();
      await fetchProposals();
      setLoading(false);
    };

    fetchData();

    const interval = setInterval(async () => {
      await fetchGlobalAccount();
      await fetchProposals();
    }, 30000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposalsCounter]);

  return (
    <div className="space-y-8">
      {/* Top Row: Voting Power & Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        <div className="glass-card bg-card-nebula rounded-2xl p-8 relative overflow-hidden flex flex-col items-center justify-center min-h-[400px] border border-white/5">
            <Star className="w-96 h-96">
                <div className="flex flex-col items-center justify-center pt-6">
                    <p className="text-gray-300 font-sans text-2xl mb-2 mt-4 tracking-wide font-medium uppercase">Voting Power</p>
                    <h3 className="text-3xl font-sans font-bold text-white mb-2 tracking-tight drop-shadow-lg">
                        {votingPower.toLocaleString()}
                    </h3>
                    <p className="text-pulsar-primary font-sans font-bold tracking-widest text-2xl">VOTES</p>
                </div>
            </Star>
        </div>

        {/* Chart Card */}
        <div className="glass-card bg-card-nebula rounded-2xl p-8 relative overflow-hidden min-h-[400px] flex flex-col border border-white/5">
            <div className="flex justify-between items-start mb-8">
                <div>
                    <h3 className="text-lg font-display text-white tracking-wide">Volume per Custom</h3>
                    <p className="text-pulsar-muted text-xs">Last 7 days</p>
                </div>
                <div className="flex gap-2">
                    <span className="px-3 py-1 rounded bg-white/5 text-xs text-white border border-white/10">Voting</span>
                </div>
            </div>

            {/* Custom SVG Chart */}
            <div className="flex-1 flex items-end justify-between gap-2 px-4 pb-4 relative">
                {/* Grid Lines */}
                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-10">
                    <div className="border-t border-white w-full"></div>
                    <div className="border-t border-white w-full"></div>
                    <div className="border-t border-white w-full"></div>
                    <div className="border-t border-white w-full"></div>
                </div>

                {/* Line Path (Simulated) */}
                <svg className="absolute inset-0 w-full h-full overflow-visible" preserveAspectRatio="none">
                    <defs>
                        <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#00f3ff" stopOpacity="0.5" />
                            <stop offset="100%" stopColor="#00f3ff" stopOpacity="0" />
                        </linearGradient>
                    </defs>
                    <path 
                        d="M0,300 C50,250 100,100 150,150 S250,200 300,100 S400,50 500,80" 
                        fill="url(#chartGradient)" 
                        stroke="#00f3ff" 
                        strokeWidth="3"
                        className="drop-shadow-[0_0_10px_rgba(0,243,255,0.5)]"
                    />
                    <path 
                        d="M0,320 C50,280 100,150 150,200 S250,250 300,150 S400,100 500,120" 
                        fill="none" 
                        stroke="#bc13fe" 
                        strokeWidth="3"
                        className="opacity-50"
                    />
                </svg>

                {/* X Axis Labels */}
                <div className="absolute bottom-[-25px] left-0 w-full flex justify-between text-xs text-pulsar-muted font-mono">
                    <span>Jan 1</span>
                    <span>Jan 2</span>
                    <span>Jan 3</span>
                    <span>Jan 4</span>
                    <span>Jan 5</span>
                </div>
            </div>
        </div>
      </div>

      {/* Active Proposals Section */}
      <div>
        <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-display text-white tracking-wide flex items-center gap-3">
                <span className="whitespace-nowrap">Active Proposals</span>
                <span className="h-[1px] flex-1 bg-gradient-to-r from-white/10 to-transparent"></span>
            </h3>
            <Link to="/create-proposal">
                <button className="px-4 py-2 bg-gradient-to-r from-[#9945FF] to-[#14F195] text-white rounded-lg font-bold text-sm hover:shadow-[0_0_20px_rgba(153,69,255,0.5)] transition-all duration-300">
                    + Create Proposal
                </button>
            </Link>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-32">
            <CircularProgress sx={{ color: '#00f3ff' }} />
          </div>
        ) : proposals.length === 0 ? (
           <div className="text-center py-12 glass-panel rounded-xl border border-dashed border-white/10">
            <Typography variant="h6" className="font-display text-pulsar-muted">
              No active proposals found.
            </Typography>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {proposals.map((proposal, index) => (
              <div key={index} className="glass-card bg-card-nebula rounded-xl p-6 border border-white/5 hover:border-pulsar-primary/50 transition-all duration-300 group relative">
                <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-pulsar-primary to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                
                <div className="mb-4">
                    <span className="text-xs font-mono text-pulsar-muted">Proposal #{proposal.number.toString().padStart(3, '0')}</span>
                </div>

                <h4 className="text-lg font-display font-bold text-white mb-3 line-clamp-2 h-14">
                    {proposal.question}
                </h4>

                <p className="text-sm text-pulsar-muted mb-6 line-clamp-2">
                    Vote on this proposal to determine the future of the protocol parameters.
                </p>

                <div className="flex items-center justify-between mt-auto">
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-[10px] flex items-center justify-center font-bold">
                            P
                        </div>
                        <span className="text-xs text-pulsar-muted">Pulsar Core</span>
                    </div>
                    
                    <Link to={`/proposal/${proposal.pda}`} style={{ textDecoration: 'none' }}>
                        <button className="px-4 py-2 bg-pulsar-primary/10 text-pulsar-primary border border-pulsar-primary/50 rounded hover:bg-pulsar-primary hover:text-black transition-all duration-300 text-xs font-bold uppercase tracking-wider shadow-[0_0_10px_rgba(0,243,255,0.2)] hover:shadow-[0_0_15px_rgba(0,243,255,0.5)]">
                            Vote Now
                        </button>
                    </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Admin Controls */}
      {connected && publicKey && admin && publicKey.toString() === admin && (
        <div className="mt-12 p-6 glass-panel rounded-xl border border-white/5 opacity-50 hover:opacity-100 transition-opacity">
            <div className="flex justify-between items-center">
                <Typography variant="subtitle2" className="font-mono text-pulsar-muted">ADMIN_PROTOCOL_V1</Typography>
                <div className="flex items-center gap-4">
                    <span className={`text-xs font-bold ${voteUpdatesEnabled ? "text-green-400" : "text-red-400"}`}>
                        {voteUpdatesEnabled ? "SYSTEM ONLINE" : "SYSTEM OFFLINE"}
                    </span>
                    <button 
                        onClick={toggleVoteUpdates}
                        disabled={togglingVoteUpdates}
                        className="px-3 py-1 border border-white/20 text-xs text-white hover:bg-white/10 rounded"
                    >
                        TOGGLE
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default Home;
