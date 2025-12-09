import React from 'react';
import Sidebar from './Sidebar';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Bell } from 'lucide-react';

import { useLocation } from 'react-router-dom';

const DashboardLayout = ({ children }) => {
  const location = useLocation();

  const getPageTitle = (pathname) => {
    switch (pathname) {
      case '/': return 'Dashboard';
      case '/voting': return 'Voting';
      case '/community': return 'Community';
      case '/proposals': return 'Proposals';
      case '/privacy': return 'Privacy';
      case '/settings': return 'Settings';
      default: 
        if (pathname.startsWith('/proposal/')) return 'Proposal Details';
        return 'Dashboard';
    }
  };

  return (
    <div className="min-h-screen bg-nebula text-white font-sans flex">
      <Sidebar />
      
      {/* Main Content Area */}
      <div className="flex-1 ml-64">
        {/* Header */}
        <header className="h-20 px-8 flex items-center justify-between bg-transparent sticky top-0 z-40">
            <h2 className="text-xl font-display font-medium tracking-wide text-white">
              {getPageTitle(location.pathname)}
            </h2>
            
            <div className="flex items-center gap-6">
                <button className="relative p-2 text-pulsar-muted hover:text-white transition-colors">
                    <Bell size={20} />
                    <span className="absolute top-1 right-1 w-2 h-2 bg-pulsar-danger rounded-full"></span>
                </button>
                
                <WalletMultiButton className="!bg-gradient-to-r !from-blue-600 !to-purple-600 !border-none !rounded-xl !font-display !font-bold !text-sm !h-10 !px-6 !text-white !transition-all !duration-300 hover:!shadow-[0_0_20px_rgba(147,51,234,0.5)] hover:!scale-105 active:!scale-95" />
            </div>
        </header>

        {/* Page Content */}
        <main className="p-8">
            {children}
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
