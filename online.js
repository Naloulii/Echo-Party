/* ------------------------------------------------------------------
   Écho Party — mode en ligne (code de partie)
   Repose sur Firebase Realtime Database pour synchroniser l'état de
   la partie entre tous les téléphones connectés au même salon.
   Voir firebase-config.js pour brancher ta propre base.
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
  roomRef: null,
  isHost: false,
  lastStatus: null,
  timerInterval: null,
  guessedThisRound: false,
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
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sans I/O pour éviter la confusion
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
  if(typeof firebaseReady === 'undefined' || !firebaseReady){
    showOnlineError("Le mode en ligne n'est pas encore configuré sur ce site : il manque les clés Firebase dans firebase-config.js (voir le README).");
  }else{
    onlineEls.error.hidden = true;
  }
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

onlineEls.createRoomBtn.addEventListener('click', async () => {
  const name = onlineEls.createNameInput.value.trim();
  if(!name){ showOnlineError('Entre ton prénom.'); return; }
  if(!firebaseReady){ showOnlineError('Firebase n\'est pas configuré (voir README).'); return; }
  if(state.sounds.length === 0){ showOnlineError('Aucun son disponible.'); return; }

  onlineEls.createRoomBtn.disabled = true;
  const uid = getOrCreateUid();
  const code = randomRoomCode();
  const db = firebase.database();

  try{
    await db.ref(`rooms/${code}`).set({
      hostId: uid,
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      durationSec: parseInt(onlineEls.onlineDurationSelect.value, 10),
      status: 'lobby',
      players: { [uid]: { name, score: 0 } },
      playerOrder: [uid],
      order: [],
      cursor: -1,
      mimeId: null,
      timerEndsAt: null,
      guesses: {},
    });
    onlineState.uid = uid;
    onlineState.code = code;
    onlineState.isHost = true;
    subscribeToRoom(code);
  }catch(err){
    console.error(err);
    showOnlineError("Impossible de créer la partie. Vérifie ta configuration Firebase (règles de la base, clés).");
  }finally{
    onlineEls.createRoomBtn.disabled = false;
  }
});

onlineEls.joinRoomBtn.addEventListener('click', async () => {
  const name = onlineEls.joinNameInput.value.trim();
  const code = onlineEls.joinCodeInput.value.trim().toUpperCase();
  if(!name){ showOnlineError('Entre ton prénom.'); return; }
  if(!code){ showOnlineError('Entre le code de la partie.'); return; }
  if(!firebaseReady){ showOnlineError('Firebase n\'est pas configuré (voir README).'); return; }

  onlineEls.joinRoomBtn.disabled = true;
  const db = firebase.database();

  try{
    const snap = await db.ref(`rooms/${code}`).once('value');
    if(!snap.exists()){
      showOnlineError('Aucune partie avec ce code. Vérifie-le auprès de l\'hôte.');
      return;
    }
    const room = snap.val();
    if(room.status !== 'lobby'){
      showOnlineError('Cette partie a déjà commencé.');
      return;
    }
    const uid = getOrCreateUid();
    const updates = {};
    updates[`rooms/${code}/players/${uid}`] = { name, score: 0 };
    const order = room.playerOrder || [];
    if(!order.includes(uid)) order.push(uid);
    updates[`rooms/${code}/playerOrder`] = order;
    await db.ref().update(updates);

    onlineState.uid = uid;
    onlineState.code = code;
    onlineState.isHost = room.hostId === uid;
    subscribeToRoom(code);
  }catch(err){
    console.error(err);
    showOnlineError("Impossible de rejoindre la partie. Vérifie ta connexion et le code.");
  }finally{
    onlineEls.joinRoomBtn.disabled = false;
  }
});

/* ------------------------------ Synchronisation ------------------------------ */

function subscribeToRoom(code){
  const db = firebase.database();
  onlineState.roomRef = db.ref(`rooms/${code}`);
  onlineState.roomRef.on('value', (snap) => {
    const room = snap.val();
    if(!room) return;
    renderRoom(room);
  });
}

function renderRoom(room){
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

onlineEls.onlineStartBtn.addEventListener('click', async () => {
  const snap = await onlineState.roomRef.once('value');
  const room = snap.val();
  const playerOrder = room.playerOrder || [];
  const order = state.sounds.map((_, i) => i);
  shuffle(order);
  await onlineState.roomRef.update({
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
    // passe automatiquement le statut à "listen" pour que les autres le sachent
    if(room.status === 'intro'){
      onlineState.roomRef.update({ status: 'listen' });
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
  onlineState.roomRef.once('value').then(snap => {
    const room = snap.val();
    playOnlineSound(currentSoundFor(room));
  });
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

onlineEls.onlineStartActingBtn.addEventListener('click', async () => {
  onlineAudio.pause();
  const snap = await onlineState.roomRef.once('value');
  const room = snap.val();
  await onlineState.roomRef.update({
    status: 'act',
    timerEndsAt: Date.now() + room.durationSec * 1000,
    guesses: {},
  });
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
      if(isMime) endActingRound(room);
    }
  };
  tick();
  onlineState.timerInterval = setInterval(tick, 250);
}

onlineEls.onlineGuessedBtn.addEventListener('click', async () => {
  if(onlineState.guessedThisRound) return;
  onlineState.guessedThisRound = true;
  onlineEls.onlineGuessedBtn.disabled = true;
  onlineEls.onlineGuessedConfirm.hidden = false;
  await onlineState.roomRef.child(`guesses/${onlineState.uid}`).set(true);
});

onlineEls.onlineEndActingBtn.addEventListener('click', async () => {
  const snap = await onlineState.roomRef.once('value');
  endActingRound(snap.val());
});

async function endActingRound(room){
  if(room.status !== 'act') return;
  await onlineState.roomRef.update({ status: 'reveal' });
}

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
  onlineState.roomRef.once('value').then(snap => playOnlineSound(currentSoundFor(snap.val())));
});

onlineEls.onlineNextRoundBtn.addEventListener('click', async () => {
  const snap = await onlineState.roomRef.once('value');
  const room = snap.val();
  const players = room.players || {};
  const playerOrder = room.playerOrder || Object.keys(players);
  const guesses = room.guesses || {};

  const updates = {};
  let anyoneGuessed = false;
  Object.keys(guesses).forEach(uid => {
    if(guesses[uid] && players[uid]){
      anyoneGuessed = true;
      updates[`players/${uid}/score`] = (players[uid].score || 0) + 1;
    }
  });
  if(anyoneGuessed && players[room.mimeId]){
    updates[`players/${room.mimeId}/score`] = (players[room.mimeId].score || 0) + 1;
  }

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
  await onlineState.roomRef.update(updates);
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

onlineEls.onlineRestartBtn.addEventListener('click', async () => {
  const snap = await onlineState.roomRef.once('value');
  const room = snap.val();
  const players = room.players || {};
  const updates = { status: 'lobby', order: [], cursor: -1, mimeId: null, timerEndsAt: null, guesses: {} };
  Object.keys(players).forEach(uid => { updates[`players/${uid}/score`] = 0; });
  await onlineState.roomRef.update(updates);
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
