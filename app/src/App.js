import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './components/Home';
import CreateProposal from './components/CreateProposal';
import TokenManager from './components/TokenManager';
import StakingPage from './components/StakingPage';
import DashboardLayout from './components/DashboardLayout';
import './App.css';
import Proposal from './components/Proposal';

function App() {
  return (
    <Router>
      <DashboardLayout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/create-proposal" element={<CreateProposal />} />
          <Route path="/proposal/:id" element={<Proposal />} />
          <Route path="/staking" element={<StakingPage />} />
          <Route path="/dao-admin" element={<TokenManager />} />
        </Routes>
      </DashboardLayout>
    </Router>
  );
}

export default App;
