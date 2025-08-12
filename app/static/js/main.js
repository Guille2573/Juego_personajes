// app/static/js/main.js (Corregido)

const socket = io();

// ESTADO DEL JUEGO
let playersList = [];
let myName = null;
let myTeam = [];
// ... (resto de variables sin cambios) ...
let currentTurn = null;
let isAdmin = false;
let gameStarted = false;
let unreadGeneral = 0;
let unreadPrivate = 0;
let currentTab = 'general';
let windowFocused = true;
let muted = false;

const colorMap = {};
const colors = ["#e6194b", "#3cb44b", "#ffe119", "#4363d8", "#f58231", "#911eb4", "#46f0f0", "#f032e6", "#bcf60c", "#fabebe"];


// ELEMENTOS DEL DOM
// ... (sin cambios) ...
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
const pinnedMessageDiv = document.getElementById('pinned-message'); // Nuevo elemento
const privateMsgInput = document.getElementById('private-msg');
const btnSendPrivate = document.getElementById('btn-send-private');
const turnSound = document.getElementById('turn-sound');


// MANEJADORES DE SOCKET.IO
// ... (join_response, players_update, game_started, turn_info sin cambios) ...
socket.on('join_response', data => {
    if (data.success) {
        myName = inputName.value.trim();
        isAdmin = data.admin;
        gameStarted = data.game_started;
        joinSection.style.display = 'none';
        mainWrapper.style.display = 'flex';
        startGameBtn.style.display = (isAdmin && !gameStarted) ? 'inline-block' : 'none';
    } else {
        joinMsg.textContent = "Error: " + data.msg;
    }
});

socket.on('players_update', players => {
    playersList = players;
    updatePlayersList(players);
    updatePlayersListJoin(players);
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
    accuseArea.style.display = 'none';
    btnAccuse.disabled = true;

    if (currentTurn === myName) {
        switchTab('general');
        messageTurnDiv.textContent = "¡Es tu turno!";
        if (!muted) turnSound.play();
        accuseArea.style.display = 'block';
        btnAccuse.disabled = false;
    } else {
        messageTurnDiv.textContent = `Turno de: ${currentTurn}`;
    }
});

// **CAMBIO**: El evento ahora recibe un objeto con 'members' y 'leader_character'
socket.on('update_team', teamInfo => {
    myTeam = teamInfo.members;
    updateGroupPlayers();
    updateAccusedDropdown(); // Actualizar el desplegable al cambiar de equipo
    
    // **CAMBIO**: Lógica para el mensaje fijado
    const leaderName = myTeam[0];
    pinnedMessageDiv.textContent = `El personaje de ${leaderName} es ${teamInfo.leader_character}`;
    pinnedMessageDiv.style.display = 'block';
});

socket.on('accusation_result', data => alert(data.msg));
socket.on('last_accusation_update', data => lastAccusationDiv.innerText = data.text);
socket.on('presentation_message', msg => document.getElementById('presentation-message').textContent = msg || '');

socket.on('general_message', data => {
    addMessageToChat(generalChatDiv, data.sender, data.msg);
    if (!windowFocused || currentTab !== 'chatGeneral') {
        unreadGeneral++;
        updateBadges();
    }
});

socket.on('private_message', data => {
    addMessageToChat(privateChatDiv, data.sender, data.msg);
    if (!windowFocused || currentTab !== 'chatPrivate') {
        unreadPrivate++;
        updateBadges();
    }
});

// ... (Listeners de UI sin cambios) ...
// LISTENERS DE UI
btnJoin.onclick = () => {
    const name = inputName.value.trim();
    const character = inputCharacter.value.trim();
    if (name && character) {
        socket.emit('join_game', { name, character });
    } else {
        joinMsg.textContent = "Por favor introduce nombre y personaje.";
    }
};
inputName.addEventListener('keydown', e => { if (e.key === 'Enter') btnJoin.click(); });
inputCharacter.addEventListener('keydown', e => { if (e.key === 'Enter') btnJoin.click(); });

startGameBtn.onclick = () => socket.emit('start_game');
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
    if (accused && guess) {
        socket.emit('make_accusation', { accused, character: guess, accuser: myName });
        guessCharInput.value = '';
    } else {
        alert('Selecciona jugador y escribe personaje');
    }
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

window.onfocus = () => {
    windowFocused = true;
    if (currentTab === 'chatGeneral') unreadGeneral = 0;
    if (currentTab === 'chatPrivate') unreadPrivate = 0;
    updateBadges();
};
window.onblur = () => windowFocused = false;


// FUNCIONES AUXILIARES
// ... (addMessageToChat, switchTab, updateBadges, updatePlayersList, updatePlayersListJoin sin cambios)...
function addMessageToChat(chatDiv, sender, message) {
    const messageElement = document.createElement('div');
    messageElement.style.marginBottom = "10px";

    const senderElement = document.createElement('strong');
    senderElement.textContent = sender;
    const baseSenderName = sender.split(' ')[0]; 
    senderElement.style.color = getColorForPlayer(baseSenderName);
    senderElement.style.display = "block";

    const messageContent = document.createElement('span');
    messageContent.textContent = message;

    messageElement.appendChild(senderElement);
    messageElement.appendChild(messageContent);
    
    chatDiv.appendChild(messageElement);
    chatDiv.scrollTop = chatDiv.scrollHeight;
}

function switchTab(tab) {
    Object.keys(screens).forEach(key => {
        screens[key].classList.toggle('active', key === tab);
        tabs[key].classList.toggle('active', key === tab);
    });
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
    ul.innerHTML = '';
    players.forEach(p => {
        const li = document.createElement('li');
        li.textContent = p.name;
        li.className = 'player-box';
        li.style.backgroundColor = getColorForPlayer(p.name);
        if (p.admin) li.classList.add('player-admin');
        if (p.name === myName) li.classList.add('player-self');
        ul.appendChild(li);
    });
}

function updatePlayersListJoin(players) {
    const ul = document.getElementById('players-list-join');
    ul.innerHTML = '';
    players.forEach(p => {
        const li = document.createElement('li');
        li.textContent = p.name;
        li.className = 'player-box';
        li.style.backgroundColor = getColorForPlayer(p.name);
        if (p.admin) li.classList.add('player-admin');
        ul.appendChild(li);
    });
}

function updateGroupPlayers() {
    const teamList = document.getElementById('team-list');
    teamList.innerHTML = '';
    const teamToDisplay = (myTeam && myTeam.length > 0) ? myTeam : [myName];
    const leader = teamToDisplay[0];
    
    teamToDisplay.forEach(name => {
        const li = document.createElement('li');
        if (name === leader) {
            li.style.fontWeight = 'bold';
            li.style.color = 'gold';
            // **CAMBIO**: Estrella a la derecha del nombre
            li.innerHTML = `${name} (Líder) &#9733;`;
        } else if (name === myName) {
            li.style.fontWeight = 'bold';
            li.textContent = `${name} (Tú)`;
        } else {
            li.textContent = name;
        }
        teamList.appendChild(li);
    });
}

// **CAMBIO**: La función ahora filtra a los miembros del equipo (`myTeam`)
function updateAccusedDropdown() {
    accusedSelect.innerHTML = '';
    playersList
        .filter(p => p.name !== myName && !myTeam.includes(p.name))
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