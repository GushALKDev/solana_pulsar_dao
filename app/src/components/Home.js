import React, { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Link } from 'react-router-dom';
import { PublicKey } from '@solana/web3.js';
import {
  AppBar,
  Toolbar,
  Typography,
  Container,
  Card,
  CardContent,
  CardActions,
  Button,
  CircularProgress,
  Grid,
  Chip,
  Box,
} from '@mui/material';
import {
  program,
  programId,
  pollSeed,
  globalAccountPDAAddress,
  connection,
} from '../config';

/**
 * Component to display time remaining for a poll
 */
const TimeRemaining = ({ deadline }) => {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    if (!deadline || deadline === 0) {
      setTimeLeft('No deadline');
      return;
    }

    const updateTimer = () => {
      const now = Math.floor(Date.now() / 1000);
      const remaining = deadline - now;

      if (remaining <= 0) {
        setTimeLeft('Expired');
      } else {
        const days = Math.floor(remaining / 86400);
        const hours = Math.floor((remaining % 86400) / 3600);
        const minutes = Math.floor((remaining % 3600) / 60);
        
        if (days > 0) {
          setTimeLeft(`${days}d ${hours}h`);
        } else if (hours > 0) {
          setTimeLeft(`${hours}h ${minutes}m`);
        } else {
          setTimeLeft(`${minutes}m`);
        }
      }
    };

    updateTimer();
    const timerInterval = setInterval(updateTimer, 1000);

    return () => clearInterval(timerInterval);
  }, [deadline]);

  return (
    <Typography 
      variant="body2" 
      sx={{ 
        color: timeLeft === 'Expired' ? 'error.main' : 'text.secondary',
        fontWeight: timeLeft === 'Expired' ? 'bold' : 'normal'
      }}
    >
      {timeLeft === 'Expired' ? '🔴 Expired' : `⏱️ ${timeLeft}`}
    </Typography>
  );
};

const Home = () => {
  const [polls, setPolls] = useState([]); // Holds the list of polls
  const [loading, setLoading] = useState(false); // Indicates loading state
  const [pollsCounter, setPollsCounter] = useState(0); // Stores the current number of polls
  const [admin, setAdmin] = useState(null); // Stores the admin public key
  const [voteUpdatesEnabled, setVoteUpdatesEnabled] = useState(false); // Stores the global vote update setting
  const [togglingVoteUpdates, setTogglingVoteUpdates] = useState(false); // Loading state for toggle
  const { connected, publicKey, sendTransaction } = useWallet(); // Wallet connection state

  /**
   * Fetch the global polls_counter and admin settings from the program.
   */
  const fetchGlobalAccount = async () => {
    try {
      const votingProgram = program({ publicKey: null });
      const globalAccountPDA = await votingProgram.account.globalAccount.fetch(globalAccountPDAAddress);
      
      const fetchedCounter = Number(globalAccountPDA.pollsCounter.toString());
      // Update pollsCounter only if it has changed
      if (fetchedCounter !== pollsCounter) {
        setPollsCounter(fetchedCounter);
      }

      setAdmin(globalAccountPDA.admin.toString());
      setVoteUpdatesEnabled(globalAccountPDA.voteUpdatesEnabled);

    } catch (error) {
      console.error('Error fetching global account:', error);
    }
  };

  /**
   * Toggles the vote updates setting. Only available to the admin.
   */
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
        
        // Refresh global account data
        await fetchGlobalAccount();
    } catch (error) {
        console.error("Error toggling vote updates:", error);
    } finally {
        setTogglingVoteUpdates(false);
    }
  };

  /**
   * Fetches the details of all polls up to the current pollsCounter.
   * Compares the current polls state with the fetched data and updates
   * the state only if there are changes.
   */
  const fetchPolls = async () => {
    if (pollsCounter === 0) return; // Skip if no polls exist

    try {
      const votingProgram = program({ publicKey: null });
      const foundPolls = [];

      // Fetch poll data for each poll
      for (let counter = 1; counter <= pollsCounter; counter++) {
        const [pollPDAAddress] = await PublicKey.findProgramAddress(
          [Buffer.from(pollSeed), Buffer.from(toLittleEndian8Bytes(counter))],
          programId
        );

        try {
          const pollAccount = await votingProgram.account.pollAccount.fetch(pollPDAAddress);
          if (pollAccount) {
            const pollData = {
              number: counter,
              question: pollAccount.question.toString(),
              totalVotes: Number(pollAccount.yes.toString()) + Number(pollAccount.no.toString()),
              deadline: Number(pollAccount.deadline.toString()),
              pda: pollPDAAddress.toBase58(),
            };
            foundPolls.push(pollData);
          }
        } catch (pollFetchError) {
          console.warn(`Failed to fetch poll at counter ${counter}`, pollFetchError);
        }
      }

      // Update polls state only if there are changes
      if (JSON.stringify(foundPolls) !== JSON.stringify(polls)) {
        setPolls(foundPolls);
      }
    } catch (error) {
      console.error('Error fetching polls:', error);
    }
  };

  /**
   * Converts a number to a Little Endian byte array (8 bytes).
   */
  function toLittleEndian8Bytes(num) {
    const buffer = Buffer.alloc(8);
    buffer.writeUInt32LE(num, 0);
    return buffer;
  }

  /**
   * Initial data fetch and periodic updates every 30 seconds.
   * Calls fetchGlobalAccount and fetchPolls only if changes are detected.
   */
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      await fetchGlobalAccount();
      await fetchPolls();
      setLoading(false);
    };

    fetchData();

    const interval = setInterval(async () => {
      await fetchGlobalAccount(); // Fetch counter and settings
      await fetchPolls(); // Fetch updated polls if counter changes
    }, 30000);

    return () => clearInterval(interval); // Cleanup interval on unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollsCounter]);

  return (
    <>
      {/* AppBar: Header with title and wallet connection */}
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Voting App
          </Typography>
          <WalletMultiButton />
        </Toolbar>
      </AppBar>

      {/* Main Content */}
      <Container sx={{ marginTop: 4 }}>
        
        {/* Admin Controls */}
        {connected && publicKey && admin && publicKey.toString() === admin && (
            <Box sx={{ mb: 4, p: 2, border: '1px solid #ccc', borderRadius: 2 }}>
                <Typography variant="h6" gutterBottom>Admin Controls</Typography>
                <Grid container alignItems="center" spacing={2}>
                    <Grid item>
                        <Typography variant="body1">
                            Vote Updates: 
                            {togglingVoteUpdates ? (
                                <CircularProgress size={20} sx={{ ml: 1 }} />
                            ) : (
                                <Chip 
                                    label={voteUpdatesEnabled ? "Enabled" : "Disabled"} 
                                    color={voteUpdatesEnabled ? "success" : "error"} 
                                    sx={{ ml: 1 }}
                                />
                            )}
                        </Typography>
                    </Grid>
                    <Grid item>
                        <Button 
                            variant="contained" 
                            onClick={toggleVoteUpdates}
                            disabled={togglingVoteUpdates}
                        >
                            {voteUpdatesEnabled ? "Disable Updates" : "Enable Updates"}
                        </Button>
                    </Grid>
                </Grid>
            </Box>
        )}

        {/* Button to create a new poll (visible if connected) */}
        {connected && (
          <Link to="/create-poll" style={{ textDecoration: 'none' }}>
            <Button
              variant="contained"
              color="primary"
              sx={{ marginBottom: 4 }}
            >
              Create New Poll
            </Button>
          </Link>
        )}

        {/* Loading Indicator */}
        {loading ? (
          <Grid container justifyContent="center" alignItems="center" style={{ height: '50vh' }}>
            <CircularProgress />
          </Grid>
        ) : polls.length === 0 ? (
          <Typography variant="h6" align="center">
            No polls available.
          </Typography>
        ) : (
          <Grid container spacing={2}>
            {polls.map((poll, index) => (
              <Grid item xs={12} sm={6} md={4} key={index}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" component="div">
                      Poll #{poll.number}
                    </Typography>
                    <Typography color="text.secondary">
                      {poll.question}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Total Votes: {poll.totalVotes}
                    </Typography>
                    <TimeRemaining deadline={poll.deadline} />
                  </CardContent>
                  <CardActions>
                    <Link to={`/poll/${poll.pda}`} style={{ textDecoration: 'none' }}>
                      <Button size="small" variant="outlined" color="primary">
                        View Poll
                      </Button>
                    </Link>
                  </CardActions>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </Container>
    </>
  );
};

export default Home;
