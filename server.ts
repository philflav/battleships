import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server as SocketIOServer } from 'socket.io';

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = 3000;
// when using middleware `hostname` and `port` must be provided below
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

interface Ship {
  name: string;
  size: number;
  positions: number[][];
  hits: number;
  color?: string; // Add color property to Ship interface
}

interface Player {
  id: string;
  board: number[][]; // 0: empty, 1: ship, 2: hit, 3: miss
  ships: Ship[];
  shots: Set<string>; // "row,col"
  sunkShips: number; // How many of this player's ships have been sunk
}

interface Game {
  players: { [key: string]: Player };
  playerOrder: string[];
  currentPlayerIndex: number;
  status: 'waiting' | 'playing' | 'finished';
  winner: string | null;
}

const games: { [key: string]: Game } = {};
const shipsConfig = [
  { name: 'Carrier', size: 5, color: 'purple' },
  { name: 'Battleship', size: 4, color: 'orange' },
  { name: 'Cruiser', size: 3, color: 'green' },
  { name: 'Submarine', size: 3, color: 'yellow' },
  { name: 'Destroyer', size: 2, color: 'cyan' },
];
const BOARD_SIZE = 10;

function createInitialBoard(): number[][] {
  return Array(BOARD_SIZE).fill(0).map(() => Array(BOARD_SIZE).fill(0));
}

function placeShipsRandomly(board: number[][], ships: Ship[]): boolean {
  for (const ship of ships) {
    let placed = false;
    let attempts = 0;
    while (!placed && attempts < 100) {
      const orientation = Math.random() < 0.5 ? 'horizontal' : 'vertical';
      const startRow = Math.floor(Math.random() * BOARD_SIZE);
      const startCol = Math.floor(Math.random() * BOARD_SIZE);

      let canPlace = true;
      const positions: number[][] = [];

      if (orientation === 'horizontal') {
        if (startCol + ship.size > BOARD_SIZE) {
          canPlace = false;
        } else {
          for (let i = 0; i < ship.size; i++) {
            // Check for overlap with existing ships (value 1)
            if (board[startRow][startCol + i] !== 0) {
              canPlace = false;
              break;
            }
            positions.push([startRow, startCol + i]);
          }
        }
      } else { // vertical
        if (startRow + ship.size > BOARD_SIZE) {
          canPlace = false;
        } else {
          for (let i = 0; i < ship.size; i++) {
             // Check for overlap with existing ships (value 1)
            if (board[startRow + i][startCol] !== 0) {
              canPlace = false;
              break;
            }
            positions.push([startRow + i, startCol]);
          }
        }
      }

      if (canPlace) {
        ship.positions = positions;
        positions.forEach(([r, c]) => {
          board[r][c] = 1; // Mark as ship
        });
        placed = true;
      }
      attempts++;
    }
    if (!placed) {
        console.error(`Could not place ship ${ship.name} after ${attempts} attempts.`);
        return false; // Could not place a ship after many attempts
    }
  }
  return true;
}

function getOpponentId(game: Game, playerId: string): string | undefined {
    return game.playerOrder.find(id => id !== playerId);
}

function getPlayerState(game: Game, playerId: string) {
    const player = game.players[playerId];
    const opponentId = getOpponentId(game, playerId);
    const opponent = opponentId ? game.players[opponentId] : undefined;

    // Create a masked opponent board (showing player's shots)
    const opponentBoardMasked = createInitialBoard();
    player.shots.forEach(shot => {
        const [r, c] = shot.split(',').map(Number);
        if (opponent) {
            // Determine if it was a hit (2) or miss (3) based on opponent's actual board state
            // Check opponent's board at [r][c]: 1 (ship) or 2 (already hit ship) means it's a hit for the player
             opponentBoardMasked[r][c] = (opponent.board[r][c] === 1 || opponent.board[r][c] === 2) ? 2 : 3;
        } else {
             opponentBoardMasked[r][c] = 3; // Mark as miss if opponent somehow doesn't exist
        }
    });

     // Create the player's view of their own board (showing own ships and opponent's shots)
    const playerBoardView = createInitialBoard();
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const cell = player.board[r][c];
             playerBoardView[r][c] = cell; // Copy base state (0: empty, 1: ship, 2: hit, 3: miss)
        }
    }

    return {
        // Player's board showing own ships and opponent's shots
        playerBoard: playerBoardView, // Player's board showing own ships and opponent's shots
        // Opponent's board showing player's shots (hits/misses)
        opponentBoard: opponentBoardMasked, 
        // How many of the opponent's ships are sunk
        mySunkShips: opponent?.sunkShips ?? 0, // How many of the opponent's ships are sunk
        // How many of player's own ships are sunk
        opponentSunkShips: player.sunkShips,
        // Player's ships (including positions and colors)
        ships: player.ships,
        isMyTurn: game.status === 'playing' && game.playerOrder[game.currentPlayerIndex] === playerId,
        status: game.status,
        winner: game.winner,
        message: game.status === 'waiting' ? 'Waiting for opponent...' :
                 game.status === 'finished' ? `Game Over! ${game.winner === playerId ? 'You win!' : 'You lose!'}` :
                 (game.playerOrder[game.currentPlayerIndex] === playerId ? 'Your turn' : "Opponent's turn") // Use double quotes
    };
}

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const io = new SocketIOServer(httpServer);

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on('joinGame', (gameId: string) => {
      socket.join(gameId);
      console.log(`Socket ${socket.id} joined game ${gameId}`);

      let game = games[gameId];
      if (!game) {
        // First player creates the game
        game = {
          players: {},
          playerOrder: [],
          currentPlayerIndex: -1, // Game hasn't started
          status: 'waiting',
          winner: null,
        };
        games[gameId] = game;
      } else if (game.playerOrder.length >= 2 && !game.players[socket.id]) {
         socket.emit('error', { message: 'Game is full.' });
         socket.leave(gameId);
         console.log(`Socket ${socket.id} tried to join full game ${gameId}`);
         return;
      }

      // Add player if not already in
      if (!game.players[socket.id]) {
         if (game.playerOrder.length >= 2) {
            // This case should ideally be caught above, but as a safeguard
            socket.emit('error', { message: 'Game is full.' });
            socket.leave(gameId);
             console.log(`Socket ${socket.id} blocked from joining full game ${gameId} (safeguard)`);
            return;
        }
        game.players[socket.id] = {
          id: socket.id,
          board: createInitialBoard(),
          ships: shipsConfig.map(s => ({ ...s, positions: [], hits: 0 })),
          shots: new Set<string>(),
          sunkShips: 0,
        };
        game.playerOrder.push(socket.id);
         console.log(`Player ${socket.id} added to game ${gameId}. Players: ${game.playerOrder.join(', ')}`);
      }

      // Check if game can start
      if (game.playerOrder.length === 2 && game.status === 'waiting') {
        console.log(`Starting game ${gameId}`);
        game.status = 'playing';
        game.currentPlayerIndex = Math.floor(Math.random() * 2); // Random first turn

        // Place ships for both players
        let placementSuccess = true;
        for (const playerId of game.playerOrder) {
          const player = game.players[playerId];
          // Reset board and ships before placing
          player.board = createInitialBoard(); 
          player.ships = shipsConfig.map(s => ({ ...s, positions: [], hits: 0 }));
          player.shots = new Set<string>();
          player.sunkShips = 0;
          
          const success = placeShipsRandomly(player.board, player.ships);
           if (!success) {
              console.error(`Failed to place ships for player ${playerId} in game ${gameId}`);
              placementSuccess = false;
               io.to(gameId).emit('error', { message: 'Failed to initialize game board. Please try creating a new game.' });
               // Clean up faulty game state
               game.playerOrder.forEach(pid => {
                  const playerSocket = io.sockets.sockets.get(pid);
                   if (playerSocket) {
                       playerSocket.leave(gameId);
                   }
               });
               delete games[gameId]; 
               break;
          }
        }

        if(placementSuccess) {
            // Emit gameStart to both players with their respective initial states
            game.playerOrder.forEach((playerId, index) => {
                const initialState = getPlayerState(game!, playerId);
                io.to(playerId).emit('gameStart', { 
                    playerIndex: index, 
                    initialState: initialState
                });
                 // Log initial board state correctly
                 const boardString = initialState.playerBoard.map(r => r.join('')).join('');
                 console.log(`Sent gameStart to ${playerId}. Board:${boardString}`); // Corrected console log
            });
             console.log(`Game ${gameId} started. First turn: ${game.playerOrder[game.currentPlayerIndex]}`);
        }
      } else if (game.playerOrder.length === 1) {
         console.log(`Game ${gameId} waiting for second player.`);
         // Emit waiting state only to the first player
         io.to(socket.id).emit('waiting', { message: 'Waiting for opponent...' });
      } else if (game.playerOrder.includes(socket.id) && game.status === 'playing') {
          // A player reconnected or refreshed during an ongoing game
          const playerState = getPlayerState(game, socket.id);
          io.to(socket.id).emit('update', playerState);
          console.log(`Player ${socket.id} reconnected/refreshed in game ${gameId}`);
      }
       else if (game.playerOrder.includes(socket.id) && game.status === 'finished') {
             // Player reconnected/refreshed after game finished
             const playerState = getPlayerState(game, socket.id);
             io.to(socket.id).emit('update', playerState); // Send final state
             console.log(`Player ${socket.id} reconnected/refreshed to finished game ${gameId}`);
       }
    });

    socket.on('fire', ({ gameId, row, col }: { gameId: string, row: number, col: number }) => {
        console.log(`Received fire event from ${socket.id} for game ${gameId} at (${row}, ${col})`);
        const game = games[gameId];
        const player = game?.players[socket.id];

        if (!game || !player || game.status !== 'playing') {
            console.log(`Invalid fire event: Game not found (${!!game}), player not found (${!!player}), or game not playing. Game status: ${game?.status}`);
            socket.emit('error', { message: 'Invalid action: Cannot fire now.' });
            return;
        }

        if (game.playerOrder[game.currentPlayerIndex] !== socket.id) {
             console.log(`Invalid fire event: Not player ${socket.id}'s turn. Current turn: ${game.playerOrder[game.currentPlayerIndex]}`);
            socket.emit('error', { message: 'Not your turn.' });
            return;
        }

        const opponentId = getOpponentId(game, socket.id);
        if (!opponentId || !game.players[opponentId]) { // Also check if opponent player object exists
            console.error(`Error: Opponent not found or missing player object for player ${socket.id} in game ${gameId}`);
             socket.emit('error', { message: 'Opponent data missing. Game cannot continue.' });
             game.status = 'finished';
             game.winner = socket.id; // Player wins if opponent disappears
             io.to(socket.id).emit('update', getPlayerState(game, socket.id));
             // Should we delete the game? Maybe wait for disconnect?
            return;
        }
        const opponent = game.players[opponentId];
        const shotKey = `${row},${col}`;

        // Check if player already shot here (using the player's shot set)
        if (player.shots.has(shotKey)) {
            console.log(`Invalid fire event: Coordinate (${row}, ${col}) already fired upon by ${socket.id}.`);
            // Do not emit error for this, just ignore the redundant shot attempt silently
            // socket.emit('error', { message: 'You already fired at this location.' });
            return;
        }

        // Validate coordinates
        if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) {
            console.log(`Invalid fire event: Coordinates (${row}, ${col}) out of bounds.`);
            socket.emit('error', { message: 'Coordinates out of bounds.' });
            return;
        }

        player.shots.add(shotKey);
        const targetCell = opponent.board[row][col];
        let hit = false;
        let shipSunk = false;
        let sunkShipName: string | null = null;

        if (targetCell === 1) { // Hit!
            console.log(`Player ${socket.id} HIT opponent ${opponentId} at (${row}, ${col})`);
            hit = true;
           // Mark as hit on opponent's *actual* board (used for game logic)
           opponent.board[row][col] = 2;

            // Find which ship was hit and increment its hit count
            const hitShip = opponent.ships.find(ship =>
                ship.positions.some(pos => pos[0] === row && pos[1] === col)
            );

            if (hitShip) {
                hitShip.hits++;
                console.log(`Ship ${hitShip.name} hit. Hits: ${hitShip.hits}/${hitShip.size}`);
                if (hitShip.hits === hitShip.size) {
                    console.log(`Player ${socket.id} SUNK opponent's ${hitShip.name}`);
                    shipSunk = true;
                    sunkShipName = hitShip.name;
                    opponent.sunkShips++; // CORRECT: Increment opponent's sunk count
                    console.log(`Opponent ${opponentId} now has ${opponent.sunkShips} ships sunk.`);
                    // Check for win condition
                    if (opponent.sunkShips === shipsConfig.length) { // CORRECT: Check opponent's sunk count
                        console.log(`Player ${socket.id} WINS game ${gameId}! All opponent ships sunk.`);
                        game.status = 'finished';
                        game.winner = socket.id;
                    }
                }
            } else {
                 console.error(`ERROR: Hit detected at (${row}, ${col}) on opponent ${opponentId}, but no corresponding ship found! Board state: ${opponent.board[row][col]}`);
            }
        } else { // Miss
             console.log(`Player ${socket.id} MISSED opponent ${opponentId} at (${row}, ${col})`);
            // Mark as miss on opponent's actual board only if it was water (0)
            if(opponent.board[row][col] === 0) {
                 opponent.board[row][col] = 3;
            }
            hit = false;
        }

        // Switch turn if game is still playing
        if (game.status === 'playing') {
            game.currentPlayerIndex = (game.currentPlayerIndex + 1) % 2;
             console.log(`Turn switched. Next player: ${game.playerOrder[game.currentPlayerIndex]}`);
        }

        // Notify both players about the update
        game.playerOrder.forEach(playerId => {
             if (game.players[playerId]) { // Ensure player exists before sending update
                io.to(playerId).emit('update', getPlayerState(game, playerId));
             }
        });
         if (game.status === 'finished') {
            console.log(`Game ${gameId} finished. Winner: ${game.winner}. Final state sent.`);
        }
    });

     socket.on('newGame', ({ gameId }: { gameId: string }) => {
        const game = games[gameId];
         // Only allow new game if the game exists and is finished
        if (game && game.status === 'finished') {
             // Ensure the requesting player is actually part of the finished game
             if (!game.players[socket.id]) { // Check if player exists in the game object
                console.log(`Player ${socket.id} attempted to restart game ${gameId} they weren't part of.`);
                socket.emit('error', { message: 'Cannot restart a game you are not in.' });
                return;
            }

            console.log(`Player ${socket.id} requested reset for game ${gameId}.`);
            // Reset game state, keeping original players if they are still connected
            game.status = 'waiting'; // Reset to waiting
            game.winner = null;
            game.currentPlayerIndex = -1;

            // Re-initialize player states for players still in the order
             const currentPlayers = [...game.playerOrder]; // Copy player order before modification
             currentPlayers.forEach(playerId => {
                 const player = game.players[playerId];
                 if (player) {
                    player.board = createInitialBoard();
                    player.ships = shipsConfig.map(s => ({ ...s, positions: [], hits: 0 }));
                    player.shots = new Set<string>();
                    player.sunkShips = 0;
                }
            });

            console.log(`Game ${gameId} state reset. Current players in order: ${game.playerOrder.join(', ')}`);

            // Check if both original players are still present
            if (game.playerOrder.length === 2) {
                console.log(`Both players present for restart. Starting game ${gameId} immediately.`);
                 game.status = 'playing';
                 game.currentPlayerIndex = Math.floor(Math.random() * 2);
                 let placementSuccess = true;
                for (const playerId of game.playerOrder) {
                    const player = game.players[playerId];
                    const success = placeShipsRandomly(player.board, player.ships);
                    if (!success) {
                         console.error(`Failed to place ships for player ${playerId} in game ${gameId} on restart`);
                         io.to(gameId).emit('error', { message: 'Failed to restart game board. Please try creating a new game.' });
                         game.playerOrder.forEach(pid => {
                             const playerSocket = io.sockets.sockets.get(pid);
                             if(playerSocket) playerSocket.leave(gameId);
                         });
                         delete games[gameId];
                         placementSuccess = false;
                         break;
                    }
                }
                if(placementSuccess) {
                    game.playerOrder.forEach((playerId, index) => {
                         io.to(playerId).emit('gameStart', { 
                            playerIndex: index, 
                            initialState: getPlayerState(game!, playerId)
                         });
                    });
                    console.log(`Game ${gameId} restarted. First turn: ${game.playerOrder[game.currentPlayerIndex]}`);
                }
            } else {
                 // If only one player is left after 'newGame' was requested
                 console.log(`Game ${gameId} reset, but only one player present (${game.playerOrder[0]}). Waiting for opponent.`);
                 game.status = 'waiting';
                 if(game.playerOrder.length > 0) {
                    // Notify the remaining player they are waiting
                    io.to(game.playerOrder[0]).emit('waiting', { message: 'Waiting for opponent to rejoin or new opponent...' });
                 }
            }

        } else {
             console.log(`Player ${socket.id} attempted invalid 'newGame' request for game ${gameId}. Game status: ${game?.status}`);
            socket.emit('error', { message: 'Cannot start a new game now.' });
        }
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
      // Find which game the player was in
      let gameId: string | null = null;
      let playerIndex = -1;
      for (const id in games) {
          const game = games[id];
          // Check playerOrder first
          const index = game.playerOrder.indexOf(socket.id);
          if (index !== -1) {
              gameId = id;
              playerIndex = index;
              break;
          }
           // If not in order, check if they exist in the players object (e.g., joined but opponent left before start)
           if (game.players[socket.id]) {
               gameId = id;
               playerIndex = -1; // Mark as not in order
               break;
           }
      }

      if (gameId) {
        const game = games[gameId];
        console.log(`Player ${socket.id} disconnecting from game ${gameId} (was in playerOrder: ${playerIndex !== -1}). Status: ${game.status}`);

        const wasInPlayerOrder = playerIndex !== -1;

        // Remove player from game structures
        if(game.players[socket.id]) {
             delete game.players[socket.id];
        }
        if (wasInPlayerOrder) {
             game.playerOrder.splice(playerIndex, 1);
        }

        console.log(`Player removed. Remaining players in order: [${game.playerOrder.join(', ')}]. Total players object keys: ${Object.keys(game.players).length}`);

        // Determine game outcome based on state and remaining players
        if (game.status === 'playing') {
           console.log(`Game ${gameId} was 'playing'. Ending due to disconnect.`);
           const remainingPlayerId = game.playerOrder[0]; // Should be the opponentId if logic holds

           if (remainingPlayerId && game.players[remainingPlayerId]) {
                console.log(`Notifying remaining player ${remainingPlayerId} they won.`);
                game.status = 'finished';
                game.winner = remainingPlayerId;
                // Get final state *before* notifying
                const finalState = getPlayerState(game, remainingPlayerId);
                io.to(remainingPlayerId).emit('update', {
                    ...finalState,
                    message: 'Opponent disconnected. You win!',
                    status: 'finished', // Ensure status is explicitly finished
                    winner: remainingPlayerId // Ensure winner is explicitly set
                });
                console.log(`Game ${gameId} ended due to disconnect. Winner: ${remainingPlayerId}`);
           } else {
               console.log(`Game ${gameId} is now empty after disconnect during 'playing'. Deleting game.`);
               delete games[gameId];
           }
        } else if (game.status === 'waiting') {
            // If player 1 disconnects while waiting, or player 2 disconnects before game starts
            console.log(`Player disconnected during 'waiting' phase.`);
            if (game.playerOrder.length === 0 && Object.keys(game.players).length === 0) {
                // The first and only player disconnected
                console.log(`Game ${gameId} is now empty after disconnect during 'waiting'. Deleting game.`);
                delete games[gameId];
            } else if (game.playerOrder.length === 1) {
                // Player 2 disconnected before start, notify Player 1
                const remainingPlayerId = game.playerOrder[0];
                 console.log(`Notifying remaining player ${remainingPlayerId} that opponent left.`);
                 io.to(remainingPlayerId).emit('waiting', { message: 'Opponent left. Waiting for a new opponent...' });
            } else {
                 // This case might occur if disconnect happens rapidly after join
                 console.log(`Disconnect during 'waiting' resulted in unexpected player count: ${game.playerOrder.length}. Cleaning up if empty.`);
                 if (Object.keys(game.players).length === 0) {
                     delete games[gameId];
                 }
            }
        } else if (game.status === 'finished') {
             console.log(`Player ${socket.id} left finished game ${gameId}.`);
             // If the last player leaves a finished game, clean it up
             if (Object.keys(game.players).length === 0) {
                 console.log(`Last player left finished game ${gameId}. Deleting game.`);
                 delete games[gameId];
            }
        }

      } else {
          console.log(`Disconnected socket ${socket.id} was not found in any active game.`);
      }
    });
  });

  httpServer
    .once('error', (err) => {
      console.error('Server error:', err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });
});
