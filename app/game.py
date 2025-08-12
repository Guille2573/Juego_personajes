# app.py (no cambios necesarios para chat privado)

# game.py (modificado handle_accusation para enviar mensaje privado al acusado y arreglar manejo equipo)

import random
from flask import request
import time

class Game:
    def __init__(self, socketio):
        self.socketio = socketio
        self.players = []  # {'name', 'character', 'sid', 'admin', 'team_id'}
        self.game_started = False
        self.turn_index = 0
        self.teams = {}  # key: leader_name, value: list of player names
        self.last_accusation = None

    def handle_join(self, data, sid):
        name = data.get('name', '').strip()
        character = data.get('character', '').strip()
        if self.game_started:
            return {'success': False, 'msg': 'El juego ya ha comenzado, no puedes unirte.', 'admin': False, 'game_started': True}
        if len(self.players) >= 10:
            return {'success': False, 'msg': 'Máximo 10 jugadores permitidos.', 'admin': False, 'game_started': False}
        if any(p['name'] == name for p in self.players):
            return {'success': False, 'msg': 'Nombre ya está en uso.', 'admin': False, 'game_started': False}
        if any(p['character'] == character for p in self.players):
            return {'success': False, 'msg': 'Personaje ya está en uso.', 'admin': False, 'game_started': False}
        if len(name) == 0 or len(character) == 0:
            return {'success': False, 'msg': 'Nombre y personaje no pueden estar vacíos.', 'admin': False, 'game_started': False}
        admin = (len(self.players) == 0)
        player = {'name': name, 'character': character, 'sid': sid, 'admin': admin, 'team_id': name}
        self.players.append(player)
        self.teams[name] = [name]
        return {'success': True, 'msg': '', 'admin': admin, 'game_started': self.game_started}

    def get_players_info(self):
        # Solo jugadores que no han sido adivinados (siguen en juego)
        return [
            {'name': p['name'], 'admin': p['admin']}
            for p in self.players
            if p['team_id'] == p['name']
        ]

    def handle_start(self):
        if not self.game_started:
            self.game_started = True

            def presentation():
                self.socketio.emit('game_started')
                
                # Contador 3, 2, 1, YAAA, mensaje extra
                for n in [3, 2, 1]:
                    self.socketio.emit('presentation_message', str(n))
                    time.sleep(1)
                self.socketio.emit('presentation_message', "YAAA")
                time.sleep(1)
                self.socketio.emit('presentation_message', "Atentos que luego os olvidais campeones")
                time.sleep(2)

                # Mostrar personajes uno a uno de forma aleatoria
                players = [p for p in self.players]
                random.shuffle(players)
                for p in players:
                    name = str(p['name']).strip()
                    character = str(p['character']).strip()
                    self.socketio.emit('presentation_message', f"{name}: {character}")
                    time.sleep(4)

                # Mensajes finales
                self.socketio.emit('presentation_message', "Os los repito otra vez")
                time.sleep(2)
                self.socketio.emit('presentation_message', "Que ya se que no os acordais de ninguno")
                time.sleep(2)
                self.socketio.emit('presentation_message', "Borrachos")
                time.sleep(2)
                self.socketio.emit('presentation_message', "")  # Borra el mensaje

                # Elegir aleatoriamente el primer jugador vivo
                alive_players = [i for i, p in enumerate(self.players) if p['team_id'] == p['name']]
                if alive_players:
                    self.turn_index = random.choice(alive_players)
                else:
                    self.turn_index = 0

                self.notify_turn()

            self.socketio.start_background_task(presentation)
            

    def notify_turn(self):
        current_player = self.players[self.turn_index]['name']
        self.socketio.emit('turn_info', {'current': current_player})

    def handle_accusation(self, data):
        accuser = data.get('accuser')
        accused = data.get('accused')
        guess = data.get('character', '').strip()
        if not accuser or not accused or not guess:
            self.socketio.emit('accusation_result', {'msg': 'Datos inválidos'}, room=self.get_sid(accuser))
            return
        if self.game_started is False:
            self.socketio.emit('accusation_result', {'msg': 'El juego no ha comenzado'}, room=self.get_sid(accuser))
            return
        accuser_index = self.find_player_index(accuser)
        if accuser_index != self.turn_index:
            self.socketio.emit('accusation_result', {'msg': 'No es tu turno'}, room=self.get_sid(accuser))
            return
        accused_player = self.find_player(accused)
        if not accused_player:
            self.socketio.emit('accusation_result', {'msg': 'Jugador acusado no existe'}, room=self.get_sid(accuser))
            return
        if self.is_player_caught(accused):
            self.socketio.emit('accusation_result', {'msg': 'Jugador ya fue adivinado'}, room=self.get_sid(accuser))
            return

        msg = f"{accuser} acusa a {accused} de ser {guess}."
        self.last_accusation = msg
        self.socketio.emit('general_message', msg)
        self.socketio.emit('general_message', "y es....")

        def reveal_result():
            time.sleep(2)
            if guess.lower() == accused_player['character'].lower():
                self.socketio.emit('general_message', "CORRECTO")
                # Añadir acusado al equipo del líder
                leader = self.players[accuser_index]['team_id']
                self.teams[leader].append(accused)
                accused_player['team_id'] = leader

                # Enviar mensaje privado al acusado con el personaje correcto (notificarle)
                self.socketio.emit('private_message', f"Has sido descubierto! Tu personaje era: {accused_player['character']}", room=accused_player['sid'])

                # Actualizar equipos para todos miembros de ese equipo
                for p in self.players:
                    if p['name'] in self.teams[leader]:
                        self.socketio.emit('update_team', self.teams[leader], room=p['sid'])

                # Cambiar el turno al acusado
                self.turn_index = self.find_player_index(accused)
                self.notify_turn()
            else:
                self.socketio.emit('general_message', "falso")
                self.next_turn()

        self.socketio.start_background_task(reveal_result)

    def next_turn(self):
        alive_players = [p for p in self.players if not self.is_player_caught(p['name'])]
        if len(alive_players) <= 1:
            self.socketio.emit('general_message', 'Game over!')
            return
        self.turn_index = (self.turn_index + 1) % len(self.players)
        while self.is_player_caught(self.players[self.turn_index]['name']):
            self.turn_index = (self.turn_index + 1) % len(self.players)
        self.notify_turn()

    def is_player_caught(self, name):
        player = self.find_player(name)
        return player['team_id'] != name

    def find_player(self, name):
        for p in self.players:
            if p['name'] == name:
                return p
        return None

    def find_player_index(self, name):
        for i, p in enumerate(self.players):
            if p['name'] == name:
                return i
        return -1

    def get_sid(self, name):
        p = self.find_player(name)
        return p['sid'] if p else None

    def handle_general_message(self, data):
        msg = data.get('msg', '').strip()
        if msg:
            sender = next((p['name'] for p in self.players if p['sid'] == request.sid), "unknown")
            full_msg = f"{sender}: {msg}"
            self.socketio.emit('general_message', full_msg)

    def handle_private_message(self, data):
        msg = data.get('msg', '').strip()
        sender = next((p['name'] for p in self.players if p['sid'] == request.sid), "unknown")
        if msg and sender:
            leader = self.find_player(sender)['team_id']
            members = self.teams.get(leader, [])
            full_msg = f"{sender} (grupo): {msg}"
            for p in self.players:
                if p['name'] in members:
                    self.socketio.emit('private_message', full_msg, room=p['sid'])
