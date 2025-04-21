import React, { useState, useEffect, useCallback, useRef } from 'react';
import io, { Socket } from 'socket.io-client';
import Board from '../components/Board';
import GameInfo from '../components/GameInfo';

const BOARD_SIZE = 10;

interface PlayerState {
  playerBoard: number[][];
  opponentBoard: number[][];
  isMyTurn: boolean;
  mySunkShips: number;
  opponentSunkShips: number;
  status: 'waiting' | 'playing' | 'finished';
  winner: string | null;
  message: string;
}

const HomePage: React.FC = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [gameId, setGameId] = useState<string>('');
  const [inputGameId, setInputGameId] = useState<string>('');
  const [playerIndex, setPlayerIndex] = useState<number | null>(null);
  const [gameState, setGameState] = useState<PlayerState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);

  const hitSoundRef = useRef<HTMLAudioElement | null>(null);
  const missSoundRef = useRef<HTMLAudioElement | null>(null);
  const sinkingSoundRef = useRef<HTMLAudioElement | null>(null);
  const prevOpponentBoardRef = useRef<number[][] | null>(null);
  const prevMySunkShipsRef = useRef<number>(0);
  const prevOpponentSunkShipsRef = useRef<number>(0);

  // Establish Socket connection
  useEffect(() => {
    // Connect to the Socket.IO server running alongside Next.js
    const newSocket = io(); 

    newSocket.on('connect', () => {
        console.log('Socket connected:', newSocket.id);
        setIsConnected(true);
        setSocket(newSocket);
    });

    newSocket.on('disconnect', () => {
        console.log('Socket disconnected');
        setIsConnected(false);
        setSocket(null);
        setGameState(null); // Reset game state on disconnect
        setGameId('');
        setPlayerIndex(null);
        setError('Disconnected from server.');
    });

    newSocket.on('error', (data: { message: string }) => {
        console.error('Server Error:', data.message);
        setError(`Error: ${data.message}`);
        // Consider more specific error handling, e.g., if game full, reset UI
        if (data.message === 'Game is full.' || data.message.includes('Failed to initialize')) {
             setGameId(''); // Reset game ID if join failed
             setGameState(null);
        }
    });

    // Game specific listeners
    newSocket.on('waiting', (data: { message: string }) => {
        console.log('Waiting for opponent...');
        setGameState(prevState => ({
            ...(prevState ?? createInitialPlayerState()), // Use previous state or initial if null
            status: 'waiting',
            message: data.message,
        }));
        setError(null);
    });

    newSocket.on('gameStart', (data: { playerIndex: number; initialState: PlayerState }) => {
        console.log('Game starting!', data);
        setPlayerIndex(data.playerIndex);
        setGameState(data.initialState);
        setError(null);
    });

    newSocket.on('update', (data: PlayerState) => {
        console.log('Game state update:', data);
        setGameState(data);
        setError(null);
         // Clear error on successful update
    });

    // Cleanup on component unmount
    return () => {
      if(newSocket) {
        console.log('Disconnecting socket...')
        newSocket.disconnect();
      }
    };
  }, []); // Runs only once on component mount

 // Load sounds and handle game state updates for sound playback
 useEffect(() => {
   hitSoundRef.current = new Audio('/assets/sounds/hit.mp3');
   missSoundRef.current = new Audio('/assets/sounds/miss.mp3');
   sinkingSoundRef.current = new Audio('/assets/sounds/sinking.mp3');

   if (gameState) {
     if (!prevOpponentBoardRef.current) {
       // Initialize the previous board state and sunk ship counts on the first game state update
       prevOpponentBoardRef.current = gameState.opponentBoard;
       prevMySunkShipsRef.current = gameState.mySunkShips;
       prevOpponentSunkShipsRef.current = gameState.opponentSunkShips;
       return;
     }

     const prevBoard = prevOpponentBoardRef.current;
     const currentBoard = gameState.opponentBoard;

     // Check for changes in the opponent's board to play hit/miss sounds
     for (let r = 0; r < BOARD_SIZE; r++) {
       for (let c = 0; c < BOARD_SIZE; c++) {
         if (prevBoard[r][c] === 0 && currentBoard[r][c] === 2) {
           // Hit detected
           console.log(`[pages/index.tsx:${80}] Hit detected at (${r}, ${c}). Playing hit sound.`);
           hitSoundRef.current?.play();
           setTimeout(() => {
             hitSoundRef.current?.pause();
             if (hitSoundRef.current) hitSoundRef.current.currentTime = 0;
           }, 2000); // Stop after 2 seconds
         } else if (prevBoard[r][c] === 0 && currentBoard[r][c] === 3) {
           // Miss detected
           console.log(`[pages/index.tsx:${80}] Miss detected at (${r}, ${c}). Playing miss sound.`);
           missSoundRef.current?.play();
           setTimeout(() => {
             missSoundRef.current?.pause();
             if (missSoundRef.current) missSoundRef.current.currentTime = 0;
           }, 2000); // Stop after 2 seconds
         }
       }
     }

     // Check for sunk ships and play sinking sound with delay
     if (gameState.mySunkShips > prevMySunkShipsRef.current || gameState.opponentSunkShips > prevOpponentSunkShipsRef.current) {
        console.log(`[pages/index.tsx:${80}] Ship sunk detected. Playing sinking sound with delay.`);
        setTimeout(() => {
            sinkingSoundRef.current?.play();
            setTimeout(() => {
                sinkingSoundRef.current?.pause();
                if (sinkingSoundRef.current) sinkingSoundRef.current.currentTime = 0;
            }, 5000); // Stop sinking sound after 5 seconds
        }, 2100); // Start sinking sound after 2.1 seconds (after hit/miss sound)
     }


     // Update the previous board state and sunk ship counts
     prevOpponentBoardRef.current = currentBoard;
     prevMySunkShipsRef.current = gameState.mySunkShips;
     prevOpponentSunkShipsRef.current = gameState.opponentSunkShips;
   }
 }, [gameState]); // Run this effect whenever gameState changes

 const handleJoinGame = () => {
    if (socket && inputGameId) {
      console.log(`Attempting to join game: ${inputGameId}`);
      setGameId(inputGameId);
      setError(null); // Clear previous errors
      setGameState(null); // Reset state before joining
      socket.emit('joinGame', inputGameId);
    } else {
      setError('Please enter a Game ID.');
    }
  };

 const handleFire = useCallback((row: number, col: number) => {
    if (socket && gameState && gameState.status === 'playing' && gameState.isMyTurn) {
        // Check if the cell has already been fired upon on the *opponent's* board view
        if (gameState.opponentBoard[row][col] === 0) { // 0 means it hasn't been revealed yet
             console.log(`Firing at (${row}, ${col}) in game ${gameId}`);
            socket.emit('fire', { gameId, row, col });
             setError(null); // Clear error on successful fire attempt
        } else {
            console.log(`Already fired at (${row}, ${col})`);
            setError('You have already fired at this location.');
        }
    } else if (!gameState?.isMyTurn && gameState?.status === 'playing') {
        setError('Not your turn.');
    }
}, [socket, gameId, gameState]);

 const handleNewGame = () => {
    if (socket && gameId && gameState?.status === 'finished') {
        console.log(`Requesting new game for game ID: ${gameId}`);
        setError(null);
        // Resetting local state immediately for better UX might be needed,
        // but let's rely on the server's 'gameStart' or 'waiting' event for now.
        socket.emit('newGame', { gameId });
    } else {
        setError('Cannot start a new game now.');
    }
};

  // Helper to create a default initial state
  const createInitialPlayerState = (): PlayerState => ({
      playerBoard: Array(BOARD_SIZE).fill(0).map(() => Array(BOARD_SIZE).fill(0)),
      opponentBoard: Array(BOARD_SIZE).fill(0).map(() => Array(BOARD_SIZE).fill(0)),
      isMyTurn: false,
      mySunkShips: 0,
      opponentSunkShips: 0,
      status: 'waiting', // Or perhaps a 'connecting' or 'lobby' state initially
      winner: null,
      message: 'Enter a Game ID to join or start.',
  });

  return (
    <div className="flex flex-col items-center min-h-screen bg-gray-900 text-white p-4">
      <h1 className="text-4xl font-bold mb-6 text-cyan-400">Battleships</h1>

      {!isConnected && <p className="text-yellow-400">Connecting to server...</p>}
      {error && <p className="text-red-500 mb-4">{error}</p>}

      {!gameId || !gameState ? (
        <div className="flex flex-col items-center gap-4 bg-gray-800 p-6 rounded-lg shadow-lg">
          <input
            type="text"
            value={inputGameId}
            onChange={(e) => setInputGameId(e.target.value.trim())}
            placeholder="Enter Game ID"
            className="px-4 py-2 rounded border border-gray-600 bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
          <button
            onClick={handleJoinGame}
            disabled={!inputGameId || !isConnected}
            className="px-6 py-2 bg-cyan-600 hover:bg-cyan-700 rounded text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition duration-200"
          >
            Join / Create Game
          </button>
           <p className="text-sm text-gray-400 mt-2">Enter any ID. If it exists, you'll join. If not, a new game is created.</p>
        </div>
      ) : (
        // Game Area
        <div className="w-full max-w-7xl mx-auto flex flex-col lg:flex-row justify-around items-start gap-8">
            {/* Player's Board */}      
            <div className="flex flex-col items-center">
                 <h2 className="text-2xl font-semibold mb-3 text-blue-300">Your Board</h2>
                <Board 
                    grid={gameState.playerBoard} 
                    onCellClick={() => {}} // No action needed when clicking own board
                    myBoard={true} 
                />
             </div>

            {/* Game Info / Controls */}      
             <GameInfo 
                gameState={gameState} 
                onNewGame={handleNewGame} 
                gameId={gameId}
             />

            {/* Opponent's Board */}      
            <div className="flex flex-col items-center">
                 <h2 className="text-2xl font-semibold mb-3 text-red-300">Opponent's Board</h2>
                <Board 
                    grid={gameState.opponentBoard} 
                    onCellClick={handleFire} 
                    myBoard={false} 
                    disabled={!gameState.isMyTurn || gameState.status !== 'playing'}
                />
             </div>
        </div>
      )}
    </div>
  );
};

export default HomePage;
