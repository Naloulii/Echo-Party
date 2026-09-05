/* ------------------------------------------------------------------
   Écho Party — mode en ligne P2P (Mimic Party Revamp)
------------------------------------------------------------------- */

const onlineEls = {
  // Setup & Home
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

  // Lobby
  roomCodeDisplay: document.getElementById('roomCodeDisplay'),
  lobbyPlayerList: document.getElementById('lobbyPlayerList'),
  onlineStartBtn: document.getElementById('onlineStartBtn'),
  lobbyWaitingText: document.getElementById('lobbyWaitingText'),

  // Host Choose
  hostChooseView: document.getElementById('hostChooseView'),
  clientWaitView: document.getElementById('clientWaitView'),
  hostSoundList: document.getElementById('hostSoundList'),
  hostConfirmSoundBtn: document.getElementById('hostConfirmSoundBtn'),

  // Recording
  recordingInstruction: document.getElementById('recordingInstruction'),
  recordingTimerRing: document.getElementById('recordingTimerRing'),
  recordingTimerValue: document.getElementById('recordingTimerValue'),
  recordingStatusText: document.getElementById('recordingStatusText'),
  recordingUploadText: document.getElementById('recordingUploadText'),
  recordingWaveform: document.getElementById('recordingWaveform'),

  // Playback
  playbackPlayerName: document.getElementById('playbackPlayerName'),
  playbackOriginalName: document.getElementById('playbackOriginalName'),
  playbackWaveform: document.getElementById('playbackWaveform'),
  playbackActions: document.getElementById('playbackActions'),
  playbackReplayOriginalBtn: document.getElementById('playbackReplayOriginalBtn'),
  playbackReplayImitationBtn: document.getElementById('playbackReplayImitationBtn'),
  playbackNextBtn: document.getElementById('playbackNextBtn'),
  playbackWaitText: document.getElementById('playbackWaitText'),

  // Voting
  votingTimerRing: document.getElementById('votingTimerRing'),
  votingTimerValue: document.getElementById('votingTimerValue'),
  votingGrid: document.getElementById('votingGrid'),
  voteConfirmText: document.getElementById('voteConfirmText'),

  // Round Results
  roundResultSoundName: document.getElementById('roundResultSoundName'),
  roundResultList: document.getElementById('roundResultList'),
  nextRoundBtn: document.getElementById('nextRoundBtn'),
  roundResultWaitText: document.getElementById('roundResultWaitText'),

  // End
  onlineFinalScoreboard: document.getElementById('onlineFinalScoreboard'),
  onlineRestartBtn: document.getElementById('onlineRestartBtn'),
  onlineEndWaitingText: document.getElementById('onlineEndWaitingText'),
};

const onlineAudio = new Audio();
let playbackAudio = new Audio();

const onlineState = {
  uid: null,
  code: null,
  isHost: false,
  peer: null,
  hostConn: null, // used by client
  clientConns: {}, // used by host
  roomState: null,
  
  // Local state
  timerInterval: null,
  votedThisRound: false,
  selectedSoundIndex: null,
  
  // Host data
  recordings: {}, // uid -> blob
  currentPlaybackBlob: null,
};

function getOrCreateUid(){
  let uid = sessionStorage.getItem('echoparty_uid');
  if(!uid){
    uid = `p-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    sessionStorage.setItem('echoparty_uid', uid);
  }
  return uid;
}

function randomRoomCode(){
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for(let i = 0; i < 4; i++) code += letters[Math.floor(Math.random() * letters.length)];
  return code;
}

function showOnlineError(message){
  onlineEls.error.textContent = message;
  onlineEls.error.hidden = false;
}

/* --------------------------- Navigation Accueil --------------------------- */

onlineEls.tabCreate.addEventListener('click', () => switchOnlineTab('create'));
onlineEls.tabJoin.addEventListener('click', () => switchOnlineTab('join'));

function switchOnlineTab(which){
  const isCreate = which === 'create';
  onlineEls.tabCreate.classList.toggle('active', isCreate);
  onlineEls.tabJoin.classList.toggle('active', !isCreate);
  onlineEls.createPane.hidden = !isCreate;
  onlineEls.joinPane.hidden = isCreate;
}

const peerConfig = {
  debug: 2,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  }
};

/* --------------------------- Créer / Rejoindre --------------------------- */

onlineEls.createRoomBtn.addEventListener('click', () => {
  const name = onlineEls.createNameInput.value.trim();
  if(!name){ showOnlineError('Entre ton prénom.'); return; }
  
  onlineEls.createRoomBtn.disabled = true;
  const uid = getOrCreateUid();
  const code = randomRoomCode();
  
  onlineState.peer = new Peer('echoparty-host-' + code, peerConfig);
  
  onlineState.peer.on('open', () => {
    onlineState.uid = uid;
    onlineState.code = code;
    onlineState.isHost = true;
    onlineState.roomState = {
      hostId: uid,
      status: 'lobby',
      players: { [uid]: { name, score: 0 } },
      playerOrder: [uid],
      round: 0,
      soundIndex: null,
      playbackCursor: -1,
      timerEndsAt: null,
      votes: {},
    };
    broadcastState();
    onlineEls.createRoomBtn.disabled = false;
  });

  onlineState.peer.on('connection', (conn) => {
    conn.on('data', (data) => {
      if(data.type === 'join'){
        onlineState.clientConns[data.uid] = conn;
        onlineState.roomState.players[data.uid] = { name: data.name, score: 0 };
        if(!onlineState.roomState.playerOrder.includes(data.uid)) {
          onlineState.roomState.playerOrder.push(data.uid);
        }
        broadcastState();
      } else if (data.type === 'action') {
        handleClientAction(data.uid, data.action);
      }
    });
  });

  onlineState.peer.on('error', (err) => {
    console.error(err);
    if(err.type === 'unavailable-id') showOnlineError("Code déjà utilisé, réessaie.");
    else showOnlineError("Erreur réseau P2P.");
    onlineEls.createRoomBtn.disabled = false;
  });
});

onlineEls.joinRoomBtn.addEventListener('click', () => {
  const name = onlineEls.joinNameInput.value.trim();
  const code = onlineEls.joinCodeInput.value.trim().toUpperCase();
  if(!name || !code){ showOnlineError('Prénom et code requis.'); return; }

  onlineEls.joinRoomBtn.disabled = true;
  const uid = getOrCreateUid();
  
  let joinTimeout = setTimeout(() => {
    showOnlineError("Délai d'attente dépassé (15s). Connexion impossible. Vérifiez vos pare-feux ou réessayez.");
    onlineEls.joinRoomBtn.disabled = false;
    if(onlineState.peer) onlineState.peer.destroy();
  }, 15000);

  onlineState.peer = new Peer(peerConfig);
  
  onlineState.peer.on('open', () => {
    onlineState.hostConn = onlineState.peer.connect('echoparty-host-' + code); // Removed { reliable: true }
    
    onlineState.hostConn.on('open', () => {
      clearTimeout(joinTimeout);
      onlineState.uid = uid;
      onlineState.code = code;
      onlineState.isHost = false;
      onlineState.hostConn.send({ type: 'join', uid, name });
      onlineEls.joinRoomBtn.disabled = false;
    });

    onlineState.hostConn.on('data', (data) => {
      if(data.type === 'state') renderRoom(data.state);
      else if(data.type === 'playback_audio') playReceivedBlob(data.blob, data.uid);
    });

    onlineState.hostConn.on('close', () => showOnlineError('Hôte déconnecté.'));
    
    onlineState.hostConn.on('error', (err) => {
      clearTimeout(joinTimeout);
      console.error("Connection error:", err);
      showOnlineError("Erreur de connexion avec l'hôte.");
      onlineEls.joinRoomBtn.disabled = false;
    });
  });

  onlineState.peer.on('error', (err) => {
    clearTimeout(joinTimeout);
    console.error("PeerJS error:", err);
    showOnlineError("Impossible de rejoindre la partie. Vérifie le code.");
    onlineEls.joinRoomBtn.disabled = false;
  });
});

/* ------------------------------ Sync / Actions (Hôte) ------------------------------ */

function broadcastState() {
  if(!onlineState.isHost) return;
  const copy = JSON.parse(JSON.stringify(onlineState.roomState));
  Object.values(onlineState.clientConns).forEach(conn => {
    if(conn.open) conn.send({ type: 'state', state: copy });
  });
  renderRoom(onlineState.roomState);
}

function updateRoomState(updates) {
  if(!onlineState.isHost) return;
  Object.assign(onlineState.roomState, updates);
  broadcastState();
}

function handleClientAction(uid, data) {
  if(!onlineState.isHost) return;
  const room = onlineState.roomState;
  
  if (data.name === 'submit_audio') {
    if (room.status === 'recording') {
      // Blobs can be extracted directly (PeerJS deserializes them if supported, or ArrayBuffer)
      onlineState.recordings[uid] = new Blob([data.blob], { type: data.mimeType || 'audio/webm' });
      
      // Check if all players submitted
      if(Object.keys(onlineState.recordings).length >= room.playerOrder.length) {
        updateRoomState({ status: 'playback', playbackCursor: 0 });
        broadcastPlaybackBlob();
      }
    }
  } else if (data.name === 'vote') {
    if (room.status === 'voting' && !room.votes[uid]) {
      room.votes[uid] = data.targetUid;
      broadcastState();
      
      // Check if all voted
      if(Object.keys(room.votes).length >= room.playerOrder.length) {
        tallyVotesAndGoToResults();
      }
    }
  }
}

function sendAction(data) {
  if (onlineState.isHost) handleClientAction(onlineState.uid, data);
  else if (onlineState.hostConn?.open) onlineState.hostConn.send({ type: 'action', uid: onlineState.uid, action: data });
}

/* ------------------------------ Rendu Global ------------------------------ */

function renderRoom(room) {
  onlineState.roomState = room;
  const players = room.players || {};
  const order = room.playerOrder || Object.keys(players);
  onlineState.isHost = room.hostId === onlineState.uid;

  switch(room.status){
    case 'lobby': renderLobby(room, players, order); break;
    case 'host_choose': renderHostChoose(room); break;
    case 'recording': renderRecording(room); break;
    case 'playback': renderPlayback(room, players); break;
    case 'voting': renderVoting(room, players); break;
    case 'round_results': renderRoundResults(room, players); break;
    case 'end': renderEnd(room, players); break;
  }
}

/* ---------------- LOBBY ---------------- */
function renderLobby(room, players, order){
  onlineEls.roomCodeDisplay.textContent = onlineState.code;
  onlineEls.lobbyPlayerList.innerHTML = '';
  order.forEach(uid => {
    const li = document.createElement('li');
    li.textContent = players[uid].name + (uid === room.hostId ? ' (hôte)' : '');
    onlineEls.lobbyPlayerList.appendChild(li);
  });
  
  const canStart = onlineState.isHost && order.length >= 2;
  onlineEls.onlineStartBtn.hidden = !onlineState.isHost;
  onlineEls.onlineStartBtn.disabled = !canStart;
  onlineEls.lobbyWaitingText.hidden = onlineState.isHost;
  showScreen('online-lobby');
}

onlineEls.onlineStartBtn.addEventListener('click', () => {
  if(onlineState.isHost) updateRoomState({ status: 'host_choose', round: 1 });
});

/* ---------------- HOST CHOOSE ---------------- */
function renderHostChoose(room){
  els.topbarInfo.hidden = false;
  els.roundLabel.textContent = `Manche ${room.round}`;
  renderScorebar(room);

  onlineEls.hostChooseView.hidden = !onlineState.isHost;
  onlineEls.clientWaitView.hidden = onlineState.isHost;
  
  if (onlineState.isHost && onlineEls.hostSoundList.children.length === 0) {
    // Populate sounds
    state.sounds.forEach((s, idx) => {
      const li = document.createElement('li');
      li.textContent = s.label;
      const playBtn = document.createElement('button');
      playBtn.textContent = '▶';
      playBtn.className = 'btn btn-ghost';
      playBtn.onclick = (e) => {
        e.stopPropagation();
        onlineAudio.src = s.url;
        onlineAudio.play();
      };
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
  if(!onlineState.isHost || onlineState.selectedSoundIndex === null) return;
  // Compute duration roughly or set fixed prep time + duration
  // For safety, let's load the audio to get exact duration, but async.
  const s = state.sounds[onlineState.selectedSoundIndex];
  const tempA = new Audio(s.url);
  tempA.onloadedmetadata = () => {
    const dur = tempA.duration * 1000;
    onlineState.recordings = {}; // Reset recordings
    updateRoomState({
      status: 'recording',
      soundIndex: onlineState.selectedSoundIndex,
      timerEndsAt: Date.now() + 2000 + dur // 2s prep + duration
    });
  };
});

/* ---------------- RECORDING ---------------- */
let mediaRecorder = null;
let recordingChunks = [];
let recordingTimeout = null;

function renderRecording(room) {
  showScreen('recording');
  onlineEls.recordingStatusText.hidden = true;
  onlineEls.recordingUploadText.hidden = true;
  onlineEls.recordingInstruction.textContent = "Préparez-vous...";
  onlineEls.recordingTimerRing.hidden = false;
  
  const originalSound = state.sounds[room.soundIndex];
  onlineAudio.src = originalSound.url;
  
  // Set output device
  if (typeof onlineAudio.setSinkId === 'function' && state.deviceIdOut !== 'default') {
    onlineAudio.setSinkId(state.deviceIdOut).catch(e => console.warn(e));
  }

  const prepTime = room.timerEndsAt - originalSound.url /* wait, we need original duration */
  // It's safer to just sync by timestamp
  const now = Date.now();
  const timeUntilEnd = room.timerEndsAt - now;
  
  // Let's assume duration is timeUntilEnd - 2000 roughly if we caught it right away.
  
  clearInterval(onlineState.timerInterval);
  const tick = () => {
    const left = Math.round((room.timerEndsAt - Date.now()) / 1000);
    onlineEls.recordingTimerValue.textContent = Math.max(0, left);
  };
  tick();
  onlineState.timerInterval = setInterval(tick, 1000);
  
  // Start sequence
  setTimeout(async () => {
    onlineEls.recordingInstruction.textContent = "IMITEZ MAINTENANT !";
    onlineEls.recordingStatusText.hidden = false;
    onlineEls.recordingWaveform.classList.add('playing');
    
    onlineAudio.play().catch(e=>console.error(e));
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: state.deviceIdIn } } });
      mediaRecorder = new MediaRecorder(stream);
      recordingChunks = [];
      mediaRecorder.ondataavailable = e => recordingChunks.push(e.data);
      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(recordingChunks, { type: mediaRecorder.mimeType });
        onlineEls.recordingStatusText.hidden = true;
        onlineEls.recordingUploadText.hidden = false;
        sendAction({ name: 'submit_audio', blob, mimeType: mediaRecorder.mimeType });
      };
      mediaRecorder.start();
    } catch(err) {
      console.error("Microphone error during record:", err);
      // Still submit empty to unblock host
      sendAction({ name: 'submit_audio', blob: new Blob([]), mimeType: 'audio/webm' });
    }
  }, Math.max(0, timeUntilEnd > 2000 ? timeUntilEnd - onlineAudio.duration*1000 : 0) || 2000); // 2s delay hardcoded for prep

  // Fallback stop
  clearTimeout(recordingTimeout);
  recordingTimeout = setTimeout(() => {
    onlineEls.recordingWaveform.classList.remove('playing');
    if(mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    }
  }, Math.max(0, timeUntilEnd));
}

/* ---------------- PLAYBACK ---------------- */
function broadcastPlaybackBlob() {
  const room = onlineState.roomState;
  const targetUid = room.playerOrder[room.playbackCursor];
  const blob = onlineState.recordings[targetUid];
  
  Object.values(onlineState.clientConns).forEach(conn => {
    if(conn.open && blob) conn.send({ type: 'playback_audio', uid: targetUid, blob });
  });
  playReceivedBlob(blob, targetUid);
}

function playReceivedBlob(blob, targetUid) {
  if(!blob) return;
  onlineState.currentPlaybackBlob = new Blob([blob]); // Make sure it's a blob
  const url = URL.createObjectURL(onlineState.currentPlaybackBlob);
  playbackAudio.src = url;
  if (typeof playbackAudio.setSinkId === 'function' && state.deviceIdOut !== 'default') {
    playbackAudio.setSinkId(state.deviceIdOut).catch(e => console.warn(e));
  }
  playbackAudio.play().catch(e=>console.error(e));
  onlineEls.playbackWaveform.classList.add('playing');
}

playbackAudio.onpause = () => onlineEls.playbackWaveform.classList.remove('playing');
playbackAudio.onended = () => onlineEls.playbackWaveform.classList.remove('playing');

function renderPlayback(room, players){
  const targetUid = room.playerOrder[room.playbackCursor];
  const player = players[targetUid];
  const sound = state.sounds[room.soundIndex];
  
  onlineEls.playbackPlayerName.textContent = player ? player.name : "—";
  onlineEls.playbackOriginalName.textContent = sound ? sound.label : "—";
  
  onlineEls.playbackActions.hidden = !onlineState.isHost;
  onlineEls.playbackWaitText.hidden = onlineState.isHost;
  
  showScreen('playback');
}

onlineEls.playbackReplayOriginalBtn.addEventListener('click', () => {
  if(!onlineState.isHost) return;
  onlineAudio.currentTime = 0;
  onlineAudio.play();
});

onlineEls.playbackReplayImitationBtn.addEventListener('click', () => {
  if(!onlineState.isHost) return;
  broadcastPlaybackBlob();
});

onlineEls.playbackNextBtn.addEventListener('click', () => {
  if(!onlineState.isHost) return;
  playbackAudio.pause();
  const room = onlineState.roomState;
  if (room.playbackCursor + 1 < room.playerOrder.length) {
    updateRoomState({ playbackCursor: room.playbackCursor + 1 });
    broadcastPlaybackBlob();
  } else {
    updateRoomState({
      status: 'voting',
      timerEndsAt: Date.now() + 15000,
      votes: {}
    });
  }
});

/* ---------------- VOTING ---------------- */
function renderVoting(room, players){
  onlineState.votedThisRound = !!room.votes[onlineState.uid];
  onlineEls.voteConfirmText.hidden = !onlineState.votedThisRound;
  
  onlineEls.votingGrid.innerHTML = '';
  room.playerOrder.forEach(uid => {
    if(uid === onlineState.uid) return; // Cant vote for self
    
    const btn = document.createElement('button');
    btn.className = 'btn btn-secondary';
    btn.style.width = '200px';
    btn.textContent = players[uid].name;
    btn.disabled = onlineState.votedThisRound;
    
    if (room.votes[onlineState.uid] === uid) btn.classList.add('btn-success');

    btn.onclick = () => {
      sendAction({ name: 'vote', targetUid: uid });
    };
    onlineEls.votingGrid.appendChild(btn);
  });

  clearInterval(onlineState.timerInterval);
  const tick = () => {
    const left = Math.max(0, Math.round((room.timerEndsAt - Date.now())/1000));
    onlineEls.votingTimerValue.textContent = left;
    if(left <= 0) {
      clearInterval(onlineState.timerInterval);
      if(onlineState.isHost && room.status === 'voting') tallyVotesAndGoToResults();
    }
  };
  tick();
  onlineState.timerInterval = setInterval(tick, 1000);

  showScreen('voting');
}

function tallyVotesAndGoToResults() {
  if(!onlineState.isHost) return;
  const room = onlineState.roomState;
  const newPlayers = JSON.parse(JSON.stringify(room.players));
  
  Object.values(room.votes).forEach(targetUid => {
    if(newPlayers[targetUid]) newPlayers[targetUid].score += 1;
  });

  updateRoomState({
    status: 'round_results',
    players: newPlayers
  });
}

/* ---------------- ROUND RESULTS ---------------- */
function renderRoundResults(room, players){
  const sound = state.sounds[room.soundIndex];
  onlineEls.roundResultSoundName.textContent = sound ? sound.label : "—";
  
  // Tally votes received this round
  const votesReceived = {};
  Object.values(room.votes || {}).forEach(uid => {
    votesReceived[uid] = (votesReceived[uid] || 0) + 1;
  });

  onlineEls.roundResultList.innerHTML = '';
  room.playerOrder.forEach(uid => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${players[uid].name}</span> <span>+${votesReceived[uid] || 0} pts</span>`;
    onlineEls.roundResultList.appendChild(li);
  });

  onlineEls.nextRoundBtn.hidden = !onlineState.isHost;
  onlineEls.roundResultWaitText.hidden = onlineState.isHost;

  renderScorebar(room);
  showScreen('round-results');
}

onlineEls.nextRoundBtn.addEventListener('click', () => {
  if(!onlineState.isHost) return;
  const room = onlineState.roomState;
  updateRoomState({
    status: 'host_choose',
    round: room.round + 1,
    soundIndex: null,
    votes: {},
    playbackCursor: -1
  });
});

/* ---------------- FINAL SCORE ---------------- */
// Add an explicit 'End Game' button in host_choose if wanted, or just logic
function renderEnd(room, players){
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
  
  updateRoomState({
    status: 'lobby',
    round: 0,
    players: newPlayers
  });
});

function renderScorebar(room){
  els.scorebar.hidden = false;
  els.scorebar.innerHTML = '';
  (room.playerOrder || []).forEach(uid => {
    const p = room.players[uid];
    if(!p) return;
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.innerHTML = `${p.name} · <b>${p.score || 0}</b>`;
    els.scorebar.appendChild(chip);
  });
}