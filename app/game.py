# app/game.py (Corregido)

import random
from flask import request
# No es necesario importar 'time' si no se usa

class Game:
    def __init__(self, socketio):
        self.socketio = socketio
        self.players = []  # {'name', 'character', 'sid', 'admin', 'team_id'}
        self.game_started = False
        self.turn_index = 0
        self.teams = {}  # key: leader_name, value: list of player names
        self.last_accusation = "No hay acusaciones aún."

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

                players = [p for p in self.players]
                players = random.shuffle(players)
                
                for n in [3, 2, 1]:
                    self.socketio.emit('presentation_message', str(n))
                    self.socketio.sleep(1)
                self.socketio.emit('presentation_message', "YAAA")
                self.socketio.sleep(1)
                self.socketio.emit('presentation_message', "Atentos que luego os olvidais campeones")
                self.socketio.sleep(2)

                tiempo_espera = 3
                for p in players:
                    character = str(p['character']).strip()
                    self.socketio.emit('presentation_message', character)
                    self.socketio.sleep(tiempo_espera)

                self.socketio.emit('presentation_message', "Os los repito otra vez")
                self.socketio.sleep(2)
                self.socketio.emit('presentation_message', "Que ya se que no os acordais de ninguno")
                self.socketio.sleep(3)
                self.socketio.emit('presentation_message', "Borrachos")
                self.socketio.sleep(2)
                self.socketio.emit('presentation_message', "")

                for p in players:
                    character = str(p['character']).strip()
                    self.socketio.emit('presentation_message', character)
                    self.socketio.sleep(tiempo_espera)

                alive_players = [i for i, p in enumerate(self.players) if p['team_id'] == p['name']]
                self.turn_index = random.choice(alive_players) if alive_players else 0

                self.notify_turn()

            self.socketio.start_background_task(presentation)
            
    def notify_turn(self):
        current_player = self.players[self.turn_index]['name']
        self.socketio.emit('turn_info', {'current': current_player, 'last_accusation': self.last_accusation})

    def handle_accusation(self, data):
        accuser = data.get('accuser')
        accused = data.get('accused')
        guess = data.get('character', '').strip()
        if not all([accuser, accused, guess]):
            self.socketio.emit('accusation_result', {'msg': 'Datos inválidos'}, room=self.get_sid(accuser))
            return
        if not self.game_started:
            self.socketio.emit('accusation_result', {'msg': 'El juego no ha comenzado'}, room=self.get_sid(accuser))
            return
        
        accuser_index = self.find_player_index(accuser)
        if accuser_index != self.turn_index:
            self.socketio.emit('accusation_result', {'msg': 'No es tu turno'}, room=self.get_sid(accuser))
            return
        
        accused_player = self.find_player(accused)
        if not accused_player or self.is_player_caught(accused):
            self.socketio.emit('accusation_result', {'msg': 'Jugador inválido o ya adivinado'}, room=self.get_sid(accuser))
            return

        # **CAMBIO**: Se construye el mensaje de acusación
        accusation_text = f"{accuser} acusa a {accused} de ser {guess}."
        self.socketio.emit('last_accusation_update', {'text': accusation_text + "\ny es...."})
        
        def reveal_result():
            self.socketio.sleep(2)
            result_text = ""
            if guess.lower() == accused_player['character'].lower():
                result_text = "CORRECTO"
                leader = self.players[accuser_index]['team_id']
                self.teams[leader].append(accused)
                accused_player['team_id'] = leader
                
                self.socketio.emit('private_message', f"Has sido descubierto! Tu personaje era: {accused_player['character']}", room=accused_player['sid'])
                
                for p_name in self.teams[leader]:
                    player = self.find_player(p_name)
                    if player:
                        self.socketio.emit('update_team', self.teams[leader], room=player['sid'])
                
                self.turn_index = self.find_player_index(accused)
                self.notify_turn()
            else:
                result_text = "falso"
                self.next_turn()

            # **CAMBIO**: Se actualiza la acusación final para todos
            self.last_accusation = f"{accusation_text}\ny es....\n{result_text}"
            self.socketio.emit('last_accusation_update', {'text': self.last_accusation})

        self.socketio.start_background_task(reveal_result)

    def next_turn(self):
        alive_players = [p for p in self.players if not self.is_player_caught(p['name'])]
        if len(alive_players) <= 1:
            self.socketio.emit('general_message', 'Game over!')
            return
        
        current_player_index = self.turn_index
        while True:
            current_player_index = (current_player_index + 1) % len(self.players)
            if not self.is_player_caught(self.players[current_player_index]['name']):
                self.turn_index = current_player_index
                break
        self.notify_turn()

    def is_player_caught(self, name):
        player = self.find_player(name)
        return player['team_id'] != name if player else True

    def find_player(self, name):
        return next((p for p in self.players if p['name'] == name), None)

    def find_player_index(self, name):
        return next((i for i, p in enumerate(self.players) if p['name'] == name), -1)

    def get_sid(self, name):
        p = self.find_player(name)
        return p['sid'] if p else None

    def handle_general_message(self, data):
        msg = data.get('msg', '').strip()
        if msg:
            sender = next((p['name'] for p in self.players if p['sid'] == request.sid), "unknown")
            self.socketio.emit('general_message', f"{sender}: {msg}")

    def handle_private_message(self, data):
        msg = data.get('msg', '').strip()
        sender_name = next((p['name'] for p in self.players if p['sid'] == request.sid), None)
        if msg and sender_name:
            sender = self.find_player(sender_name)
            leader = sender['team_id']
            members = self.teams.get(leader, [])
            for member_name in members:
                member = self.find_player(member_name)
                if member:
                    self.socketio.emit('private_message', f"{sender_name} (grupo): {msg}", room=member['sid'])