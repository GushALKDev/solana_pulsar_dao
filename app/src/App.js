import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './components/Home';
import CreateProposal from './components/CreateProposal';
import TokenManager from './components/TokenManager';
import StakingPage from './components/StakingPage';
import DashboardLayout from './components/DashboardLayout';
import './App.css';
import Analytics from './components/Analytics';
import Proposal from './components/Proposal';
import DelegationPage from './components/DelegationPage';
import Leaderboard from './components/Leaderboard';

function App() {
  return (
    <Router>
      <DashboardLayout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/create-proposal" element={<CreateProposal />} />
          <Route path="/proposal/:id" element={<Proposal />} />
          <Route path="/staking" element={<StakingPage />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/delegation" element={<DelegationPage />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/dao-admin" element={<TokenManager />} />
        </Routes>
      </DashboardLayout>
    </Router>
  );
}

export default App;
