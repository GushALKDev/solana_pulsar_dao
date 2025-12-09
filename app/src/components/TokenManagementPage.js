import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import TokenManager from './TokenManager';

const TokenManagementPage = () => {
  const navigate = useNavigate();
  const { publicKey } = useWallet();

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0b0f] via-[#1a1c2e] to-[#0a0b0f]">
      {/* Header */}
      <div className="border-b border-white/10 bg-[#0f1117]/80 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/')}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-[#14F195] to-[#9945FF] bg-clip-text text-transparent">
                Token Management
              </h1>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-6 py-12">
        {!publicKey ? (
          <div className="bg-[#0f1117] rounded-2xl p-12 border border-white/10 text-center">
            <div className="mb-6">
              <svg className="w-20 h-20 mx-auto text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-white mb-4">
              Connect Your Wallet
            </h2>
            <p className="text-gray-400 mb-8">
              Please connect your wallet to manage tokens and participate in quadratic voting.
            </p>
          </div>
        ) : (
          <TokenManager />
        )}
      </div>
    </div>
  );
};

export default TokenManagementPage;
