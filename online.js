/* ------------------------------------------------------------------
   Écho Party — Réseau via Socket.io (plus de P2P/WebRTC)
   Le serveur relais est sur Render.com
------------------------------------------------------------------- */

const SERVER_URL = 'https://echoparty-server.onrender.com';

const socket = io(SERVER_URL, { transports: ['websocket', 'polling'] });

const onlineEls = {
  error: document.getElementById('onlineSetupError'),
  tabCreate: document.getElementById('tabCreate'),
  tabJoin: document.getElementById('tabJoin'),
  createPane: document.getElementById('createPane'),
  joinPane: document.getElementById('joinPane'),
  createNameInput: document.getElementById('createNameInput'),
  createRoomBtn: document.getElementById('createRoomBtn'),
  joinNameInput: document.getElementById('joinNameInput'),
  joinCodeInput: document.getElementById('joinCodeInput'),
  joinRoomBtn: document.getElementById('joinRoomBtn'),
  roomCodeDisplay: document.getElementById('roomCodeDisplay'),
  lobbyPlayerList: document.getElementById('lobbyPlayerList'),
  onlineStartBtn: document.getElementById('onlineStartBtn'),
  lobbyWaitingText: document.getElementById('lobbyWaitingText'),
  hostChooseView: document.getElementById('hostChooseView'),
  clientWaitView: document.getElementById('clientWaitView'),
  hostSoundList: document.getElementById('hostSoundList'),
  hostConfirmSoundBtn: document.getElementById('hostConfirmSoundBtn'),
  recordingInstruction: document.getElementById('recordingInstruction'),
  recordingTimerRing: document.getElementById('recordingTimerRing'),
  recordingTimerValue: document.getElementById('recordingTimerValue'),
  recordingStatusText: document.getElementById('recordingStatusText'),
  recordingUploadText: document.getElementById('recordingUploadText'),
  recordingWaveform: document.getElementById('recordingWaveform'),
  playbackPlayerName: document.getElementById('playbackPlayerName'),
  playbackOriginalName: document.getElementById('playbackOriginalName'),
  playbackWaveform: document.getElementById('playbackWaveform'),
  playbackActions: document.getElementById('playbackActions'),
  playbackReplayOriginalBtn: document.getElementById('playbackReplayOriginalBtn'),
  playbackReplayImitationBtn: document.getElementById('playbackReplayImitationBtn'),
  playbackNextBtn: document.getElementById('playbackNextBtn'),
  playbackWaitText: document.getElementById('playbackWaitText'),
  votingTimerRing: document.getElementById('votingTimerRing'),
  votingTimerValue: document.getElementById('votingTimerValue'),
  votingGrid: document.getElementById('votingGrid'),
  voteConfirmText: document.getElementById('voteConfirmText'),
  roundResultSoundName: document.getElementById('roundResultSoundName'),
  roundResultList: document.getElementById('roundResultList'),
  nextRoundBtn: document.getElementById('nextRoundBtn'),
  roundResultWaitText: document.getElementById('roundResultWaitText'),
  onlineFinalScoreboard: document.getElementById('onlineFinalScoreboard'),
  onlineRestartBtn: document.getElementById('onlineRestartBtn'),
  onlineEndWaitingText: document.getElementById('onlineEndWaitingText'),
};

const onlineState = {
  uid: null,
  code: null,
  isHost: false,
  roomState: null,
  timerInterval: null,
  votedThisRound: false,
  selectedSoundIndex: null,
};

const onlineAudio = new Audio();
const playbackAudio = new Audio();

function getOrCreateUid() {
  let uid = sessionStorage.getItem('echoparty_uid');
  if (!uid) {
    uid = 'p-' + Date.now() + '-' + Math.random().toString(16).slice(2);
    sessionStorage.setItem('echoparty_uid', uid);
  }
  return uid;
}

function randomRoomCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 4; i++) code += letters[Math.floor(Math.random() * letters.length)];
  return code;
}

function showOnlineError(msg) {
  onlineEls.error.textContent = msg;
  onlineEls.error.hidden = false;
}

/* ─────────────── TABS ─────────────── */
onlineEls.tabCreate.addEventListener('click', () => switchOnlineTab('create'));
onlineEls.tabJoin.addEventListener('click', () => switchOnlineTab('join'));

function switchOnlineTab(which) {
  const isCreate = which === 'create';
  onlineEls.tabCreate.classList.toggle('active', isCreate);
  onlineEls.tabJoin.classList.toggle('active', !isCreate);
  onlineEls.createPane.hidden = !isCreate;
  onlineEls.joinPane.hidden = isCreate;
}

/* ─────────────── CONNEXION SOCKET ─────────────── */
socket.on('connect', () => {
  console.log('✓ Connecté au serveur Socket.io');
  onlineEls.error.hidden = true;
});

socket.on('connect_error', (err) => {
  console.error('Erreur Socket.io:', err);
  showOnlineError('Impossible de rejoindre le serveur. Vérifie ta connexion.');
});

socket.on('room_error', (msg) => {
  showOnlineError(msg);
  onlineEls.createRoomBtn.disabled = false;
  onlineEls.joinRoomBtn.disabled = false;
});

socket.on('state', (room) => renderRoom(room));

socket.on('playback_audio', ({ uid, b64, mimeType }) => {
  playBase64Audio(b64, mimeType);
});

/* ─────────────── CRÉER ─────────────── */
onlineEls.createRoomBtn.addEventListener('click', () => {
  const name = onlineEls.createNameInput.value.trim();
  if (!name) { showOnlineError('Entre ton prénom.'); return; }
  onlineEls.createRoomBtn.disabled = true;
  onlineState.uid = getOrCreateUid();
  onlineState.code = randomRoomCode();
  onlineState.isHost = true;
  socket.emit('create_room', { code: onlineState.code, uid: onlineState.uid, name });
});

/* ─────────────── REJOINDRE ─────────────── */
onlineEls.joinRoomBtn.addEventListener('click', () => {
  const name = onlineEls.joinNameInput.value.trim();
  const code = onlineEls.joinCodeInput.value.replace(/\s/g, '').toUpperCase();
  if (!name || !code) { showOnlineError('Prénom et code requis.'); return; }
  onlineEls.joinRoomBtn.disabled = true;
  onlineState.uid = getOrCreateUid();
  onlineState.code = code;
  onlineState.isHost = false;
  socket.emit('join_room', { code, uid: onlineState.uid, name });
});

/* ─────────────── RENDU GLOBAL ─────────────── */
function renderRoom(room) {
  onlineState.roomState = room;
  onlineState.isHost = room.hostId === onlineState.uid;
  const players = room.players || {};

  switch (room.status) {
    case 'lobby':       renderLobby(room, players); break;
    case 'host_choose': renderHostChoose(room); break;
    case 'recording':   renderRecording(room); break;
    case 'playback':    renderPlayback(room, players); break;
    case 'voting':      renderVoting(room, players); break;
    case 'round_results': renderRoundResults(room, players); break;
    case 'end':         renderEnd(room, players); break;
  }
}

/* ─────────────── LOBBY ─────────────── */
function renderLobby(room, players) {
  onlineEls.roomCodeDisplay.textContent = onlineState.code;
  onlineEls.lobbyPlayerList.innerHTML = '';
  room.playerOrder.forEach(uid => {
    const li = document.createElement('li');
    li.textContent = players[uid].name + (uid === room.hostId ? ' 👑' : '');
    onlineEls.lobbyPlayerList.appendChild(li);
  });
  onlineEls.onlineStartBtn.hidden = !onlineState.isHost;
  onlineEls.onlineStartBtn.disabled = room.playerOrder.length < 2;
  onlineEls.lobbyWaitingText.hidden = onlineState.isHost;
  onlineEls.createRoomBtn.disabled = false;
  onlineEls.joinRoomBtn.disabled = false;
  showScreen('online-lobby');
}

onlineEls.onlineStartBtn.addEventListener('click', () => {
  if (!onlineState.isHost) return;
  socket.emit('update_state', { status: 'host_choose', round: 1 });
});

/* ─────────────── CHOIX DU SON (hôte) ─────────────── */
function renderHostChoose(room) {
  els.topbarInfo.hidden = false;
  els.roundLabel.textContent = `Manche ${room.round}`;
  renderScorebar(room);
  onlineEls.hostChooseView.hidden = !onlineState.isHost;
  onlineEls.clientWaitView.hidden = onlineState.isHost;

  if (onlineState.isHost && onlineEls.hostSoundList.children.length === 0) {
    state.sounds.forEach((s, idx) => {
      const li = document.createElement('li');
      li.textContent = s.label;
      const playBtn = document.createElement('button');
      playBtn.textContent = '▶';
      playBtn.className = 'btn btn-ghost';
      playBtn.onclick = (e) => { e.stopPropagation(); onlineAudio.src = s.url; onlineAudio.play(); };
      li.appendChild(playBtn);
      li.onclick = () => {
        Array.from(onlineEls.hostSoundList.children).forEach(c => c.classList.remove('selected'));
        li.classList.add('selected');
        onlineState.selectedSoundIndex = idx;
        onlineEls.hostConfirmSoundBtn.disabled = false;
      };
      onlineEls.hostSoundList.appendChild(li);
    });
  }
  showScreen('host-choose');
}

onlineEls.hostConfirmSoundBtn.addEventListener('click', () => {
  if (!onlineState.isHost || onlineState.selectedSoundIndex === null) return;
  const s = state.sounds[onlineState.selectedSoundIndex];
  const tempA = new Audio(s.url);
  tempA.onloadedmetadata = () => {
    const dur = Math.ceil(tempA.duration * 1000);
    socket.emit('update_state', {
      status: 'recording',
      soundIndex: onlineState.selectedSoundIndex,
      timerEndsAt: Date.now() + 2000 + dur
    });
  };
  tempA.onerror = () => {
    socket.emit('update_state', {
      status: 'recording',
      soundIndex: onlineState.selectedSoundIndex,
      timerEndsAt: Date.now() + 7000
    });
  };
});

/* ─────────────── ENREGISTREMENT ─────────────── */
let mediaRecorder = null;
let recordingChunks = [];
let recordingTimeout = null;

function renderRecording(room) {
  if (onlineState.roomState?.status === 'recording' && room.status === 'recording' && onlineState.roomState.soundIndex === room.soundIndex) return;
  showScreen('recording');
  onlineEls.recordingStatusText.hidden = true;
  onlineEls.recordingUploadText.hidden = true;
  onlineEls.recordingInstruction.textContent = 'Préparez-vous...';

  const sound = state.sounds[room.soundIndex];
  onlineAudio.src = sound.url;
  if (typeof onlineAudio.setSinkId === 'function' && state.deviceIdOut !== 'default') {
    onlineAudio.setSinkId(state.deviceIdOut).catch(() => {});
  }

  const timeUntilEnd = room.timerEndsAt - Date.now();
  clearInterval(onlineState.timerInterval);
  onlineState.timerInterval = setInterval(() => {
    const left = Math.max(0, Math.round((room.timerEndsAt - Date.now()) / 1000));
    onlineEls.recordingTimerValue.textContent = left;
  }, 500);

  const prepDelay = Math.max(500, timeUntilEnd - (sound ? 0 : 0) - 100);
  // On attend 2s (délai de préparation), puis on joue et enregistre
  setTimeout(async () => {
    onlineEls.recordingInstruction.textContent = 'IMITEZ MAINTENANT !';
    onlineEls.recordingStatusText.hidden = false;
    onlineEls.recordingWaveform.classList.add('playing');
    onlineAudio.currentTime = 0;
    onlineAudio.play().catch(() => {});

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: state.deviceIdIn ? { deviceId: { exact: state.deviceIdIn } } : true
      });
      mediaRecorder = new MediaRecorder(stream);
      recordingChunks = [];
      mediaRecorder.ondataavailable = e => recordingChunks.push(e.data);
      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        onlineEls.recordingWaveform.classList.remove('playing');
        onlineEls.recordingStatusText.hidden = true;
        onlineEls.recordingUploadText.hidden = false;

        const blob = new Blob(recordingChunks, { type: mediaRecorder.mimeType });
        const reader = new FileReader();
        reader.onloadend = () => {
          socket.emit('submit_audio', {
            uid: onlineState.uid,
            b64: reader.result,
            mimeType: mediaRecorder.mimeType
          });
        };
        reader.readAsDataURL(blob);
      };
      mediaRecorder.start();
    } catch (err) {
      console.error('Micro inaccessible:', err);
      // Soumettre un silence vide pour ne pas bloquer les autres
      socket.emit('submit_audio', { uid: onlineState.uid, b64: '', mimeType: 'audio/webm' });
    }
  }, 2000);

  clearTimeout(recordingTimeout);
  recordingTimeout = setTimeout(() => {
    if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop();
  }, Math.max(3000, timeUntilEnd));
}

/* ─────────────── PLAYBACK ─────────────── */
function playBase64Audio(b64, mimeType) {
  if (!b64) return;
  playbackAudio.src = b64;
  if (typeof playbackAudio.setSinkId === 'function' && state.deviceIdOut !== 'default') {
    playbackAudio.setSinkId(state.deviceIdOut).catch(() => {});
  }
  playbackAudio.play().catch(() => {});
  onlineEls.playbackWaveform.classList.add('playing');
}

playbackAudio.onended = () => onlineEls.playbackWaveform.classList.remove('playing');

function renderPlayback(room, players) {
  const targetUid = room.playerOrder[room.playbackCursor];
  const player = players[targetUid];
  const sound = state.sounds[room.soundIndex];
  onlineEls.playbackPlayerName.textContent = player ? player.name : '—';
  onlineEls.playbackOriginalName.textContent = sound ? sound.label : '—';
  onlineEls.playbackActions.hidden = !onlineState.isHost;
  onlineEls.playbackWaitText.hidden = onlineState.isHost;
  showScreen('playback');
}

onlineEls.playbackReplayOriginalBtn.addEventListener('click', () => {
  onlineAudio.currentTime = 0;
  onlineAudio.play();
});

onlineEls.playbackReplayImitationBtn.addEventListener('click', () => {
  if (!onlineState.isHost) return;
  socket.emit('request_playback');
});

onlineEls.playbackNextBtn.addEventListener('click', () => {
  if (!onlineState.isHost) return;
  playbackAudio.pause();
  socket.emit('next_playback');
});

/* ─────────────── VOTE ─────────────── */
function renderVoting(room, players) {
  onlineState.votedThisRound = !!room.votes[onlineState.uid];
  onlineEls.voteConfirmText.hidden = !onlineState.votedThisRound;
  onlineEls.votingGrid.innerHTML = '';

  room.playerOrder.forEach(uid => {
    if (uid === onlineState.uid) return;
    const btn = document.createElement('button');
    btn.className = 'btn btn-secondary';
    btn.style.width = '200px';
    btn.textContent = players[uid].name;
    btn.disabled = onlineState.votedThisRound;
    if (room.votes[onlineState.uid] === uid) btn.classList.add('btn-success');
    btn.onclick = () => socket.emit('vote', { targetUid: uid });
    onlineEls.votingGrid.appendChild(btn);
  });

  clearInterval(onlineState.timerInterval);
  onlineState.timerInterval = setInterval(() => {
    const left = Math.max(0, Math.round((room.timerEndsAt - Date.now()) / 1000));
    onlineEls.votingTimerValue.textContent = left;
    if (left <= 0) {
      clearInterval(onlineState.timerInterval);
      if (onlineState.isHost) socket.emit('force_tally');
    }
  }, 500);

  showScreen('voting');
}

/* ─────────────── RÉSULTATS DE MANCHE ─────────────── */
function renderRoundResults(room, players) {
  const sound = state.sounds[room.soundIndex];
  onlineEls.roundResultSoundName.textContent = sound ? sound.label : '—';

  const votesReceived = {};
  Object.values(room.votes || {}).forEach(uid => {
    votesReceived[uid] = (votesReceived[uid] || 0) + 1;
  });

  onlineEls.roundResultList.innerHTML = '';
  room.playerOrder.forEach(uid => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${players[uid].name}</span><span>+${votesReceived[uid] || 0} pts</span>`;
    onlineEls.roundResultList.appendChild(li);
  });

  onlineEls.nextRoundBtn.hidden = !onlineState.isHost;
  onlineEls.roundResultWaitText.hidden = onlineState.isHost;
  renderScorebar(room);
  showScreen('round-results');
}

onlineEls.nextRoundBtn.addEventListener('click', () => {
  if (!onlineState.isHost) return;
  // Réinitialiser la liste des sons pour pouvoir recliquer
  onlineEls.hostSoundList.innerHTML = '';
  onlineEls.hostConfirmSoundBtn.disabled = true;
  onlineState.selectedSoundIndex = null;
  socket.emit('update_state', {
    status: 'host_choose',
    round: onlineState.roomState.round + 1,
    soundIndex: null,
    votes: {},
    playbackCursor: -1
  });
});

/* ─────────────── SCORES FINAUX ─────────────── */
function renderEnd(room, players) {
  const ranked = Object.values(players).sort((a, b) => b.score - a.score);
  onlineEls.onlineFinalScoreboard.innerHTML = '';
  ranked.forEach(p => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${p.name}</span><span class="score">${p.score} pt${p.score > 1 ? 's' : ''}</span>`;
    onlineEls.onlineFinalScoreboard.appendChild(li);
  });
  onlineEls.onlineRestartBtn.hidden = !onlineState.isHost;
  onlineEls.onlineEndWaitingText.hidden = onlineState.isHost;
  els.topbarInfo.hidden = true;
  els.scorebar.hidden = true;
  showScreen('online-end');
}

onlineEls.onlineRestartBtn.addEventListener('click', () => {
  if (!onlineState.isHost) return;
  const room = onlineState.roomState;
  const newPlayers = JSON.parse(JSON.stringify(room.players));
  Object.keys(newPlayers).forEach(uid => newPlayers[uid].score = 0);
  onlineEls.hostSoundList.innerHTML = '';
  socket.emit('update_state', { status: 'lobby', round: 0, players: newPlayers });
});

/* ─────────────── SCOREBAR ─────────────── */
function renderScorebar(room) {
  els.scorebar.hidden = false;
  els.scorebar.innerHTML = '';
  (room.playerOrder || []).forEach(uid => {
    const p = room.players[uid];
    if (!p) return;
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.innerHTML = `${p.name} · <b>${p.score || 0}</b>`;
    els.scorebar.appendChild(chip);
  });
}