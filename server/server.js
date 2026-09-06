const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 15e6 // 15MB max pour les blobs audio en base64
});

const rooms = {}; // code -> { hostSocketId, state, recordings }

app.get('/', (req, res) => res.send('Echo Party Server OK ✓'));
app.get('/health', (req, res) => res.json({ status: 'ok', rooms: Object.keys(rooms).length }));

io.on('connection', (socket) => {
  let myRoom = null;
  let myUid = null;
  let isHost = false;

  /* ─────────────── CRÉER UNE SALLE ─────────────── */
  socket.on('create_room', ({ code, uid, name }) => {
    if (rooms[code]) {
      socket.emit('room_error', 'Code déjà utilisé. Réessaie.');
      return;
    }
    myRoom = code;
    myUid = uid;
    socket._uid = uid; // pour le routing WebRTC
    isHost = true;
    rooms[code] = {
      hostSocketId: socket.id,
      hostUid: uid,
      recordings: {},
      state: {
        hostId: uid,
        status: 'lobby',
        players: { [uid]: { name, score: 0 } },
        playerOrder: [uid],
        round: 0,
        soundIndex: null,
        playbackCursor: -1,
        timerEndsAt: null,
        votes: {}
      }
    };
    socket.join(code);
    socket.emit('state', rooms[code].state);
    console.log(`[${code}] Salle créée par ${name} (${uid})`);
  });

  /* ─────────────── REJOINDRE UNE SALLE ─────────────── */
  socket.on('join_room', ({ code, uid, name }) => {
    const room = rooms[code];
    if (!room) {
      socket.emit('room_error', 'Salle introuvable. Vérifie le code.');
      return;
    }
    if (room.state.status !== 'lobby') {
      socket.emit('room_error', 'La partie a déjà commencé.');
      return;
    }
    myRoom = code;
    myUid = uid;
    socket._uid = uid; // pour le routing WebRTC
    isHost = false;
    room.state.players[uid] = { name, score: 0 };
    if (!room.state.playerOrder.includes(uid)) room.state.playerOrder.push(uid);
    socket.join(code);
    io.to(code).emit('state', room.state);
    console.log(`[${code}] ${name} a rejoint la salle.`);
  });

  /* ─────────────── MISE À JOUR ÉTAT (Hôte uniquement) ─────────────── */
  socket.on('update_state', (updates) => {
    const room = rooms[myRoom];
    if (!room || room.hostUid !== myUid) return;
    Object.assign(room.state, updates);
    io.to(myRoom).emit('state', room.state);
  });

  /* ─────────────── SOUMISSION AUDIO (joueur) ─────────────── */
  socket.on('submit_audio', ({ uid, b64, mimeType }) => {
    const room = rooms[myRoom];
    if (!room || room.state.status !== 'recording') return;
    room.recordings[uid] = { b64, mimeType };
    console.log(`[${myRoom}] Audio reçu de ${uid} (${room.state.playerOrder.length - Object.keys(room.recordings).length} restant)`);

    if (Object.keys(room.recordings).length >= room.state.playerOrder.length) {
      room.state.status = 'playback';
      room.state.playbackCursor = 0;
      io.to(myRoom).emit('state', room.state);
      broadcastRecording(myRoom);
    }
  });

  /* ─────────────── DEMANDE DE RÉÉCOUTE (Hôte) ─────────────── */
  socket.on('request_playback', () => {
    const room = rooms[myRoom];
    if (!room || room.hostUid !== myUid) return;
    broadcastRecording(myRoom);
  });

  /* ─────────────── PASSER AU JOUEUR SUIVANT (Hôte) ─────────────── */
  socket.on('next_playback', () => {
    const room = rooms[myRoom];
    if (!room || room.hostUid !== myUid) return;
    if (room.state.playbackCursor + 1 < room.state.playerOrder.length) {
      room.state.playbackCursor++;
      io.to(myRoom).emit('state', room.state);
      broadcastRecording(myRoom);
    } else {
      room.state.status = 'voting';
      room.state.timerEndsAt = Date.now() + 15000;
      room.state.votes = {};
      io.to(myRoom).emit('state', room.state);
    }
  });

  /* ─────────────── VOTE (joueur) ─────────────── */
  socket.on('vote', ({ targetUid }) => {
    const room = rooms[myRoom];
    if (!room || room.state.status !== 'voting' || room.state.votes[myUid]) return;
    room.state.votes[myUid] = targetUid;
    io.to(myRoom).emit('state', room.state);

    if (Object.keys(room.state.votes).length >= room.state.playerOrder.length) {
      tallyVotes(myRoom);
    }
  });

  /* ─────────────── FIN DU VOTE (timeout côté hôte) ─────────────── */
  socket.on('force_tally', () => {
    const room = rooms[myRoom];
    if (!room || room.hostUid !== myUid) return;
    tallyVotes(myRoom);
  });

  /* ─────────────── SIGNAL WEBRTC (vocal temps réel) ─────────────── */
  socket.on('signal', ({ toUid, data }) => {
    const room = rooms[myRoom];
    if (!room) return;
    // Trouver le socket de l'autre joueur dans la salle
    const socketsInRoom = io.sockets.adapter.rooms.get(myRoom);
    if (!socketsInRoom) return;
    // On envoie le signal à tous les sockets dans la salle qui ont le bon uid
    for (const sid of socketsInRoom) {
      const targetSocket = io.sockets.sockets.get(sid);
      if (targetSocket && targetSocket._uid === toUid) {
        targetSocket.emit('signal', { fromUid: myUid, data });
        break;
      }
    }
  });

  /* ─────────────── DÉCONNEXION ─────────────── */
  socket.on('disconnect', () => {
    if (!myRoom || !rooms[myRoom]) return;
    const room = rooms[myRoom];
    if (isHost) {
      io.to(myRoom).emit('room_error', 'L\'hôte a quitté la partie.');
      delete rooms[myRoom];
      console.log(`[${myRoom}] Salle supprimée (hôte déconnecté).`);
    } else {
      delete room.state.players[myUid];
      room.state.playerOrder = room.state.playerOrder.filter(u => u !== myUid);
      io.to(myRoom).emit('state', room.state);
    }
  });
});

/* ─────────────── HELPERS ─────────────── */
function broadcastRecording(code) {
  const room = rooms[code];
  if (!room) return;
  const uid = room.state.playerOrder[room.state.playbackCursor];
  const rec = room.recordings[uid];
  if (rec) io.to(code).emit('playback_audio', { uid, b64: rec.b64, mimeType: rec.mimeType });
}

function tallyVotes(code) {
  const room = rooms[code];
  if (!room) return;
  const newPlayers = JSON.parse(JSON.stringify(room.state.players));
  Object.values(room.state.votes).forEach(uid => {
    if (newPlayers[uid]) newPlayers[uid].score += 1;
  });
  room.state.status = 'round_results';
  room.state.players = newPlayers;
  io.to(code).emit('state', room.state);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✓ Écho Party Server démarré sur le port ${PORT}`));
