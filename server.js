/**
 * Solythis D&D — Real-Time Multiplayer Server
 * =============================================
 * Express + Socket.io server untuk sinkronisasi game via LAN.
 * 
 * Cara pakai:
 *   npm start
 *   → Server jalan di http://[IP-Lokal]:3000
 *   → Semua laptop di Wi-Fi yang sama bisa akses
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const os = require('os');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 10e6, // 10MB — untuk fog of war image data
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

// ── Serve semua file statis dari root project ──
app.use(express.static(path.join(__dirname), {
  extensions: ['html'],
  index: 'dashboard.html'
}));

// ══════════════════════════════════════════
//  GAME STATE (in-memory)
// ══════════════════════════════════════════
const gameState = {
  players: {},          // { socketId: { name, role } }
  
  combat: {
    activeMapId: null,
    tokens: [],
    round: 1,
    activeTurnId: null,
    gridSize: 40,
    fogData: null,      // Base64 PNG string
    aoeList: [],
  },
  
  scene: {
    activePlace: null,
    activeCategory: null,
    currentIdx: 0,
    sceneFile: null,
    sceneTitle: null,
  },
  
  diceHistory: [],      // Last 30 rolls
};

// ══════════════════════════════════════════
//  SOCKET.IO EVENT HANDLERS
// ══════════════════════════════════════════
io.on('connection', (socket) => {
  console.log(`⚡ Client terhubung: ${socket.id}`);

  // ── Player Management ──
  socket.on('player:join', (data) => {
    gameState.players[socket.id] = {
      name: data.name || 'Anon',
      role: data.role || 'player',
    };
    console.log(`👤 ${data.name} bergabung sebagai ${data.role}`);
    io.emit('player:list', gameState.players);
    
    // Kirim state lengkap ke player baru
    socket.emit('state:sync', gameState);
  });

  socket.on('disconnect', () => {
    const player = gameState.players[socket.id];
    if (player) {
      console.log(`👋 ${player.name} keluar`);
      delete gameState.players[socket.id];
      io.emit('player:list', gameState.players);
    }
  });

  // ── Dice Rolling ──
  socket.on('dice:roll', (data) => {
    const roll = { ...data, socketId: socket.id, timestamp: Date.now() };
    gameState.diceHistory.push(roll);
    if (gameState.diceHistory.length > 30) gameState.diceHistory.shift();
    socket.broadcast.emit('dice:result', roll); // Broadcast ke SEMUA KECUALI pengirim
  });

  // ── Token Management ──
  socket.on('token:move', (data) => {
    const tok = gameState.combat.tokens.find(t => t.id === data.id);
    if (tok) { tok.gridX = data.gridX; tok.gridY = data.gridY; }
    socket.broadcast.emit('token:moved', data);
  });

  socket.on('token:spawn', (data) => {
    gameState.combat.tokens.push(data);
    socket.broadcast.emit('token:spawned', data);
  });

  socket.on('token:remove', (data) => {
    gameState.combat.tokens = gameState.combat.tokens.filter(t => t.id !== data.id);
    socket.broadcast.emit('token:removed', data);
  });

  socket.on('token:resize', (data) => {
    const tok = gameState.combat.tokens.find(t => t.id === data.id);
    if (tok) tok.size = data.size;
    socket.broadcast.emit('token:resized', data);
  });

  // ── HP & Initiative ──
  socket.on('hp:update', (data) => {
    const tok = gameState.combat.tokens.find(t => t.id === data.id);
    if (tok) { tok.hp = data.hp; tok.maxHp = data.maxHp; }
    socket.broadcast.emit('hp:updated', data);
  });

  socket.on('init:update', (data) => {
    const tok = gameState.combat.tokens.find(t => t.id === data.id);
    if (tok) tok.initScore = data.initScore;
    socket.broadcast.emit('init:updated', data);
  });

  socket.on('init:sort', () => {
    gameState.combat.tokens.sort((a, b) =>
      (parseFloat(b.initScore) || -Infinity) - (parseFloat(a.initScore) || -Infinity)
    );
    socket.broadcast.emit('init:sorted', {
      order: gameState.combat.tokens.map(t => t.id)
    });
  });

  // ── Turn & Round ──
  socket.on('turn:next', (data) => {
    gameState.combat.activeTurnId = data.activeTurnId;
    gameState.combat.round = data.round;
    socket.broadcast.emit('turn:changed', data);
  });

  // ── Conditions ──
  socket.on('condition:toggle', (data) => {
    const tok = gameState.combat.tokens.find(t => t.id === data.id);
    if (tok) {
      tok.conditions = data.conditions;
      tok.condTimers = data.condTimers;
    }
    socket.broadcast.emit('condition:toggled', data);
  });

  // ── Map Selection ──
  socket.on('map:select', (data) => {
    gameState.combat.activeMapId = data.mapId;
    socket.broadcast.emit('map:selected', data);
  });

  // ── Fog of War ──
  socket.on('fog:update', (data) => {
    gameState.combat.fogData = data.imageData;
    socket.broadcast.emit('fog:updated', data);
  });

  socket.on('fog:reset', () => {
    gameState.combat.fogData = null;
    socket.broadcast.emit('fog:resetted');
  });

  // ── Ping ──
  socket.on('ping:spawn', (data) => {
    const player = gameState.players[socket.id];
    socket.broadcast.emit('ping:spawned', {
      ...data,
      player: player?.name || 'Unknown'
    });
  });

  // ── AoE ──
  socket.on('aoe:update', (data) => {
    gameState.combat.aoeList = data.aoeList;
    socket.broadcast.emit('aoe:updated', data);
  });

  // ── Combat Reset ──
  socket.on('combat:reset', () => {
    gameState.combat = {
      activeMapId: gameState.combat.activeMapId,
      tokens: [],
      round: 1,
      activeTurnId: null,
      gridSize: gameState.combat.gridSize,
      fogData: null,
      aoeList: [],
    };
    socket.broadcast.emit('combat:resetted');
  });

  // ── Token Rename ──
  socket.on('token:rename', (data) => {
    const tok = gameState.combat.tokens.find(t => t.id === data.id);
    if (tok) tok.name = data.name;
    socket.broadcast.emit('token:renamed', data);
  });

  // ── Token Note ──
  socket.on('token:note', (data) => {
    const tok = gameState.combat.tokens.find(t => t.id === data.id);
    if (tok) tok.note = data.note;
    socket.broadcast.emit('token:noted', data);
  });

  // ── Grid Resize ──
  socket.on('grid:resize', (data) => {
    gameState.combat.gridSize = data.gridSize;
    socket.broadcast.emit('grid:resized', data);
  });

  // ── Scene Viewer ──
  socket.on('scene:change', (data) => {
    gameState.scene = { ...gameState.scene, ...data };
    socket.broadcast.emit('scene:changed', data);
  });

  // ── Manual State Request ──
  socket.on('state:request', () => {
    socket.emit('state:sync', gameState);
  });
});

// ══════════════════════════════════════════
//  START SERVER
// ══════════════════════════════════════════
function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

server.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log('  ⚔  SOLYTHIS D&D — Multiplayer Server  ⚔');
  console.log('═══════════════════════════════════════════');
  console.log('');
  console.log(`  📡 Lokal:    http://localhost:${PORT}`);
  console.log(`  🌐 Jaringan: http://${ip}:${PORT}`);
  console.log('');
  console.log('  Bagikan URL "Jaringan" ke semua pemain');
  console.log('  yang terhubung ke Wi-Fi yang sama.');
  console.log('');
  console.log('  Tekan Ctrl+C untuk menghentikan server.');
  console.log('═══════════════════════════════════════════');
  console.log('');
});
