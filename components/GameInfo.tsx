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
}

interface GameInfoProps {
  gameState: PlayerState;
  onNewGame: () => void;
  gameId: string;
}

const GameInfo: React.FC<GameInfoProps> = ({ gameState, onNewGame, gameId }) => {
  const { status, message, isMyTurn, mySunkShips, opponentSunkShips } = gameState;

  return (
    <div className="flex flex-col items-center justify-center bg-gray-800 p-6 rounded-lg shadow-lg text-center w-full lg:w-auto lg:min-w-[300px]">
      <h2 className="text-xl font-semibold mb-4 text-yellow-300">Game Info</h2>
      <p className="mb-2 text-gray-400">Game ID: <span className="font-mono text-cyan-400">{gameId}</span></p>

      <div className="mb-4">
         <p className={`text-lg font-semibold ${isMyTurn && status === 'playing' ? 'text-green-400 animate-pulse' : 'text-gray-300'}`}>
            Status: {message}
         </p>
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
