import React from 'react';

interface PlayerState {
  playerBoard: number[][];
  opponentBoard: number[][];
  isMyTurn: boolean;
  mySunkShips: number;
  opponentSunkShips: number;
  status: 'waiting' | 'playing' | 'finished';
  winner: string | null;
  message: string;
  shipSunk?: boolean; // Add flag for sunk ship
  sunkShipName?: string | null; // Add sunk ship name
}

interface GameInfoProps {
  gameState: PlayerState;
  onNewGame: () => void;
  gameId: string;
}

const GameInfo: React.FC<GameInfoProps> = ({ gameState, onNewGame, gameId }) => {
  const { status, message, isMyTurn, mySunkShips, opponentSunkShips, shipSunk, sunkShipName } = gameState;

  // Determine the message to display based on ship sunk status
  const displayMessage = shipSunk
    ? `You sunk their ${sunkShipName || 'ship'}!`
    : message;

  // Determine the color for the sunk ship message
  const sunkMessageColor = shipSunk ? 'text-orange-400 font-bold' : '';

  return (
    <div className="flex flex-col items-center justify-center bg-gray-800 p-6 rounded-lg shadow-lg text-center w-full lg:w-auto lg:min-w-[300px]">
      <h2 className="text-xl font-semibold mb-4 text-yellow-300">Game Info</h2>
      <p className="mb-2 text-gray-400">Game ID: <span className="font-mono text-cyan-400">{gameId}</span></p>

      <div className="mb-4 min-h-[50px]"> {/* Added min-height to prevent layout shifts */}
         {/* Display sunk ship message if applicable */}
         {shipSunk && (
           <p className={`text-lg font-semibold mb-1 ${sunkMessageColor}`}>
             {displayMessage}
           </p>
         )}
         {/* Display regular status message */}
         {/* Only show turn status etc. if a ship wasn't *just* sunk */}
         {!shipSunk && (
            <p className={`text-lg font-semibold ${isMyTurn && status === 'playing' ? 'text-green-400 animate-pulse' : 'text-gray-300'}`}>
               Status: {message}
            </p>
         )}
         {/* Show waiting/finished message regardless of sunk status */}
         {(status === 'waiting' || status === 'finished') && !shipSunk && (
             <p className="text-lg font-semibold text-gray-300">
                Status: {message}
             </p>
         )}
      </div>

      {status !== 'waiting' && (
         <div className="flex justify-around w-full mb-4 text-sm">
             <p className="text-blue-300">Your Sunk Ships: {opponentSunkShips} / 5</p>
            <p className="text-red-300">Opponent Sunk Ships: {mySunkShips} / 5</p>
        </div>
       )}

      {status === 'finished' && (
        <button
          onClick={onNewGame}
          className="mt-4 px-6 py-2 bg-green-600 hover:bg-green-700 rounded text-white font-semibold transition duration-200"
        >
          New Game
        </button>
      )}
    </div>
  );
};

export default GameInfo;
