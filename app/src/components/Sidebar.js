import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { 
  LayoutDashboard, 
  Vote, 
  Lock, 
  Users, 
  FileText, 
  Shield, 
  Settings,
  Bell,
  Coins,
  Trophy
} from 'lucide-react';
import { PublicKey } from '@solana/web3.js';
import { program, globalAccountPDAAddress, programId } from '../config';

import solanaLogo from '../assets/solana_logo.png';

console.log("Current Program ID:", programId.toString());

const Sidebar = () => {
  const location = useLocation();
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [isOnline, setIsOnline] = useState(false);
  const [latency, setLatency] = useState(null);
  const [admin, setAdmin] = useState(null);
  const [networkName, setNetworkName] = useState('Disconnected');

  useEffect(() => {
    const fetchGlobalAccount = async () => {
      try {
        const votingProgram = program({ publicKey: null });
        const globalAccount = await votingProgram.account.globalAccount.fetch(globalAccountPDAAddress);
        setAdmin(globalAccount.admin.toString());
      } catch (error) {
        console.log("Global account not initialized or error fetching", error);
      }
    };

    fetchGlobalAccount();
  }, []);

  useEffect(() => {
      const checkConnection = async () => {
          try {
              const start = Date.now();
              await connection.getVersion();
              const genesisHash = await connection.getGenesisHash();
              console.log("Current Genesis Hash:", genesisHash);
              
              const DEVNET_GENESIS = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkr96';
              const DEVNET_GENESIS_ALT = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG'; // Alternative/Current Devnet Hash
              const MAINNET_GENESIS = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
              const TESTNET_GENESIS = '4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY';

              if (genesisHash === DEVNET_GENESIS || genesisHash === DEVNET_GENESIS_ALT) {
                  setNetworkName('Solana Devnet');
              } else if (genesisHash === MAINNET_GENESIS) {
                  setNetworkName('Solana Mainnet');
              } else if (genesisHash === TESTNET_GENESIS) {
                  setNetworkName('Solana Testnet');
              } else {
                  setNetworkName('Unknown Network');
              }

              const end = Date.now();
              setIsOnline(true);
              setLatency(end - start);
          } catch (e) {
              setIsOnline(false);
              setLatency(null);
              setNetworkName('Disconnected');
          }
      };

      checkConnection();
      const interval = setInterval(checkConnection, 10000); // Check every 10s
      return () => clearInterval(interval);
  }, [connection]);
  
  const [upgradeAuthority, setUpgradeAuthority] = useState(null);

  // Fetch program upgrade authority (Deployer)
  useEffect(() => {
     const getUpgradeAuthority = async () => {
         try {
             // Fetch the program account info
             const programAccountInfo = await connection.getAccountInfo(programId);
             
             // Check if it's an Upgradeable Loader account
             // The offset for ProgramData address is 4
             const programDataAddress = new PublicKey(programAccountInfo.data.slice(4, 36));
             
             // Fetch ProgramData account
             const programDataAccountInfo = await connection.getAccountInfo(programDataAddress);
             
             // Offset for Upgrade Authority closest to Option<Pubkey> usually at 13 (8 bytes slot + 1 byte option tag)
             // If option tag is 1, then 32 bytes key follows.
             // Slot (u64) = 0..8
             // Option tag (u8) = 8..9
             // Pubkey = 9..41
             
             // Offset for Upgrade Authority:
             // 0-3: Enum variant (3)
             // 4-11: Slot (u64)
             // 12: Option tag (1 = Some)
             // 13-45: Upgrade Authority Pubkey
             
             const upgradeAuthorityAddress = new PublicKey(programDataAccountInfo.data.slice(13, 45));
             setUpgradeAuthority(upgradeAuthorityAddress.toString());
             console.log("Dynamically fetched Upgrade Authority:", upgradeAuthorityAddress.toString());

         } catch (e) {
             console.log("Could not fetch upgrade authority", e);
         }
     };
     
     if (connection && programId) {
         getUpgradeAuthority();
     }
  }, [connection]);

  
  const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
    { icon: Lock, label: 'Staking', path: '/staking', badge: 'BOOST' },
    { icon: Shield, label: 'Delegation', path: '/delegation' },
    { icon: Trophy, label: 'Leaderboard', path: '/leaderboard' },
    { icon: FileText, label: 'Analytics', path: '/analytics' },
  ];

  // Add Admin item conditionally
  if (publicKey && (publicKey.toString() === upgradeAuthority || (admin && publicKey.toString() === admin))) {
      menuItems.unshift({ icon: Coins, label: 'DAO Admin', path: '/dao-admin', badge: 'ADMIN' });
  }

  return (
    <div className="w-64 h-screen bg-gradient-to-b from-[#0f172a]/80 to-[#020617]/80 backdrop-blur-xl border-r border-white/10 flex flex-col fixed left-0 top-0 z-50 overflow-hidden">
      {/* Logo Area */}
      <div className="p-6 flex items-center gap-3 mb-8">
        <div className="relative w-12 h-12 flex items-center justify-center">
            {/* Outer Glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-blue-500/30 blur-xl rounded-full"></div>
            {/* Inner Core Glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 bg-purple-500/40 blur-lg rounded-full"></div>
            
            <svg viewBox="0 0 24 24" fill="none" className="w-10 h-10 relative z-10 overflow-visible">
                <defs>
                    <linearGradient id="pulsarGradient" x1="12" y1="0" x2="12" y2="24" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stopColor="#60A5FA" />
                        <stop offset="100%" stopColor="#D946EF" />
                    </linearGradient>
                </defs>
                <path 
                    d="M12 0 C 12 8 16 12 24 12 C 16 12 12 16 12 24 C 12 16 8 12 0 12 C 8 12 12 8 12 0 Z" 
                    fill="url(#pulsarGradient)" 
                    style={{ filter: 'drop-shadow(0 0 6px rgba(192, 132, 252, 0.5))' }}
                />
            </svg>
        </div>
        <span className="font-display font-bold text-xl text-white tracking-wide">Pulsar DAO</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 space-y-2">
        {menuItems.map((item, index) => {
          const Icon = item.icon;
          const isActive = item.active || location.pathname === item.path;
          
          return (
            <Link 
              key={index} 
              to={item.path}
              className={`flex items-center justify-between px-4 py-3 rounded-lg transition-all duration-300 group ${
                isActive 
                  ? 'bg-gradient-to-r from-pulsar-primary/10 to-transparent border-l-2 border-pulsar-primary text-white' 
                  : 'text-pulsar-muted hover:text-white hover:bg-white/5'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon size={20} className={isActive ? 'text-pulsar-primary' : 'group-hover:text-white'} />
                <span className={`text-sm font-medium ${isActive ? 'font-display' : ''}`}>{item.label}</span>
              </div>
              {item.badge && (
                <span className="bg-pulsar-secondary text-[10px] font-bold px-2 py-0.5 rounded text-white">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Network Status */}
      <div className="p-4 mt-auto relative z-10">
        <div className="bg-[#0f1123]/80 backdrop-blur-md border border-white/5 rounded-xl p-4 flex items-center gap-4 relative overflow-hidden group shadow-lg transition-all duration-300 hover:border-white/10">
            {/* Status Dot */}
            <div className={`absolute right-3 top-3 w-2 h-2 rounded-full shadow-[0_0_8px_currentColor] transition-colors duration-500 ${isOnline ? 'bg-[#14F195] text-[#14F195]' : 'bg-red-500 text-red-500'}`}></div>
            
            <div className="w-14 h-14 rounded-lg bg-[#1a1c2e] flex items-center justify-center border border-white/5 shrink-0 p-2">
                {/* Solana Logo PNG */}
                <img src={solanaLogo} alt="Solana Logo" className="w-full h-full object-contain" />
            </div>
            <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Network</span>
                <span className={`text-sm font-bold tracking-wide transition-colors duration-300 ${isOnline ? 'text-white' : 'text-red-400'}`}>
                    {networkName}
                </span>
                {isOnline && latency && (
                    <span className="text-[9px] text-[#14F195] font-mono mt-0.5">{latency}ms</span>
                )}
            </div>
        </div>
      </div>
      
      {/* Circuit Pattern Background at Bottom */}
      <div className="absolute bottom-0 left-0 w-full h-[500px] bg-circuit pointer-events-none opacity-100 mask-image-linear-gradient-to-t"></div>
    </div>
  );
};

export default Sidebar;
