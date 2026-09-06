/* ================================================================
   Écho Party — Module Vocal Temps Réel (WebRTC)
   Chaque joueur crée une connexion P2P audio avec chacun des autres.
   Le serveur Socket.io sert uniquement de signaling relay.
   ================================================================ */

const STUN_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]
};

const voicePeers = {}; // uid -> RTCPeerConnection
let voiceStream = null;
let voiceInitialized = false;

/* ── Démarrer la voix quand on entre dans une salle ── */
async function startVoiceChat(myUid, existingUids) {
  if (voiceInitialized) return;
  voiceInitialized = true;

  try {
    voiceStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    console.log('[Voice] Micro voix OK');
  } catch (e) {
    console.warn('[Voice] Micro voix indisponible:', e);
    voiceInitialized = false;
    return;
  }

  // Recevoir les signaux WebRTC
  socket.on('signal', async ({ fromUid, data }) => {
    if (data.type === 'offer') {
      await handleVoiceOffer(fromUid, myUid, data);
    } else if (data.type === 'answer') {
      const pc = voicePeers[fromUid];
      if (pc) await pc.setRemoteDescription(new RTCSessionDescription(data));
    } else if (data.candidate) {
      const pc = voicePeers[fromUid];
      if (pc) {
        try { await pc.addIceCandidate(new RTCIceCandidate(data)); } catch(e){}
      }
    }
  });

  // Créer des connexions avec les joueurs déjà présents
  existingUids.forEach(uid => {
    if (uid !== myUid && myUid < uid) {
      createVoicePeer(uid, myUid, true);
    }
  });
}

/* ── Appelé quand l etat de la salle change (nouveau joueur) ── */
function syncVoicePeers(myUid, room) {
  if (!voiceInitialized || !room || !room.players) return;
  room.playerOrder.forEach(uid => {
    if (uid !== myUid && !voicePeers[uid] && myUid < uid) {
      createVoicePeer(uid, myUid, true);
    }
  });
  Object.keys(voicePeers).forEach(uid => {
    if (!room.players[uid]) closePeer(uid);
  });
}

/* ── Créer une connexion P2P ── */
async function createVoicePeer(remoteUid, myUid, isInitiator) {
  if (voicePeers[remoteUid]) return;
  const pc = new RTCPeerConnection(STUN_SERVERS);
  voicePeers[remoteUid] = pc;

  if (voiceStream) voiceStream.getTracks().forEach(t => pc.addTrack(t, voiceStream));

  pc.ontrack = (e) => {
    let el = document.getElementById('voice-' + remoteUid);
    if (!el) {
      el = document.createElement('audio');
      el.id = 'voice-' + remoteUid;
      el.autoplay = true;
      el.style.display = 'none';
      document.body.appendChild(el);
    }
    el.srcObject = e.streams[0];
  };

  pc.onicecandidate = (e) => {
    if (e.candidate) socket.emit('signal', { toUid: remoteUid, data: e.candidate.toJSON() });
  };

  pc.onconnectionstatechange = () => {
    if (['failed','closed','disconnected'].includes(pc.connectionState)) closePeer(remoteUid);
  };

  if (isInitiator) {
    const offer = await pc.createOffer({ offerToReceiveAudio: true });
    await pc.setLocalDescription(offer);
    socket.emit('signal', { toUid: remoteUid, data: pc.localDescription });
  }
}

/* ── Répondre à une offer entrante ── */
async function handleVoiceOffer(fromUid, myUid, offer) {
  if (voicePeers[fromUid]) return;
  const pc = new RTCPeerConnection(STUN_SERVERS);
  voicePeers[fromUid] = pc;

  if (voiceStream) voiceStream.getTracks().forEach(t => pc.addTrack(t, voiceStream));

  pc.ontrack = (e) => {
    let el = document.getElementById('voice-' + fromUid);
    if (!el) {
      el = document.createElement('audio');
      el.id = 'voice-' + fromUid;
      el.autoplay = true;
      el.style.display = 'none';
      document.body.appendChild(el);
    }
    el.srcObject = e.streams[0];
  };

  pc.onicecandidate = (e) => {
    if (e.candidate) socket.emit('signal', { toUid: fromUid, data: e.candidate.toJSON() });
  };

  pc.onconnectionstatechange = () => {
    if (['failed','closed','disconnected'].includes(pc.connectionState)) closePeer(fromUid);
  };

  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.emit('signal', { toUid: fromUid, data: pc.localDescription });
}

/* ── Fermer un pair ── */
function closePeer(uid) {
  if (voicePeers[uid]) { voicePeers[uid].close(); delete voicePeers[uid]; }
  const el = document.getElementById('voice-' + uid);
  if (el) el.remove();
}

/* ── Mute pendant l'enregistrement du jeu ── */
function muteVoice(muted) {
  if (voiceStream) voiceStream.getAudioTracks().forEach(t => { t.enabled = !muted; });
}

/* ── Tout arrêter (fin de partie) ── */
function stopVoiceChat() {
  Object.keys(voicePeers).forEach(uid => closePeer(uid));
  if (voiceStream) { voiceStream.getTracks().forEach(t => t.stop()); voiceStream = null; }
  voiceInitialized = false;
}
