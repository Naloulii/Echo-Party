/* ------------------------------------------------------------------
   Écho Party — mode en ligne (code de partie)
   Repose sur PeerJS (P2P) pour synchroniser l'état de la partie.
------------------------------------------------------------------- */

const onlineEls = {
  home: document.getElementById('screen-online-home'),
  error: document.getElementById('onlineSetupError'),

  tabCreate: document.getElementById('tabCreate'),
  tabJoin: document.getElementById('tabJoin'),
  createPane: document.getElementById('createPane'),
  joinPane: document.getElementById('joinPane'),

  createNameInput: document.getElementById('createNameInput'),
  onlineDurationSelect: document.getElementById('onlineDurationSelect'),
  createRoomBtn: document.getElementById('createRoomBtn'),

  joinNameInput: document.getElementById('joinNameInput'),
  joinCodeInput: document.getElementById('joinCodeInput'),
  joinRoomBtn: document.getElementById('joinRoomBtn'),

  roomCodeDisplay: document.getElementById('roomCodeDisplay'),
  lobbyPlayerList: document.getElementById('lobbyPlayerList'),
  onlineStartBtn: document.getElementById('onlineStartBtn'),
  lobbyWaitingText: document.getElementById('lobbyWaitingText'),

  onlineIntroName: document.getElementById('onlineIntroName'),
  onlineIntroSub: document.getElementById('onlineIntroSub'),

  onlinePlaySoundBtn: document.getElementById('onlinePlaySoundBtn'),
  onlineWaveform: document.getElementById('onlineWaveform'),
  onlineStartActingBtn: document.getElementById('onlineStartActingBtn'),

  onlineActEyebrow: document.getElementById('onlineActEyebrow'),
  onlineActPlayerName: document.getElementById('onlineActPlayerName'),
  onlineTimerValue: document.getElementById('onlineTimerValue'),
  onlineActAsMime: document.getElementById('onlineActAsMime'),
  onlineActAsGuesser: document.getElementById('onlineActAsGuesser'),
  onlineEndActingBtn: document.getElementById('onlineEndActingBtn'),
  onlineGuessedBtn: document.getElementById('onlineGuessedBtn'),
  onlineGuessedConfirm: document.getElementById('onlineGuessedConfirm'),

  onlineRevealTitle: document.getElementById('onlineRevealTitle'),
  onlineReplaySoundBtn: document.getElementById('onlineReplaySoundBtn'),
  onlineGuesserList: document.getElementById('onlineGuesserList'),
  onlineNextRoundBtn: document.getElementById('onlineNextRoundBtn'),
  onlineRevealWaitingText: document.getElementById('onlineRevealWaitingText'),

  onlineFinalScoreboard: document.getElementById('onlineFinalScoreboard'),
  onlineRestartBtn: document.getElementById('onlineRestartBtn'),
  onlineEndWaitingText: document.getElementById('onlineEndWaitingText'),
};

const onlineAudio = new Audio();

const onlineState = {
  uid: null,
  code: null,
  isHost: false,
  lastStatus: null,
  timerInterval: null,
  guessedThisRound: false,
  peer: null,
  hostConn: null, // used by client
  clientConns: {}, // used by host, maps uid to connection
  roomState: null, // used by host (master) and client (replica)
};

function getOrCreateUid(){
  let uid = sessionStorage.getItem('echoparty_uid');
  if(!uid){
    uid = (crypto.randomUUID ? crypto.randomUUID() : `p-${Date.now()}-${Math.random().toString(16).slice(2)}`);
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

/* --------------------------- Mode / navigation --------------------------- */

els.modeOnlineBtn.addEventListener('click', () => {
  onlineEls.error.hidden = true;
  showScreen('online-home');
});

onlineEls.tabCreate.addEventListener('click', () => switchOnlineTab('create'));
onlineEls.tabJoin.addEventListener('click', () => switchOnlineTab('join'));

function switchOnlineTab(which){
  const isCreate = which === 'create';
  onlineEls.tabCreate.classList.toggle('active', isCreate);
  onlineEls.tabJoin.classList.toggle('active', !isCreate);
  onlineEls.createPane.hidden = !isCreate;
  onlineEls.joinPane.hidden = isCreate;
}

/* --------------------------- Créer / rejoindre --------------------------- */

onlineEls.createRoomBtn.addEventListener('click', () => {
  const name = onlineEls.createNameInput.value.trim();
  if(!name){ showOnlineError('Entre ton prénom.'); return; }
  if(state.sounds.length === 0){ showOnlineError('Aucun son disponible.'); return; }

  onlineEls.createRoomBtn.disabled = true;
  const uid = getOrCreateUid();
  const code = randomRoomCode();
  const peerId = 'echoparty-host-' + code;

  onlineState.peer = new Peer(peerId);
  
  onlineState.peer.on('open', (id) => {
    onlineState.uid = uid;
    onlineState.code = code;
    onlineState.isHost = true;
    onlineState.roomState = {
      hostId: uid,
      createdAt: Date.now(),
      durationSec: parseInt(onlineEls.onlineDurationSelect.value, 10),
      status: 'lobby',
      players: { [uid]: { name, score: 0 } },
      playerOrder: [uid],
      order: [],
      cursor: -1,
      mimeId: null,
      timerEndsAt: null,
      guesses: {},
    };
    broadcastState();
    onlineEls.createRoomBtn.disabled = false;
  });

  onlineState.peer.on('connection', (conn) => {
    conn.on('data', (data) => {
      if(data.type === 'join'){
        onlineState.clientConns[data.uid] = conn;
        onlineState.roomState.players[data.uid] = { name: data.name, score: 0 };
        if(!onlineState.roomState.playerOrder.includes(data.uid)){
          onlineState.roomState.playerOrder.push(data.uid);
        }
        broadcastState();
      } else if (data.type === 'action') {
        handleClientAction(data.uid, data.action);
      }
    });
    conn.on('close', () => {
      // Optional: remove player on disconnect
    });
  });

  onlineState.peer.on('error', (err) => {
    console.error(err);
    if(err.type === 'unavailable-id') {
      showOnlineError("Le code est déjà utilisé, réessaie.");
    } else {
      showOnlineError("Erreur de connexion P2P.");
    }
    onlineEls.createRoomBtn.disabled = false;
  });
});

onlineEls.joinRoomBtn.addEventListener('click', () => {
  const name = onlineEls.joinNameInput.value.trim();
  const code = onlineEls.joinCodeInput.value.trim().toUpperCase();
  if(!name){ showOnlineError('Entre ton prénom.'); return; }
  if(!code){ showOnlineError('Entre le code de la partie.'); return; }

  onlineEls.joinRoomBtn.disabled = true;
  const uid = getOrCreateUid();
  
  onlineState.peer = new Peer();
  
  onlineState.peer.on('open', (id) => {
    const hostPeerId = 'echoparty-host-' + code;
    onlineState.hostConn = onlineState.peer.connect(hostPeerId, { reliable: true });

    onlineState.hostConn.on('open', () => {
      onlineState.uid = uid;
      onlineState.code = code;
      onlineState.isHost = false;
      onlineState.hostConn.send({ type: 'join', uid, name });
      onlineEls.joinRoomBtn.disabled = false;
    });

    onlineState.hostConn.on('data', (data) => {
      if(data.type === 'state') {
        renderRoom(data.state);
      }
    });

    onlineState.hostConn.on('close', () => {
      showOnlineError('Connexion avec l\'hôte perdue.');
    });
  });
  
  onlineState.peer.on('error', (err) => {
    console.error(err);
    showOnlineError("Impossible de rejoindre la partie. Vérifie le code.");
    onlineEls.joinRoomBtn.disabled = false;
  });
});

/* ------------------------------ Synchronisation (Hôte) ------------------------------ */

function broadcastState() {
  if(!onlineState.isHost) return;
  const stateCopy = JSON.parse(JSON.stringify(onlineState.roomState));
  Object.values(onlineState.clientConns).forEach(conn => {
    if(conn.open) {
      conn.send({ type: 'state', state: stateCopy });
    }
  });
  renderRoom(onlineState.roomState);
}

function updateRoomState(updates) {
  if(!onlineState.isHost) return;
  Object.assign(onlineState.roomState, updates);
  broadcastState();
}

function handleClientAction(uid, actionData) {
  if(!onlineState.isHost) return;
  const room = onlineState.roomState;
  
  if (actionData.name === 'start_acting') {
    if (room.mimeId === uid && room.status === 'listen') {
      updateRoomState({
        status: 'act',
        timerEndsAt: Date.now() + room.durationSec * 1000,
        guesses: {},
      });
    }
  } else if (actionData.name === 'guess') {
    if (room.status === 'act' && !room.guesses[uid] && room.mimeId !== uid) {
      room.guesses[uid] = true;
      broadcastState();
    }
  } else if (actionData.name === 'end_acting') {
    if (room.status === 'act') {
      updateRoomState({ status: 'reveal' });
    }
  } else if (actionData.name === 'listen') {
    if (room.status === 'intro' && room.mimeId === uid) {
      updateRoomState({ status: 'listen' });
    }
  }
}

function sendAction(actionData) {
  if (onlineState.isHost) {
    handleClientAction(onlineState.uid, actionData);
  } else {
    if (onlineState.hostConn && onlineState.hostConn.open) {
      onlineState.hostConn.send({ type: 'action', uid: onlineState.uid, action: actionData });
    }
  }
}

/* ------------------------------ Rendu ------------------------------ */

function renderRoom(room){
  onlineState.roomState = room;
  const players = room.players || {};
  const playerOrder = room.playerOrder || Object.keys(players);
  onlineState.isHost = room.hostId === onlineState.uid;

  switch(room.status){
    case 'lobby':
      renderLobby(room, players, playerOrder);
      showScreen('online-lobby');
      break;
    case 'intro':
      clearInterval(onlineState.timerInterval);
      renderIntro(room, players);
      break;
    case 'listen':
      renderListen(room, players);
      break;
    case 'act':
      renderAct(room, players);
      break;
    case 'reveal':
      clearInterval(onlineState.timerInterval);
      renderReveal(room, players, playerOrder);
      break;
    case 'end':
      clearInterval(onlineState.timerInterval);
      renderEnd(room, players);
      break;
  }
  onlineState.lastStatus = room.status;
}

function renderLobby(room, players, playerOrder){
  onlineEls.roomCodeDisplay.textContent = onlineState.code;
  onlineEls.lobbyPlayerList.innerHTML = '';
  playerOrder.forEach(uid => {
    const p = players[uid];
    if(!p) return;
    const li = document.createElement('li');
    li.textContent = p.name + (uid === room.hostId ? ' (hôte)' : '');
    onlineEls.lobbyPlayerList.appendChild(li);
  });
  const canStart = onlineState.isHost && playerOrder.length >= 2 && state.sounds.length > 0;
  onlineEls.onlineStartBtn.hidden = !onlineState.isHost;
  onlineEls.onlineStartBtn.disabled = !canStart;
  onlineEls.lobbyWaitingText.hidden = onlineState.isHost;
}

onlineEls.onlineStartBtn.addEventListener('click', () => {
  if (!onlineState.isHost) return;
  const room = onlineState.roomState;
  const playerOrder = room.playerOrder || [];
  const order = state.sounds.map((_, i) => i);
  shuffle(order);
  updateRoomState({
    order,
    cursor: 0,
    mimeId: playerOrder[0],
    status: 'intro',
    guesses: {},
  });
});

function currentSoundFor(room){
  const idx = room.order[room.cursor];
  return state.sounds[idx];
}

function renderIntro(room, players){
  const mime = players[room.mimeId];
  const isMime = room.mimeId === onlineState.uid;
  els.roundLabel.textContent = `Manche ${room.cursor + 1}`;
  els.topbarInfo.hidden = false;
  els.soundsLeftLabel.textContent = `${room.order.length - room.cursor} son${room.order.length - room.cursor > 1 ? 's' : ''} restant${room.order.length - room.cursor > 1 ? 's' : ''}`;
  renderOnlineScorebar(room, players);

  if(isMime){
    showScreen('online-listen');
    onlineState.guessedThisRound = false;
    onlineEls.onlineGuessedConfirm.hidden = true;
    onlineEls.onlineGuessedBtn.disabled = false;
    
    if(room.status === 'intro'){
      sendAction({ name: 'listen' });
    }
  }else{
    onlineEls.onlineIntroName.textContent = mime ? mime.name : '—';
    onlineEls.onlineIntroSub.textContent = 'met son casque et écoute le son en privé…';
    showScreen('online-intro');
  }
}

function renderListen(room, players){
  const isMime = room.mimeId === onlineState.uid;
  if(isMime){
    showScreen('online-listen');
  }else{
    const mime = players[room.mimeId];
    onlineEls.onlineIntroName.textContent = mime ? mime.name : '—';
    onlineEls.onlineIntroSub.textContent = 'écoute le son au casque, en privé…';
    showScreen('online-intro');
  }
}

onlineEls.onlinePlaySoundBtn.addEventListener('click', () => {
  if (onlineState.roomState) {
    playOnlineSound(currentSoundFor(onlineState.roomState));
  }
});

function playOnlineSound(sound){
  onlineAudio.pause();
  onlineAudio.src = sound.url;
  onlineAudio.currentTime = 0;
  onlineAudio.play().catch(() => {});
  onlineEls.onlineWaveform.classList.add('playing');
}
onlineAudio.addEventListener('ended', () => onlineEls.onlineWaveform.classList.remove('playing'));
onlineAudio.addEventListener('pause', () => onlineEls.onlineWaveform.classList.remove('playing'));

onlineEls.onlineStartActingBtn.addEventListener('click', () => {
  onlineAudio.pause();
  sendAction({ name: 'start_acting' });
});

function renderAct(room, players){
  const isMime = room.mimeId === onlineState.uid;
  const mime = players[room.mimeId];
  onlineEls.onlineActPlayerName.textContent = mime ? mime.name : '—';
  onlineEls.onlineActEyebrow.textContent = isMime ? 'À toi de mimer !' : 'Ça mime, devine à voix haute !';
  onlineEls.onlineActAsMime.hidden = !isMime;
  onlineEls.onlineActAsGuesser.hidden = isMime;

  if(!isMime){
    const alreadyGuessed = !!(room.guesses && room.guesses[onlineState.uid]);
    onlineState.guessedThisRound = alreadyGuessed;
    onlineEls.onlineGuessedBtn.disabled = alreadyGuessed;
    onlineEls.onlineGuessedConfirm.hidden = !alreadyGuessed;
  }

  showScreen('online-act');

  clearInterval(onlineState.timerInterval);
  const tick = () => {
    const remaining = Math.max(0, Math.round((room.timerEndsAt - Date.now()) / 1000));
    onlineEls.onlineTimerValue.textContent = remaining;
    if(remaining <= 0){
      clearInterval(onlineState.timerInterval);
      if(isMime && onlineState.isHost) {
        updateRoomState({ status: 'reveal' });
      } else if (isMime) {
        sendAction({ name: 'end_acting' });
      }
    }
  };
  tick();
  onlineState.timerInterval = setInterval(tick, 250);
}

onlineEls.onlineGuessedBtn.addEventListener('click', () => {
  if(onlineState.guessedThisRound) return;
  onlineState.guessedThisRound = true;
  onlineEls.onlineGuessedBtn.disabled = true;
  onlineEls.onlineGuessedConfirm.hidden = false;
  sendAction({ name: 'guess' });
});

onlineEls.onlineEndActingBtn.addEventListener('click', () => {
  sendAction({ name: 'end_acting' });
});

function renderReveal(room, players){
  const sound = currentSoundFor(room);
  onlineEls.onlineRevealTitle.textContent = sound.label;
  onlineEls.onlineGuesserList.innerHTML = '';
  const guesses = room.guesses || {};
  const guesserIds = Object.keys(guesses).filter(uid => guesses[uid]);
  if(guesserIds.length === 0){
    const li = document.createElement('li');
    li.textContent = 'Personne cette fois-ci';
    onlineEls.onlineGuesserList.appendChild(li);
  }else{
    guesserIds.forEach(uid => {
      const p = players[uid];
      if(!p) return;
      const li = document.createElement('li');
      li.textContent = p.name;
      onlineEls.onlineGuesserList.appendChild(li);
    });
  }
  onlineEls.onlineNextRoundBtn.hidden = !onlineState.isHost;
  onlineEls.onlineRevealWaitingText.hidden = onlineState.isHost;
  showScreen('online-reveal');
}

onlineEls.onlineReplaySoundBtn.addEventListener('click', () => {
  if(onlineState.roomState){
    playOnlineSound(currentSoundFor(onlineState.roomState));
  }
});

onlineEls.onlineNextRoundBtn.addEventListener('click', () => {
  if (!onlineState.isHost) return;
  const room = onlineState.roomState;
  const players = room.players || {};
  const playerOrder = room.playerOrder || Object.keys(players);
  const guesses = room.guesses || {};

  const updates = {};
  let anyoneGuessed = false;
  
  const newPlayers = JSON.parse(JSON.stringify(players));

  Object.keys(guesses).forEach(uid => {
    if(guesses[uid] && newPlayers[uid]){
      anyoneGuessed = true;
      newPlayers[uid].score = (newPlayers[uid].score || 0) + 1;
    }
  });
  if(anyoneGuessed && newPlayers[room.mimeId]){
    newPlayers[room.mimeId].score = (newPlayers[room.mimeId].score || 0) + 1;
  }
  
  updates.players = newPlayers;

  const nextCursor = room.cursor + 1;
  if(nextCursor >= room.order.length){
    updates.status = 'end';
  }else{
    const mimePos = playerOrder.indexOf(room.mimeId);
    const nextMimeId = playerOrder[(mimePos + 1) % playerOrder.length];
    updates.cursor = nextCursor;
    updates.mimeId = nextMimeId;
    updates.status = 'intro';
    updates.guesses = {};
  }
  updateRoomState(updates);
});

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
  const players = room.players || {};
  const newPlayers = JSON.parse(JSON.stringify(players));
  Object.keys(newPlayers).forEach(uid => { newPlayers[uid].score = 0; });
  
  updateRoomState({
    status: 'lobby',
    order: [],
    cursor: -1,
    mimeId: null,
    timerEndsAt: null,
    guesses: {},
    players: newPlayers
  });
});

function renderOnlineScorebar(room, players){
  els.scorebar.hidden = false;
  els.scorebar.innerHTML = '';
  (room.playerOrder || Object.keys(players)).forEach(uid => {
    const p = players[uid];
    if(!p) return;
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.innerHTML = `${p.name} · <b>${p.score || 0}</b>`;
    els.scorebar.appendChild(chip);
  });
}