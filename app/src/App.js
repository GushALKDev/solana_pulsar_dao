import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './components/Home';
import CreateProposal from './components/CreateProposal';
import Proposal from './components/Proposal';
import TokenManager from './components/TokenManager';
import DashboardLayout from './components/DashboardLayout';
import './App.css';

function App() {
  return (
    <Router>
      <DashboardLayout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/create-proposal" element={<CreateProposal />} />
          <Route path="/proposal/:proposalPDAAddress" element={<Proposal />} />
          <Route path="/tokens" element={<TokenManager />} />
        </Routes>
      </DashboardLayout>
    </Router>
  );
}

export default App;
