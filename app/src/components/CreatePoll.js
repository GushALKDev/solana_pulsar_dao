import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  AppBar,
  Toolbar,
  Typography,
  Container,
  TextField,
  Button,
  CircularProgress,
  Grid,
} from '@mui/material';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { SystemProgram } from '@solana/web3.js';
import { connection, program, globalAccountPDAAddress } from '../config';

import { BN } from 'bn.js';

const CreatePoll = () => {
  const { publicKey, sendTransaction } = useWallet(); // Access the user's wallet and transaction methods
  const [pollQuestion, setPollQuestion] = useState(''); // State to store the poll question
  const [duration, setDuration] = useState(10); // State to store the poll duration in minutes
  const [loading, setLoading] = useState(false); // State to indicate loading during transaction
  const [errorMessage, setErrorMessage] = useState(''); // State to store error messages
  const navigate = useNavigate(); // React Router hook for navigation

  /**
   * Function to create a new poll.
   * Sends a transaction to the Solana program to create a new poll.
   */
  const createNewPoll = async () => {
    if (!pollQuestion.trim()) {
      // Validation: Check if the poll question is valid
      setErrorMessage('Please enter a valid question.');
      return;
    }

    setErrorMessage('');
    setLoading(true); // Show loading spinner during transaction

    try {
      const votingProgram = program({ publicKey }); // Initialize the Solana program with the user's public key

      // Prepare and send the transaction
      const transaction = await votingProgram.methods
        .createPoll(pollQuestion, new BN(duration * 60)) // Pass the poll question and duration (in seconds)
        .accounts({
          globalAccount: globalAccountPDAAddress, // Specify the global account PDA
          user: publicKey, // Specify the user's public key
          systemProgram: SystemProgram.programId, // System program for transaction
        })
        .transaction();

      // Send the transaction using the wallet's sendTransaction method
      const transactionSignature = await sendTransaction(transaction, connection);

      // Wait for the transaction to be confirmed
      const latestBlockhash = await connection.getLatestBlockhash();
      await connection.confirmTransaction(
        {
          signature: transactionSignature,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        },
        'finalized' // Use high commitment level for confirmation
      );

      console.log('Transaction confirmed.');

      // Redirect to the Home page after successful poll creation
      navigate('/');
    } catch (error) {
      console.error('Failed to create new poll:', error); // Log the error for debugging
      setErrorMessage('Failed to create new poll.'); // Show an error message to the user
    } finally {
      setLoading(false); // Stop loading spinner regardless of success or failure
    }
  };

  return (
    <>
      {/* Header with title and wallet connection button */}
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Create New Poll
          </Typography>
          <WalletMultiButton /> {/* Solana wallet connection button */}
        </Toolbar>
      </AppBar>

      {/* Main content container */}
      <Container sx={{ marginTop: 4 }}>
        <Grid container spacing={2} justifyContent="center">
          <Grid item xs={12} sm={8} md={6}>
            {/* Input field for the poll question */}
            <TextField
              label="Poll Question"
              variant="outlined"
              fullWidth
              value={pollQuestion} // Bind to state
              onChange={(e) => setPollQuestion(e.target.value)} // Update state on change
              disabled={loading} // Disable input while loading
              error={!!errorMessage} // Show error style if there's an error
              helperText={errorMessage} // Display error message
              sx={{ marginBottom: 2 }}
            />

            {/* Input field for the poll duration */}
            <TextField
              label="Duration (in minutes)"
              variant="outlined"
              fullWidth
              type="number"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              disabled={loading}
              sx={{ marginBottom: 2 }}
            />

            {/* Button to create a new poll */}
            <Button
              variant="contained"
              color="primary"
              fullWidth
              onClick={createNewPoll}
              disabled={loading}
              sx={{ marginBottom: 2 }}
            >
              {loading ? <CircularProgress size={24} color="inherit" /> : 'Create Poll'}
            </Button>

            {/* Button to navigate back to the Home page */}
            <Button
              variant="outlined"
              color="secondary"
              fullWidth
              onClick={() => navigate('/')} // Navigate back to Home
              disabled={loading} // Disable button while loading
            >
              Back to Home
            </Button>
          </Grid>
        </Grid>
      </Container>
    </>
  );
};

export default CreatePoll;
