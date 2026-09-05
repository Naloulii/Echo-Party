/* ------------------------------------------------------------------
   Écho Party — logique du jeu
   Le dossier "son/" du dépôt est lu dynamiquement via l'API GitHub,
   donc n'importe quel fichier audio ajouté à ce dossier devient
   automatiquement jouable, sans toucher au code.
------------------------------------------------------------------- */

const els = {
  topbarInfo: document.getElementById('topbarInfo'),
  roundLabel: document.getElementById('roundLabel'),
  soundsLeftLabel: document.getElementById('soundsLeftLabel'),

  screens: {
    loading: document.getElementById('screen-loading'),
    empty: document.getElementById('screen-empty'),
    mode: document.getElementById('screen-mode'),
    setup: document.getElementById('screen-setup'),
    intro: document.getElementById('screen-intro'),
    listen: document.getElementById('screen-listen'),
    act: document.getElementById('screen-act'),
    reveal: document.getElementById('screen-reveal'),
    end: document.getElementById('screen-end'),
    'online-home': document.getElementById('screen-online-home'),
    'online-lobby': document.getElementById('screen-online-lobby'),
    'online-intro': document.getElementById('screen-online-intro'),
    'online-listen': document.getElementById('screen-online-listen'),
    'online-act': document.getElementById('screen-online-act'),
    'online-reveal': document.getElementById('screen-online-reveal'),
    'online-end': document.getElementById('screen-online-end'),
  },

  modeLocalBtn: document.getElementById('modeLocalBtn'),
  modeOnlineBtn: document.getElementById('modeOnlineBtn'),
  soundCountLabel: document.getElementById('soundCountLabel'),

  loadingDetail: document.getElementById('loadingDetail'),
  emptyDetail: document.getElementById('emptyDetail'),
  localFolderInput: document.getElementById('localFolderInput'),
  retryBtn: document.getElementById('retryBtn'),

  playerForm: document.getElementById('playerForm'),
  playerNameInput: document.getElementById('playerNameInput'),
  playerList: document.getElementById('playerList'),
  durationSelect: document.getElementById('durationSelect'),
  startGameBtn: document.getElementById('startGameBtn'),

  introPlayerName: document.getElementById('introPlayerName'),
  introPlayerName2: document.getElementById('introPlayerName2'),
  readyBtn: document.getElementById('readyBtn'),

  playSoundBtn: document.getElementById('playSoundBtn'),
  waveform: document.getElementById('waveform'),
  startActingBtn: document.getElementById('startActingBtn'),

  actPlayerName: document.getElementById('actPlayerName'),
  timerRing: document.getElementById('timerRing'),
  timerValue: document.getElementById('timerValue'),
  guessedBtn: document.getElementById('guessedBtn'),
  timeUpBtn: document.getElementById('timeUpBtn'),

  revealTitle: document.getElementById('revealTitle'),
  replaySoundBtn: document.getElementById('replaySoundBtn'),
  pointsGrid: document.getElementById('pointsGrid'),
  nextRoundBtn: document.getElementById('nextRoundBtn'),

  finalScoreboard: document.getElementById('finalScoreboard'),
  restartBtn: document.getElementById('restartBtn'),

  scorebar: document.getElementById('scorebar'),
};

const AUDIO_EXT = /\.(mp3|wav|ogg|m4a|webm|aac)$/i;

const state = {
  sounds: [],        // { name, url, label }
  remaining: [],      // indices restants à piocher
  players: [],        // { name, score }
  round: 0,
  mimeIndex: 0,
  currentSound: null,
  durationSec: 45,
  timer: null,
  timeLeft: 45,
  audio: new Audio(),
};

function showScreen(name){
  Object.entries(els.screens).forEach(([key, node]) => {
    node.hidden = key !== name;
  });
}

function humanizeFilename(filename){
  const base = filename.replace(AUDIO_EXT, '');
  const spaced = base.replace(/[-_]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/* ---------------- Détection du dépôt + chargement des sons ---------------- */

function guessRepoInfo(){
  const host = location.hostname; // ex: pseudo.github.io
  const owner = host.split('.')[0];
  const pathParts = location.pathname.split('/').filter(Boolean);
  const repo = pathParts.length > 0 ? pathParts[0] : `${owner}.github.io`;
  return { owner, repo };
}

async function fetchSoundsFromGitHub(){
  const { owner, repo } = guessRepoInfo();
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/son`;
  els.loadingDetail.textContent = `Lecture de ${owner}/${repo}/son…`;

  const res = await fetch(apiUrl, { headers: { 'Accept': 'application/vnd.github+json' } });
  if(!res.ok){
    throw new Error(`API GitHub indisponible (${res.status})`);
  }
  const data = await res.json();
  if(!Array.isArray(data)){
    throw new Error('Le dossier "son" est introuvable dans ce dépôt.');
  }
  return data
    .filter(f => f.type === 'file' && AUDIO_EXT.test(f.name))
    .map(f => ({ name: f.name, url: f.download_url, label: humanizeFilename(f.name) }));
}

function loadSoundsFromLocalFiles(fileList){
  const files = Array.from(fileList).filter(f => AUDIO_EXT.test(f.name));
  return files.map(f => ({
    name: f.name,
    url: URL.createObjectURL(f),
    label: humanizeFilename(f.name),
  }));
}

async function initSounds(){
  showScreen('loading');
  try{
    const sounds = await fetchSoundsFromGitHub();
    if(sounds.length === 0){
      els.emptyDetail.innerHTML = `Le dossier <code>son/</code> existe mais ne contient encore aucun fichier audio compatible (.mp3, .wav, .ogg, .m4a). Ajoute des sons puis republie la page.`;
      showScreen('empty');
      return;
    }
    state.sounds = sounds.sort((a, b) => a.name.localeCompare(b.name));
    els.soundCountLabel.textContent = `${state.sounds.length} son${state.sounds.length > 1 ? 's' : ''}`;
    showScreen('mode');
  }catch(err){
    console.warn(err);
    els.emptyDetail.textContent = "Impossible de lire le dossier \"son\" via l'API GitHub (ça n'a pas fonctionné, en local par exemple). Ajoute tes fichiers dans le dépôt puis publie-le avec GitHub Pages — ou teste avec un dossier local ci-dessous.";
    showScreen('empty');
  }
}

els.retryBtn.addEventListener('click', initSounds);

els.localFolderInput.addEventListener('change', (e) => {
  const sounds = loadSoundsFromLocalFiles(e.target.files);
  if(sounds.length === 0){
    els.emptyDetail.textContent = "Aucun fichier audio compatible trouvé dans ce dossier.";
    return;
  }
  state.sounds = sounds.sort((a, b) => a.name.localeCompare(b.name));
  els.soundCountLabel.textContent = `${state.sounds.length} son${state.sounds.length > 1 ? 's' : ''}`;
  showScreen('mode');
});

els.modeLocalBtn.addEventListener('click', () => showScreen('setup'));

/* ---------------------------- Configuration ---------------------------- */

function renderPlayerList(){
  els.playerList.innerHTML = '';
  state.players.forEach((p, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${p.name}</span>`;
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '✕';
    removeBtn.setAttribute('aria-label', `Retirer ${p.name}`);
    removeBtn.addEventListener('click', () => {
      state.players.splice(i, 1);
      renderPlayerList();
    });
    li.appendChild(removeBtn);
    els.playerList.appendChild(li);
  });
  els.startGameBtn.disabled = state.players.length < 2;
}

els.playerForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = els.playerNameInput.value.trim();
  if(!name) return;
  if(state.players.some(p => p.name.toLowerCase() === name.toLowerCase())) return;
  state.players.push({ name, score: 0 });
  els.playerNameInput.value = '';
  renderPlayerList();
});

els.startGameBtn.addEventListener('click', () => {
  state.durationSec = parseInt(els.durationSelect.value, 10);
  state.remaining = state.sounds.map((_, i) => i);
  shuffle(state.remaining);
  state.round = 0;
  state.mimeIndex = -1;
  els.topbarInfo.hidden = false;
  els.scorebar.hidden = false;
  nextRound();
});

function shuffle(arr){
  for(let i = arr.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/* ------------------------------- Tours de jeu ------------------------------- */

function nextRound(){
  if(state.remaining.length === 0){
    endGame();
    return;
  }
  state.round += 1;
  state.mimeIndex = (state.mimeIndex + 1) % state.players.length;

  const soundIdx = state.remaining.pop();
  state.currentSound = state.sounds[soundIdx];

  els.roundLabel.textContent = `Manche ${state.round}`;
  els.soundsLeftLabel.textContent = `${state.remaining.length} son${state.remaining.length > 1 ? 's' : ''} restant${state.remaining.length > 1 ? 's' : ''}`;
  renderScorebar();

  const mime = state.players[state.mimeIndex];
  els.introPlayerName.textContent = mime.name;
  els.introPlayerName2.textContent = mime.name;
  showScreen('intro');
}

els.readyBtn.addEventListener('click', () => {
  showScreen('listen');
});

els.playSoundBtn.addEventListener('click', () => {
  playCurrentSound();
});

function playCurrentSound(){
  state.audio.pause();
  state.audio.src = state.currentSound.url;
  state.audio.currentTime = 0;
  state.audio.play().catch(() => {});
  els.waveform.classList.add('playing');
}
state.audio.addEventListener('ended', () => {
  els.waveform.classList.remove('playing');
});
state.audio.addEventListener('pause', () => {
  els.waveform.classList.remove('playing');
});

els.startActingBtn.addEventListener('click', () => {
  state.audio.pause();
  startActingScreen();
});

function startActingScreen(){
  const mime = state.players[state.mimeIndex];
  els.actPlayerName.textContent = mime.name;
  state.timeLeft = state.durationSec;
  els.timerValue.textContent = state.timeLeft;
  showScreen('act');

  clearInterval(state.timer);
  state.timer = setInterval(() => {
    state.timeLeft -= 1;
    els.timerValue.textContent = Math.max(state.timeLeft, 0);
    if(state.timeLeft <= 0){
      clearInterval(state.timer);
      goToReveal(false);
    }
  }, 1000);
}

els.guessedBtn.addEventListener('click', () => {
  clearInterval(state.timer);
  goToReveal(true);
});
els.timeUpBtn.addEventListener('click', () => {
  clearInterval(state.timer);
  goToReveal(false);
});

/* -------------------------------- Révélation -------------------------------- */

function goToReveal(wasGuessed){
  els.revealTitle.textContent = state.currentSound.label;
  buildPointsGrid(wasGuessed);
  showScreen('reveal');
}

function buildPointsGrid(prefillGuessedAll){
  els.pointsGrid.innerHTML = '';
  const mime = state.players[state.mimeIndex];

  state.players.forEach((p) => {
    if(p === mime) return; // le mime ne "devine" pas son propre son
    const row = document.createElement('div');
    row.className = 'point-row';
    row.innerHTML = `
      <span class="name">${p.name}</span>
      <label>
        <input type="checkbox" data-player="${p.name}" ${prefillGuessedAll ? 'checked' : ''}>
        a deviné
      </label>
    `;
    els.pointsGrid.appendChild(row);
  });

  const mimeRow = document.createElement('div');
  mimeRow.className = 'point-row';
  mimeRow.innerHTML = `<span class="name is-mime">${mime.name} (mime)</span><span class="muted">+1 si un joueur devine</span>`;
  els.pointsGrid.appendChild(mimeRow);
}

els.replaySoundBtn.addEventListener('click', () => {
  playCurrentSound();
});

els.nextRoundBtn.addEventListener('click', () => {
  applyPoints();
  nextRound();
});

function applyPoints(){
  const checkboxes = els.pointsGrid.querySelectorAll('input[type="checkbox"]');
  let anyoneGuessed = false;
  checkboxes.forEach(cb => {
    if(cb.checked){
      anyoneGuessed = true;
      const player = state.players.find(p => p.name === cb.dataset.player);
      if(player) player.score += 1;
    }
  });
  if(anyoneGuessed){
    state.players[state.mimeIndex].score += 1;
  }
}

/* -------------------------------- Scores -------------------------------- */

function renderScorebar(){
  els.scorebar.innerHTML = '';
  state.players.forEach(p => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.innerHTML = `${p.name} · <b>${p.score}</b>`;
    els.scorebar.appendChild(chip);
  });
}

function endGame(){
  const ranked = [...state.players].sort((a, b) => b.score - a.score);
  els.finalScoreboard.innerHTML = '';
  ranked.forEach(p => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${p.name}</span><span class="score">${p.score} pt${p.score > 1 ? 's' : ''}</span>`;
    els.finalScoreboard.appendChild(li);
  });
  els.topbarInfo.hidden = true;
  els.scorebar.hidden = true;
  showScreen('end');
}

els.restartBtn.addEventListener('click', () => {
  state.players.forEach(p => p.score = 0);
  renderPlayerList();
  showScreen('setup');
});

/* -------------------------------- Démarrage -------------------------------- */

initSounds();
