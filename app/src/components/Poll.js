import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { PublicKey } from '@solana/web3.js';
import {
  AppBar,
  Toolbar,
  Typography,
  Container,
  CircularProgress,
  Button,
  Card,
  CardContent,
  CardActions,
  Grid,
  Alert,
} from '@mui/material';
import { connection, program, programId, voterSeed, globalAccountPDAAddress } from '../config';
import { SystemProgram } from '@solana/web3.js';

const Poll = () => {
  const { publicKey, sendTransaction } = useWallet(); // Access wallet's public key and transaction method
  const [loading, setLoading] = useState(false); // Indicates data fetching state
  const [confirming, setConfirming] = useState(false); // Indicates transaction confirmation state
  const [pollNumber, setPollNumber] = useState(0); // Stores poll number
  const [pollAuthor, setPollAuthor] = useState(''); // Stores poll author
  const [pollQuestion, setPollQuestion] = useState(''); // Stores poll question
  const [pollYes, setPollYes] = useState(0); // Stores "Yes" votes count
  const [pollNo, setPollNo] = useState(0); // Stores "No" votes count
  const [pollDeadline, setPollDeadline] = useState(0); // Stores poll deadline timestamp
  const [timeLeft, setTimeLeft] = useState(''); // Stores formatted time left
  const [voterAccount, setVoterAccount] = useState(null); // Tracks user's voter account data
  const [voteUpdatesEnabled, setVoteUpdatesEnabled] = useState(false); // Tracks if vote updates are enabled
  const { pollPDAAddress } = useParams(); // Gets the poll PDA from URL parameters

  /**
   * Fetches poll information from the Solana program and updates the state.
   */
  const fetchPollInfo = async () => {
    try {
      const votingProgram = program({ publicKey: null }); // Initialize program without wallet interaction
      const pollPDA = await votingProgram.account.pollAccount.fetch(pollPDAAddress);

      // Update state with poll data
      setPollNumber(Number(pollPDA.number.toString()));
      setPollAuthor(pollPDA.author.toString());
      setPollQuestion(pollPDA.question.toString());
      setPollYes(Number(pollPDA.yes.toString()));
      setPollNo(Number(pollPDA.no.toString()));
      setPollDeadline(Number(pollPDA.deadline.toString()));
    } catch (error) {
      console.error('Error in fetchPollInfo:', error);
    }
  };

  /**
   * Fetches the global account to check if vote updates are enabled.
   */
  const fetchGlobalAccount = async () => {
    try {
      const votingProgram = program({ publicKey: null });
      const globalAccount = await votingProgram.account.globalAccount.fetch(globalAccountPDAAddress);
      setVoteUpdatesEnabled(globalAccount.voteUpdatesEnabled);
    } catch (error) {
      console.error('Error in fetchGlobalAccount:', error);
    }
  };

  /**
   * Fetches the voter's account to check voting status and vote preference.
   */
  const fetchVoterAccount = async () => {
    try {
      const pollPDAPublicKey = new PublicKey(pollPDAAddress); // Convert pollPDAAddress to PublicKey
      const votingProgram = program({ publicKey: null }); // Initialize program
      const [voterAccountPDAAddress] = await PublicKey.findProgramAddress(
        [Buffer.from(voterSeed), pollPDAPublicKey.toBuffer(), publicKey.toBuffer()],
        programId
      );

      // Fetch voter account data
      const voterAccountPDA = await votingProgram.account.voterAccount.fetch(voterAccountPDAAddress);
      setVoterAccount(voterAccountPDA);
    } catch (e) {
      setVoterAccount(null); // Reset voterAccount state if fetch fails
    }
  };

  /**
   * Handles the voting process for "Yes" or "No".
   * Sends a transaction to the Solana program and refreshes poll and voter data upon confirmation.
   */
  const vote = async (option) => {
    try {
      setConfirming(true); // Start spinner during confirmation
      const votingProgram = program({ publicKey }); // Initialize program with user's wallet
      let transaction;

      if (voterAccount && voterAccount.voted) {
        // User is updating their vote
        const pollPDAPublicKey = new PublicKey(pollPDAAddress);
        const [voterAccountPDAAddress] = await PublicKey.findProgramAddress(
            [Buffer.from(voterSeed), pollPDAPublicKey.toBuffer(), publicKey.toBuffer()],
            programId
        );

        transaction = await votingProgram.methods
            .updateVote(option)
            .accounts({
                globalAccount: globalAccountPDAAddress,
                pollAccount: pollPDAAddress,
                voterAccount: voterAccountPDAAddress,
                user: publicKey,
            })
            .transaction();
      } else {
        // User is voting for the first time
        transaction = await votingProgram.methods
            .vote(option) // Specify vote option (true for "Yes", false for "No")
            .accounts({
            pollAccount: pollPDAAddress, // Poll account
            user: publicKey, // User's public key
            systemProgram: SystemProgram.programId, // System program
            })
            .transaction();
      }

      const transactionSignature = await sendTransaction(transaction, connection);

      // Wait for transaction to be confirmed
      const latestBlockhash = await connection.getLatestBlockhash();
      await connection.confirmTransaction(
        {
          signature: transactionSignature,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        },
        'finalized' // High commitment level
      );

      console.log('Transaction confirmed, refreshing data...');
      // Refresh poll and voter data after transaction confirmation
      await fetchPollInfo();
      await fetchVoterAccount();
    } catch (error) {
      console.error('Error during voting:', error);
    } finally {
      setConfirming(false); // Stop spinner
    }
  };

  /**
   * Handles withdrawing a vote from a poll.
   * Closes the voter account and returns rent to the user.
   */
  const withdrawVote = async () => {
    try {
      setConfirming(true);
      const votingProgram = program({ publicKey });
      const pollPDAPublicKey = new PublicKey(pollPDAAddress);
      const [voterAccountPDAAddress] = await PublicKey.findProgramAddress(
        [Buffer.from(voterSeed), pollPDAPublicKey.toBuffer(), publicKey.toBuffer()],
        programId
      );

      const transaction = await votingProgram.methods
        .withdrawVote()
        .accounts({
          globalAccount: globalAccountPDAAddress,
          pollAccount: pollPDAAddress,
          voterAccount: voterAccountPDAAddress,
          user: publicKey,
        })
        .transaction();

      const transactionSignature = await sendTransaction(transaction, connection);

      const latestBlockhash = await connection.getLatestBlockhash();
      await connection.confirmTransaction(
        {
          signature: transactionSignature,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        },
        'finalized'
      );

      console.log('Vote withdrawn, refreshing data...');
      await fetchPollInfo();
      await fetchVoterAccount();
    } catch (error) {
      console.error('Error withdrawing vote:', error);
    } finally {
      setConfirming(false);
    }
  };

  /**
   * Initial fetch of poll and voter data when the component mounts.
   */
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true); // Start loading spinner
      await fetchPollInfo(); // Fetch poll data
      await fetchGlobalAccount(); // Fetch global account data
      if (publicKey) {
        await fetchVoterAccount(); // Fetch voter data if wallet is connected
      }
      setLoading(false); // Stop loading spinner
    };

    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicKey, pollPDAAddress]);

  /**
   * Periodic fetch of poll and voter data every 30 seconds.
   */
  useEffect(() => {
    const interval = setInterval(() => {
      fetchPollInfo(); // Update poll data
      fetchGlobalAccount();
      if (publicKey) {
        fetchVoterAccount(); // Update voter data if wallet is connected
      }
    }, 30000);

    return () => clearInterval(interval); // Cleanup interval on component unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicKey, pollPDAAddress]);

  /**
   * Countdown timer logic.
   */
  useEffect(() => {
    if (!pollDeadline) return;

    const updateTimer = () => {
      const now = Math.floor(Date.now() / 1000);
      const remaining = pollDeadline - now;

      if (remaining <= 0) {
        setTimeLeft('Expired');
      } else {
        const hours = Math.floor(remaining / 3600);
        const minutes = Math.floor((remaining % 3600) / 60);
        const seconds = remaining % 60;
        setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
      }
    };

    updateTimer(); // Initial call
    const timerInterval = setInterval(updateTimer, 1000);

    return () => clearInterval(timerInterval);
  }, [pollDeadline]);

  return (
    <>
      {/* Header with poll number and wallet connection button */}
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Poll #{pollNumber}
          </Typography>
          <WalletMultiButton />
        </Toolbar>
      </AppBar>
      <Container sx={{ marginTop: 4 }}>
        {loading ? (
          // Show spinner while loading data
          <Grid container justifyContent="center" alignItems="center" style={{ height: '50vh' }}>
            <CircularProgress />
          </Grid>
        ) : (
          // Show poll details
          <Card>
            <CardContent>
              <Typography variant="h5">{pollQuestion}</Typography>
              <Typography color="text.secondary" sx={{ marginTop: 2 }}>
                Author: {pollAuthor}
              </Typography>
              <Typography variant="body2" sx={{ marginTop: 2 }}>
                Yes: {pollYes} votes
              </Typography>
              <Typography variant="body2" sx={{ marginTop: 1 }}>
                No: {pollNo} votes
              </Typography>
              <Typography variant="h6" sx={{ marginTop: 2, color: timeLeft === 'Expired' ? 'red' : 'primary.main' }}>
                {timeLeft === 'Expired' ? 'Poll Expired' : `Time Remaining: ${timeLeft}`}
              </Typography>
            </CardContent>
            <CardActions>
              {confirming ? (
                <CircularProgress size={24} /> // Spinner during transaction confirmation
              ) : publicKey && voterAccount?.voted ? (
                <Grid container alignItems="center">
                    <Typography sx={{ marginLeft: 2, color: 'green', marginRight: 2 }}>
                    ✅ You have voted for {voterAccount.vote ? 'Yes' : 'No'}
                    </Typography>
                    {voteUpdatesEnabled && timeLeft !== 'Expired' && (
                        <>
                            <Button
                                variant="outlined"
                                color="success"
                                size="small"
                                onClick={() => vote(true)}
                                disabled={voterAccount.vote === true} // Disable if already voted Yes
                                sx={{ marginRight: 1 }}
                            >
                                Change to Yes
                            </Button>
                            <Button
                                variant="outlined"
                                color="error"
                                size="small"
                                onClick={() => vote(false)}
                                disabled={voterAccount.vote === false} // Disable if already voted No
                                sx={{ marginRight: 1 }}
                            >
                                Change to No
                            </Button>
                            <Button
                                variant="contained"
                                color="warning"
                                size="small"
                                onClick={withdrawVote}
                            >
                                Withdraw Vote
                            </Button>
                        </>
                    )}
                </Grid>
              ) : (
                // Show voting buttons if not yet voted
                <>
                  <Button
                    variant="contained"
                    color="success"
                    onClick={() => vote(true)}
                    disabled={!publicKey || confirming || timeLeft === 'Expired'}
                  >
                    Vote Yes
                  </Button>
                  <Button
                    variant="contained"
                    color="error"
                    onClick={() => vote(false)}
                    disabled={!publicKey || confirming || timeLeft === 'Expired'}
                  >
                    Vote No
                  </Button>
                </>
              )}
            </CardActions>
          </Card>
        )}
        {/* Back to Home button */}
        <Link to="/" style={{ textDecoration: 'none', marginTop: '20px', display: 'block' }}>
          <Button variant="outlined" color="primary">
            Back to Home
          </Button>
        </Link>
      </Container>
    </>
  );
};

export default Poll;
