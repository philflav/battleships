import React, { useState, useEffect, useCallback, useRef } from 'react';
import io, { Socket } from 'socket.io-client';
import Board from '../components/Board';
import GameInfo from '../components/GameInfo';

const BOARD_SIZE = 10;

interface Ship {
  name: string;
  size: number;
  positions: number[][];
  hits: number;
  color?: string;
}

interface PlayerState {
  playerBoard: number[][];
  opponentBoard: number[][];
  ships: Ship[]; // Add ships array to PlayerState
  isMyTurn: boolean;
  mySunkShips: number;
  opponentSunkShips: number;
  status: 'waiting' | 'playing' | 'finished';
  winner: string | null;
  message: string;
  shipSunk?: boolean; // Add flag for sunk ship
  sunkShipName?: string | null; // Add sunk ship name
  opponentShips?: Ship[]; // Add opponent's ships for legend
}

// Extend Ship interface for opponent legend clarity
interface OpponentShip extends Ship {
    sunk: boolean;
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
     // Stop all sounds before potentially playing a new one
     hitSoundRef.current?.pause();
     if (hitSoundRef.current) hitSoundRef.current.currentTime = 0;
     missSoundRef.current?.pause();
     if (missSoundRef.current) missSoundRef.current.currentTime = 0;
     sinkingSoundRef.current?.pause();
     if (sinkingSoundRef.current) sinkingSoundRef.current.currentTime = 0;


     if (!prevOpponentBoardRef.current) {
       // Initialize the previous board state and sunk ship counts on the first game state update
       prevOpponentBoardRef.current = gameState.opponentBoard;
       prevMySunkShipsRef.current = gameState.mySunkShips;
       prevOpponentSunkShipsRef.current = gameState.opponentSunkShips;
       return;
     }

     // Check if a ship was sunk by this update
     if (gameState.shipSunk) {
        console.log(`[pages/index.tsx:${80}] Ship sunk detected by flag. Playing sinking sound.`);
        // Play sinking sound immediately or with a small delay
        // Play sinking sound with a small delay
        setTimeout(() => {
            if (sinkingSoundRef.current) {
                sinkingSoundRef.current.volume = 1; // Start at full volume
                sinkingSoundRef.current.play();

                // Start fade out after 3 seconds (5 seconds total - 2 seconds fade)
                const fadeStartTime = 3000;
                const fadeDuration = 2000;
                const fadeInterval = 50; // Decrease volume every 50ms
                const steps = fadeDuration / fadeInterval;
                const volumeStep = 1 / steps;

                setTimeout(() => {
                    const fadeIntervalId = setInterval(() => {
                        if (sinkingSoundRef.current) {
                            sinkingSoundRef.current.volume = Math.max(0, sinkingSoundRef.current.volume - volumeStep);
                            // Check if volume has reached 0
                            if (sinkingSoundRef.current.volume === 0) {
                                sinkingSoundRef.current.pause();
                                sinkingSoundRef.current.currentTime = 0;
                                clearInterval(fadeIntervalId);
                            }
                        } else {
                            clearInterval(fadeIntervalId); // Clear interval if ref is null
                        }
                    }, fadeInterval);
                }, fadeStartTime);

                // Ensure sound stops after 5 seconds even if fade out is not perfect
                setTimeout(() => {
                    if (sinkingSoundRef.current) {
                        sinkingSoundRef.current.pause();
                        sinkingSoundRef.current.currentTime = 0;
                    }
                }, 5000); // Total playback duration
            }
        }, 100); // Small initial delay

     } else {
        // If no ship was sunk by this update, check for regular hits or misses
        const prevBoard = prevOpponentBoardRef.current;
        const currentBoard = gameState.opponentBoard;

        // Check for changes in the opponent's board to play hit/miss sounds
        for (let r = 0; r < BOARD_SIZE; r++) {
          for (let c = 0; c < BOARD_SIZE; c++) {
            if (prevBoard[r][c] === 0 && currentBoard[r][c] === 2) {
              // Hit detected (and no ship sunk by this hit)
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
     }


     // Update the previous board state and sunk ship counts
     prevOpponentBoardRef.current = gameState.opponentBoard; // Use current gameState.opponentBoard
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
      ships: [], // Initialize with an empty ships array
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
        <>
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

          <div className="mt-8 p-6 bg-gray-800 rounded-lg shadow-lg w-full max-w-md text-center">
              <h2 className="text-2xl font-semibold mb-4 text-cyan-400">How to Play</h2>
              <p className="mb-3 text-gray-300">
                  1. Enter a Game ID above and click "Join / Create Game". Share this ID with your opponent.
              </p>
              <p className="mb-3 text-gray-300">
                  2. Wait for your opponent to join the same Game ID.
              </p>
              <p className="mb-3 text-gray-300">
                  3. Once the game starts, you will see your board and your opponent's board. Your ships are automatically placed at the start of the game.
              </p>
              <p className="mb-3 text-gray-300">
                  4. When it's your turn, click on a cell on the Opponent's Board to fire a shot.
              </p>
              <p className="mb-3 text-gray-300">
                  5. A hit will be marked in red, and a miss in white.
              </p>
              <p className="mb-3 text-gray-300">
                  6. Sink all of your opponent's ships to win the game!
              </p>
          </div>
        </>
       ) : (
        // Game Area and Legend
        <>
          <div className="w-full max-w-7xl mx-auto flex flex-col lg:flex-row justify-around items-start gap-8">
              {/* Player's Board */}
              <div className="flex flex-col items-center">
                   <h2 className="text-2xl font-semibold mb-3 text-blue-300">Your Board</h2>
                  <Board
                      grid={gameState.playerBoard}
                      onCellClick={() => {}} // No action needed when clicking own board
                      myBoard={true}
                      ships={gameState.ships} // Pass player's ships for coloring
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

         {/* Ship Legends Container */}
         <div className="mt-8 w-full max-w-4xl mx-auto flex flex-col md:flex-row justify-around gap-6">
            {/* Player's Ship Legend */}
            {gameState?.ships && gameState.ships.length > 0 && (
              <div className="p-4 bg-gray-800 rounded-lg shadow-lg flex-1">
                <h3 className="text-xl font-semibold mb-4 text-blue-300 text-center">Your Ships</h3>
                <div className="flex flex-wrap gap-x-4 gap-y-2 justify-center">
                  {gameState.ships.map((ship) => {
                    const isSunk = ship.hits >= ship.size;
                    const shipColor = isSunk ? '#884444' : (ship.color || 'gray'); // Dull red if sunk
                    return (
                      <div key={`player-${ship.name}`} className="flex items-center gap-2">
                        <div
                          className="w-5 h-5 rounded-sm border border-gray-600"
                          style={{ backgroundColor: shipColor }}
                        ></div>
                        <span className={isSunk ? 'line-through text-gray-500' : ''}>{ship.name}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Opponent's Ship Legend */}
            {gameState?.opponentShips && gameState.opponentShips.length > 0 && (
              <div className="p-4 bg-gray-800 rounded-lg shadow-lg flex-1">
                <h3 className="text-xl font-semibold mb-4 text-red-300 text-center">Opponent's Ships</h3>
                <div className="flex flex-wrap gap-x-4 gap-y-2 justify-center">
                  {(gameState.opponentShips as OpponentShip[]).map((ship) => ( // Cast for type safety
                    <div key={`opponent-${ship.name}`} className="flex items-center gap-2">
                      {/* We don't show opponent ship colors, just status */}
                      <div
                        className={`w-5 h-5 rounded-sm border ${ship.sunk ? 'bg-red-800 border-red-600' : 'bg-gray-600 border-gray-500'}`} // Indicate sunk status visually
                      ></div>
                      <span className={ship.sunk ? 'line-through text-gray-500' : ''}>{ship.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
         </div>
        </>
       )}
     </div>
   );
 };

export default HomePage;
