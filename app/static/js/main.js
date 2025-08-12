// main.js reorganizado

// ------------------------
// 1. CONEXIÓN SOCKET.IO
// ------------------------
const socket = io();

// ------------------------
// 2. ESTADO DEL JUEGO Y VARIABLES GLOBALES
// ------------------------
let playersList = [];
let myName = null;
let myTeam = [];
let currentTurn = null;
let lastAccusation = null;
let isAdmin = false;
let gameStarted = false;

let unreadGeneral = 0;
let unreadPrivate = 0;
let currentTab = 'general';
let windowFocused = true;
let muted = false;

const colorMap = {};
const colors = [
  "#e6194b", "#3cb44b", "#ffe119", "#4363d8", "#f58231",
  "#911eb4", "#46f0f0", "#f032e6", "#bcf60c", "#fabebe"
];

// ------------------------
// 3. ELEMENTOS DEL DOM
// ------------------------
const joinSection = document.getElementById('join-section');
const joinForm = document.getElementById('join-form');
const playersListJoin = document.getElementById('players-list-join');
const inputName = document.getElementById('input-name');
const inputCharacter = document.getElementById('input-character');
const btnJoin = document.getElementById('btn-join');
const joinMsg = document.getElementById('join-message');

const mainWrapper = document.getElementById('main-wrapper');
const tabs = {
  general: document.getElementById('tab-general'),
  chatGeneral: document.getElementById('tab-chat-general'),
  chatPrivate: document.getElementById('tab-chat-private'),
};
const screens = {
  general: document.getElementById('screen-general'),
  chatGeneral: document.getElementById('screen-chat-general'),
  chatPrivate: document.getElementById('screen-chat-private'),
};
const badgeGeneral = document.getElementById('badge-general');
const badgePrivate = document.getElementById('badge-private');

const messageTurnDiv = document.getElementById('message-turn');
const lastAccusationDiv = document.getElementById('last-accusation');
const accuseArea = document.getElementById('accuse-area');
const accusedSelect = document.getElementById('accused-select');
const guessCharInput = document.getElementById('guess-character');
const btnAccuse = document.getElementById('btn-accuse');
const startGameBtn = document.getElementById('start-game-btn');
const muteBtn = document.getElementById('mute-btn');

const generalChatDiv = document.getElementById('general-chat');
const generalMsgInput = document.getElementById('general-msg');
const btnSendGeneral = document.getElementById('btn-send-general');

const privateChatDiv = document.getElementById('private-chat');
const privateMsgInput = document.getElementById('private-msg');
const btnSendPrivate = document.getElementById('btn-send-private');

const playersDiv = document.getElementById('players');
const groupPlayersDiv = document.getElementById('group-players');

const turnSound = document.getElementById('turn-sound');

// ------------------------
// 4. MANEJADORES DE EVENTOS DE SOCKET.IO
// ------------------------
socket.on('join_response', data => {
  if (data.success) {
    myName = inputName.value.trim();
    isAdmin = data.admin;
    gameStarted = data.game_started;

    joinMsg.textContent = "";
    joinSection.style.display = 'none';
    mainWrapper.style.display = 'flex';

    startGameBtn.style.display = (isAdmin && !gameStarted) ? 'inline-block' : 'none';
  } else {
    joinMsg.textContent = "Error: " + data.msg;
  }
});

socket.on('players_update', players => {
  playersList = players;
  updatePlayersList(playersList);
  updatePlayersListJoin(playersList);
  updateAccusedDropdown();
  updateGroupPlayers();

  if (gameStarted) {
    startGameBtn.style.display = 'none';
  }
});

socket.on('game_started', () => {
  gameStarted = true;
  startGameBtn.style.display = 'none';
});

socket.on('turn_info', data => {
  currentTurn = data.current;
  messageTurnDiv.textContent = "";
  lastAccusationDiv.textContent = lastAccusation || "No hay acusaciones aún.";
  btnAccuse.disabled = true;
  accuseArea.style.display = "none";

  if (currentTurn === myName) {
    switchTab('general');
    messageTurnDiv.textContent = "Te toca puto";
    if (!muted) turnSound.play();
    btnAccuse.disabled = false;
    accuseArea.style.display = "block";
  } else {
    messageTurnDiv.textContent = `Turno de: ${currentTurn}`;
  }
});

socket.on('update_team', team => {
  myTeam = team;
  updateGroupPlayers();
});

socket.on('accusation_result', data => {
  alert(data.msg);
});

socket.on('general_message', msg => {
  const p = document.createElement('p');
  p.textContent = msg;
  generalChatDiv.appendChild(p);
  generalChatDiv.scrollTop = generalChatDiv.scrollHeight;

  if (/.* accused .* of being .*/.test(msg)) {
    lastAccusation = msg;
    lastAccusationDiv.textContent = lastAccusation;
  }

  if (!windowFocused || currentTab !== 'chatGeneral') {
    unreadGeneral++;
    updateBadges();
  }
});

socket.on('private_message', msg => {
  const p = document.createElement('p');
  p.textContent = msg;
  privateChatDiv.appendChild(p);
  privateChatDiv.scrollTop = privateChatDiv.scrollHeight;
  if (!windowFocused || currentTab !== 'chatPrivate') {
    unreadPrivate++;
    updateBadges();
  }
});

socket.on('presentation_message', msg => {
  const div = document.getElementById('presentation-message');
  if (div) div.textContent = msg || '';
});


// ------------------------
// 5. LISTENERS DE EVENTOS DE LA UI (BOTONES, INPUTS, ETC.)
// ------------------------

// --- Sección de Unirse (Join) ---
btnJoin.onclick = () => {
  const name = inputName.value.trim();
  const character = inputCharacter.value.trim();
  if (!name || !character) {
    joinMsg.textContent = "Por favor introduce nombre y personaje.";
    return;
  }
  socket.emit('join_game', { name, character });
};
inputName.addEventListener('keydown', e => { if (e.key === 'Enter') btnJoin.click(); });
inputCharacter.addEventListener('keydown', e => { if (e.key === 'Enter') btnJoin.click(); });

// --- Controles Generales del Juego ---
startGameBtn.onclick = () => {
  socket.emit('start_game');
  accuseArea.style.display = "none";
};

muteBtn.onclick = () => {
  muted = !muted;
  muteBtn.textContent = muted ? "Unmute" : "Mute";
};

// --- Pestañas de Navegación ---
tabs.general.onclick = () => switchTab('general');
tabs.chatGeneral.onclick = () => switchTab('chatGeneral');
tabs.chatPrivate.onclick = () => switchTab('chatPrivate');

// --- Área de Acusación ---
btnAccuse.onclick = () => {
  const accused = accusedSelect.value;
  const guess = guessCharInput.value.trim();
  if (!accused || !guess) {
    alert('Selecciona jugador y escribe personaje');
    return;
  }
  socket.emit('make_accusation', { accused, character: guess, accuser: myName });
  guessCharInput.value = '';
};
guessCharInput.addEventListener('keydown', e => { if (e.key === 'Enter') btnAccuse.click(); });

// --- Chat General ---
btnSendGeneral.onclick = () => {
  const msg = generalMsgInput.value.trim();
  if (msg) {
    socket.emit('send_general_message', { msg });
    generalMsgInput.value = '';
  }
};
generalMsgInput.addEventListener('keydown', e => { if (e.key === 'Enter') btnSendGeneral.click(); });

// --- Chat Privado ---
btnSendPrivate.onclick = () => {
  const msg = privateMsgInput.value.trim();
  if (msg) {
    socket.emit('send_private_message', { msg });
    privateMsgInput.value = '';
  }
};
privateMsgInput.addEventListener('keydown', e => { if (e.key === 'Enter') btnSendPrivate.click(); });


// --- Eventos de la Ventana (Window) ---
window.addEventListener('focus', () => {
  windowFocused = true;
  unreadGeneral = 0;
  unreadPrivate = 0;
  updateBadges();
});

window.addEventListener('blur', () => {
  windowFocused = false;
});

// ------------------------
// 6. FUNCIONES AUXILIARES
// ------------------------

/**
 * Cambia la pestaña activa en la interfaz.
 * @param {string} tab - El nombre de la pestaña a activar ('general', 'chatGeneral', 'chatPrivate').
 */
function switchTab(tab) {
  for (const key in screens) {
    screens[key].classList.toggle('active', key === tab);
    tabs[key].classList.toggle('active', key === tab);
  }
  currentTab = tab;
  if (tab === 'chatGeneral') unreadGeneral = 0;
  if (tab === 'chatPrivate') unreadPrivate = 0;
  updateBadges();
}

/**
 * Actualiza los contadores de mensajes no leídos en las pestañas.
 */
function updateBadges() {
  badgeGeneral.style.display = unreadGeneral > 0 ? 'inline-block' : 'none';
  badgeGeneral.textContent = unreadGeneral;
  badgePrivate.style.display = unreadPrivate > 0 ? 'inline-block' : 'none';
  badgePrivate.textContent = unreadPrivate;
}

/**
 * Actualiza la lista de jugadores en la pantalla principal del juego.
 * @param {Array} players - La lista de jugadores.
 */
function updatePlayersList(players) {
  const ul = document.getElementById('players-list');
  if (!ul) return;
  ul.innerHTML = '';
  players.forEach(p => {
    const li = document.createElement('li');
    li.textContent = p.name;
    li.classList.add('player-box');
    li.style.backgroundColor = getColorForPlayer(p.name);
    if (p.admin) li.classList.add('player-admin');
    if (p.name === myName) li.classList.add('player-self');
    ul.appendChild(li);
  });
}

/**
 * Actualiza la lista de jugadores en la pantalla de unirse.
 * @param {Array} players - La lista de jugadores.
 */
function updatePlayersListJoin(players) {
  const ul = document.getElementById('players-list-join');
  if (!ul) return;
  ul.innerHTML = '';
  players.forEach(p => {
    const li = document.createElement('li');
    li.textContent = p.name;
    li.classList.add('player-box');
    li.style.backgroundColor = getColorForPlayer(p.name);
    if (p.admin) li.classList.add('player-admin');
    ul.appendChild(li);
  });
}

/**
 * Actualiza la lista de miembros de tu equipo.
 */
function updateGroupPlayers() {
  const teamDiv = document.getElementById('team-list');
  if (!teamDiv) return;
  if (!myTeam || myTeam.length === 0) {
    teamDiv.innerHTML = '<h4>Tu equipo</h4><ul style="list-style:none;padding:0;"><li style="font-weight:bold;color:gold;">&#9733; ' + myName + ' (Líder)</li></ul>';
    return;
  }
  const leader = myTeam[0];
  let html = '<h4>Tu equipo</h4><ul style="list-style:none;padding:0;">';
  myTeam.forEach(name => {
    if (name === leader) {
      html += `<li style="font-weight:bold;color:gold;">&#9733; ${name} (Líder)</li>`;
    } else if (name === myName) {
      html += `<li style="font-weight:bold;">${name} (Tú)</li>`;
    } else {
      html += `<li>${name}</li>`;
    }
  });
  html += '</ul>';
  teamDiv.innerHTML = html;
}

/**
 * Actualiza el menú desplegable para acusar a un jugador.
 */
function updateAccusedDropdown() {
  if (!accusedSelect) return;
  accusedSelect.innerHTML = '';
  // Excluir al propio jugador y a los de tu grupo
  playersList
    .filter(p => p.name !== myName && (!myTeam || !myTeam.includes(p.name)))
    .forEach(p => {
      const option = document.createElement('option');
      option.value = p.name;
      option.textContent = p.name;
      accusedSelect.appendChild(option);
    });
}

/**
 * Obtiene un color único para cada jugador.
 * @param {string} name - El nombre del jugador.
 * @returns {string} - Un color en formato hexadecimal.
 */
function getColorForPlayer(name) {
  if (!colorMap[name]) {
    const takenColors = Object.values(colorMap);
    const availableColors = colors.filter(c => !takenColors.includes(c));
    colorMap[name] = availableColors.length > 0 ? availableColors[0] : "#000";
  }
  return colorMap[name];
}