// app/static/js/main.js (Corregido)

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
  startGameBtn.style.display = (isAdmin && !gameStarted) ? 'inline-block' : 'none';
});

socket.on('game_started', () => {
  gameStarted = true;
  startGameBtn.style.display = 'none';
});

socket.on('turn_info', data => {
  currentTurn = data.current;
  lastAccusationDiv.textContent = data.last_accusation;
  accuseArea.style.display = "none";
  btnAccuse.disabled = true;

  if (currentTurn === myName) {
    switchTab('general');
    messageTurnDiv.textContent = "¡Es tu turno!";
    // **CAMBIO**: Funcionalidad de mute corregida
    if (!muted) {
      turnSound.play();
    }
    accuseArea.style.display = "block";
    btnAccuse.disabled = false;
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

// **CAMBIO**: Nuevo listener para la última acusación
socket.on('last_accusation_update', data => {
    lastAccusationDiv.innerText = data.text; // Usamos innerText para preservar los saltos de línea
});

socket.on('general_message', msg => {
  const p = document.createElement('p');
  p.textContent = msg;
  generalChatDiv.appendChild(p);
  generalChatDiv.scrollTop = generalChatDiv.scrollHeight;

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
// 5. LISTENERS DE EVENTOS DE LA UI
// ------------------------
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

startGameBtn.onclick = () => {
  socket.emit('start_game');
};

muteBtn.onclick = () => {
  muted = !muted;
  muteBtn.textContent = muted ? "Unmute" : "Mute";
};

tabs.general.onclick = () => switchTab('general');
tabs.chatGeneral.onclick = () => switchTab('chatGeneral');
tabs.chatPrivate.onclick = () => switchTab('chatPrivate');

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

btnSendGeneral.onclick = () => {
  const msg = generalMsgInput.value.trim();
  if (msg) {
    socket.emit('send_general_message', { msg });
    generalMsgInput.value = '';
  }
};
generalMsgInput.addEventListener('keydown', e => { if (e.key === 'Enter') btnSendGeneral.click(); });

btnSendPrivate.onclick = () => {
  const msg = privateMsgInput.value.trim();
  if (msg) {
    socket.emit('send_private_message', { msg });
    privateMsgInput.value = '';
  }
};
privateMsgInput.addEventListener('keydown', e => { if (e.key === 'Enter') btnSendPrivate.click(); });

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

function updateBadges() {
  badgeGeneral.style.display = unreadGeneral > 0 ? 'inline-block' : 'none';
  badgeGeneral.textContent = unreadGeneral;
  badgePrivate.style.display = unreadPrivate > 0 ? 'inline-block' : 'none';
  badgePrivate.textContent = unreadPrivate;
}

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

function updateGroupPlayers() {
  const teamDiv = document.getElementById('team-list');
  if (!teamDiv) return;
  
  // **CAMBIO**: Se limpia el contenido anterior y no se añade un h4
  teamDiv.innerHTML = '';
  
  if (!myTeam || myTeam.length === 0) {
    const defaultItem = document.createElement('li');
    defaultItem.style.fontWeight = 'bold';
    defaultItem.style.color = 'gold';
    defaultItem.innerHTML = '&#9733; ' + myName + ' (Líder)';
    teamDiv.appendChild(defaultItem);
    return;
  }
  const leader = myTeam[0];
  myTeam.forEach(name => {
    const li = document.createElement('li');
    if (name === leader) {
      li.style.fontWeight = 'bold';
      li.style.color = 'gold';
      li.innerHTML = `&#9733; ${name} (Líder)`;
    } else if (name === myName) {
      li.style.fontWeight = 'bold';
      li.textContent = `${name} (Tú)`;
    } else {
      li.textContent = name;
    }
    teamDiv.appendChild(li);
  });
}

function updateAccusedDropdown() {
  if (!accusedSelect) return;
  accusedSelect.innerHTML = '';
  playersList
    .filter(p => p.name !== myName && (!myTeam || !myTeam.includes(p.name)))
    .forEach(p => {
      const option = document.createElement('option');
      option.value = p.name;
      option.textContent = p.name;
      accusedSelect.appendChild(option);
    });
}

function getColorForPlayer(name) {
  if (!colorMap[name]) {
    const takenColors = Object.values(colorMap);
    const availableColors = colors.filter(c => !takenColors.includes(c));
    colorMap[name] = availableColors.length > 0 ? availableColors[0] : "#000";
  }
  return colorMap[name];
}