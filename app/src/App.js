import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './components/Home';
import CreatePoll from './components/CreatePoll';
import Poll from './components/Poll';
import DashboardLayout from './components/DashboardLayout';
import './App.css';

function App() {
  return (
    <Router>
      <DashboardLayout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/create-poll" element={<CreatePoll />} />
          <Route path="/poll/:pollPDAAddress" element={<Poll />} />
        </Routes>
      </DashboardLayout>
    </Router>
  );
}

export default App;