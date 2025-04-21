import React from 'react';

const BOARD_SIZE = 10;



interface BoardProps {
  grid: number[][]; // 0: empty, 1: ship, 2: hit, 3: miss
  onCellClick: (row: number, col: number) => void;
  myBoard: boolean; // Is this the player's own board?
  disabled?: boolean; // Disable clicks (e.g., not player's turn)
}

const Board: React.FC<BoardProps> = ({ grid, onCellClick, myBoard, disabled = false }) => {
  
 
  const getCellClass = (cellValue: number, row: number, col: number): string => {
    let baseClass = 'w-8 h-8 sm:w-10 sm:h-10 border border-gray-600 flex items-center justify-center font-bold text-lg aspect-square min-w-[20px]';
    let stateClass = 'bg-blue-800'; // Default water
    let cursorClass = 'cursor-pointer hover:bg-blue-700';

    if (myBoard) {
        // Player's own board styling
        cursorClass = 'cursor-default'; // No clicking on own board
      switch (cellValue) {
        case 1: // Ship part (not hit)
          stateClass = 'bg-gray-500'; 
          break;
        case 2: // Ship part (hit)
          stateClass = 'bg-red-600 text-white';
          break;
        case 3: // Miss (opponent fired here)
          stateClass = 'opacity-50'; // A subtle miss marker
          break;
        default: { // Water (not fired upon)
          stateClass = 'bg-blue-800';
          break;
        }
      }
    } else {
        // Opponent's board styling (player's view)
        if (disabled) {
           cursorClass = 'cursor-not-allowed';
        }
        switch (cellValue) {
            case 2: // Hit (player hit opponent ship)
            stateClass = 'bg-red-600 text-white';
            cursorClass = 'cursor-not-allowed opacity-70'; // Cannot click again
            break;
            case 3: // Miss (player missed)
            stateClass = 'text-white opacity-50';
            cursorClass = 'cursor-not-allowed opacity-70'; // Cannot click again
            break;
            default: // Water (not fired upon yet)
                 stateClass = 'bg-blue-800'; 
          
                 break;
          }
         }
    
     // Add disabled styling
    if (disabled && !myBoard && cellValue === 0) {
         stateClass += ' opacity-60';
    }

    return `${baseClass} ${stateClass} ${cursorClass}`;
  };

   const renderCellContent = (cellValue: number, myBoard: boolean): React.ReactNode => {
        if (myBoard) {
            switch (cellValue) {
                case 1: return null; // Show ship color only
                case 2: return 'X'; // Hit on own ship
                case 3: return 'O'; // Miss on own water (small dot)
                default: return null; // Empty water
            }
        } else {
             switch (cellValue) {
                case 2: return 'X'; // Player's hit on opponent
                case 3: return 'O'; // Player's miss on opponent
                default: return null; // Unknown water
            }
        }
    };
  
    return (
      <div className={`grid grid-cols-${BOARD_SIZE} gap-0.5 bg-gray-700 p-1 rounded shadow-md w-full`}>
        {grid.map((row, rowIndex) =>
          row.map((cell, colIndex) => (
            <div
              key={`${rowIndex}-${colIndex}`}
              className={getCellClass(cell, rowIndex, colIndex)}
              onClick={() => {
                // Only allow clicking on the opponent's board if it's not disabled and the cell hasn't been revealed
                if (!myBoard && !disabled && cell === 0) { 
                  onCellClick(rowIndex, colIndex);
                }
              }}
            >
              {renderCellContent(cell, myBoard)}
            </div>
          ))
        )}
      </div>
    );
    
};

export default Board;
