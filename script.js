/* ------------------------------------------------------------------
   Écho Party — Logique globale et Configuration Audio
------------------------------------------------------------------- */

const els = {
  topbarInfo: document.getElementById('topbarInfo'),
  roundLabel: document.getElementById('roundLabel'),
  soundsLeftLabel: document.getElementById('soundsLeftLabel'),

  screens: {
    loading: document.getElementById('screen-loading'),
    empty: document.getElementById('screen-empty'),
    'audio-setup': document.getElementById('screen-audio-setup'),
    'online-home': document.getElementById('screen-online-home'),
    'online-lobby': document.getElementById('screen-online-lobby'),
    'host-choose': document.getElementById('screen-host-choose'),
    'recording': document.getElementById('screen-recording'),
    'playback': document.getElementById('screen-playback'),
    'voting': document.getElementById('screen-voting'),
    'round-results': document.getElementById('screen-round-results'),
    'online-end': document.getElementById('screen-online-end'),
  },

  loadingDetail: document.getElementById('loadingDetail'),
  emptyDetail: document.getElementById('emptyDetail'),
  localFolderInput: document.getElementById('localFolderInput'),
  retryBtn: document.getElementById('retryBtn'),
  soundCountLabel: document.getElementById('soundCountLabel'),
  
  // Audio Setup
  audioInputSelect: document.getElementById('audioInputSelect'),
  audioOutputSelect: document.getElementById('audioOutputSelect'),
  micMeterFill: document.getElementById('micMeterFill'),
  testMicBtn: document.getElementById('testMicBtn'),
  testMicStatus: document.getElementById('testMicStatus'),
  confirmAudioBtn: document.getElementById('confirmAudioBtn'),

  scorebar: document.getElementById('scorebar'),
};

const AUDIO_EXT = /\.(mp3|wav|ogg|m4a|webm|aac)$/i;

const state = {
  sounds: [],        // { name, url, label }
  deviceIdIn: 'default',
  deviceIdOut: 'default',
  audioContext: null,
  analyser: null,
  testStream: null,
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
  const host = location.hostname;
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
      els.emptyDetail.innerHTML = `Le dossier <code>son/</code> existe mais ne contient encore aucun fichier audio compatible (.mp3, .wav, .ogg, .m4a).`;
      showScreen('empty');
      return;
    }
    state.sounds = sounds.sort((a, b) => a.name.localeCompare(b.name));
    els.soundCountLabel.textContent = `${state.sounds.length} son${state.sounds.length > 1 ? 's' : ''}`;
    startAudioSetup();
  }catch(err){
    console.warn(err);
    els.emptyDetail.textContent = "Impossible de lire le dossier \"son\" via l'API GitHub. Ajoute tes fichiers puis publie, ou choisis un dossier local.";
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
  startAudioSetup();
});

/* ---------------- Configuration Audio ---------------- */

async function startAudioSetup() {
  showScreen('audio-setup');
  try {
    // Demander permission d'abord pour avoir les vrais noms de devices
    await navigator.mediaDevices.getUserMedia({ audio: true });
    
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter(d => d.kind === 'audioinput');
    const audioOutputs = devices.filter(d => d.kind === 'audiooutput');

    els.audioInputSelect.innerHTML = '';
    audioInputs.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || `Microphone ${els.audioInputSelect.length + 1}`;
      els.audioInputSelect.appendChild(opt);
    });

    els.audioOutputSelect.innerHTML = '';
    if(audioOutputs.length > 0){
      audioOutputs.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        opt.textContent = d.label || `Haut-parleur ${els.audioOutputSelect.length + 1}`;
        els.audioOutputSelect.appendChild(opt);
      });
    } else {
      els.audioOutputSelect.innerHTML = '<option value="default">Par défaut</option>';
    }

    startMicVisualizer(els.audioInputSelect.value);

  } catch(err) {
    console.error("Erreur accès micro :", err);
    alert("Le jeu nécessite l'accès au microphone pour imiter les sons.");
  }
}

els.audioInputSelect.addEventListener('change', () => {
  state.deviceIdIn = els.audioInputSelect.value;
  startMicVisualizer(state.deviceIdIn);
});

els.audioOutputSelect.addEventListener('change', () => {
  state.deviceIdOut = els.audioOutputSelect.value;
});

async function startMicVisualizer(deviceId) {
  if (state.testStream) {
    state.testStream.getTracks().forEach(t => t.stop());
  }
  if (state.audioContext) {
    state.audioContext.close();
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: { exact: deviceId } }
    });
    state.testStream = stream;
    
    state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = state.audioContext.createMediaStreamSource(stream);
    state.analyser = state.audioContext.createAnalyser();
    state.analyser.fftSize = 256;
    source.connect(state.analyser);
    
    const dataArray = new Uint8Array(state.analyser.frequencyBinCount);
    
    function drawLoop() {
      if(!state.analyser) return;
      requestAnimationFrame(drawLoop);
      state.analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for(let i=0; i<dataArray.length; i++){ sum += dataArray[i]; }
      const average = sum / dataArray.length;
      els.micMeterFill.style.width = `${Math.min(100, (average / 128) * 100)}%`;
    }
    drawLoop();

  } catch(err) {
    console.error("Erreur visualiseur:", err);
  }
}

let testAudioElem = null;

els.testMicBtn.addEventListener('click', async () => {
  if (testAudioElem) {
    // Stop test
    testAudioElem.pause();
    testAudioElem.srcObject = null;
    testAudioElem = null;
    els.testMicBtn.textContent = "M'entendre (Test)";
    els.testMicStatus.hidden = true;
  } else {
    // Start test
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: state.deviceIdIn } }
      });
      testAudioElem = new Audio();
      testAudioElem.srcObject = stream;
      if (typeof testAudioElem.setSinkId === 'function') {
        await testAudioElem.setSinkId(state.deviceIdOut);
      }
      testAudioElem.play();
      els.testMicBtn.textContent = "Arrêter le test";
      els.testMicStatus.hidden = false;
    } catch(err) {
      console.error(err);
      alert("Erreur lors du test audio.");
    }
  }
});

els.confirmAudioBtn.addEventListener('click', () => {
  if (testAudioElem) {
    testAudioElem.pause();
    testAudioElem = null;
  }
  if (state.testStream) {
    state.testStream.getTracks().forEach(t => t.stop());
    state.testStream = null;
  }
  if (state.audioContext) {
    state.audioContext.close();
    state.audioContext = null;
    state.analyser = null;
  }
  showScreen('online-home');
});

/* ---------------- Démarrage ---------------- */

initSounds();
