# app/game.py (Corregido)

import random
from flask import request

class Game:
    def __init__(self, socketio):
        self.socketio = socketio
        self.players = []
        self.game_started = False
        self.turn_index = 0
        self.teams = {}
        self.last_accusation = "No hay acusaciones aún."

    # ... (handle_join, get_players_info, handle_start, notify_turn sin cambios) ...
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
        if not name or not character:
            return {'success': False, 'msg': 'Nombre y personaje no pueden estar vacíos.', 'admin': False, 'game_started': False}
        
        admin = not self.players
        player = {'name': name, 'character': character, 'sid': sid, 'admin': admin, 'team_id': name}
        self.players.append(player)
        self.teams[name] = [name]
        return {'success': True, 'msg': '', 'admin': admin, 'game_started': self.game_started}

    def get_players_info(self):
        return [{'name': p['name'], 'admin': p['admin']} for p in self.players if p['team_id'] == p['name']]

    def handle_start(self):
        if self.game_started:
            return
        self.game_started = True

        def presentation():
            self.socketio.emit('game_started')
            messages = [
                ("3", 1), ("2", 1), ("1", 1), ("YAAA", 1),
                ("Atentos que luego os olvidais campeones", 2)
            ]
            for msg, delay in messages:
                self.socketio.emit('presentation_message', msg)
                self.socketio.sleep(delay)

            players_copy = self.players[:]
            random.shuffle(players_copy)
            for p in players_copy:
                self.socketio.emit('presentation_message', p['character'])
                self.socketio.sleep(4)

            final_messages = [
                ("Os los repito otra vez", 2),
                ("Que ya se que no os acordais de ninguno", 2),
                ("Borrachos", 2),
                ("", 0)
            ]
            for msg, delay in final_messages:
                self.socketio.emit('presentation_message', msg)
                self.socketio.sleep(delay)

            alive_players = [i for i, p in enumerate(self.players) if p['team_id'] == p['name']]
            self.turn_index = random.choice(alive_players) if alive_players else 0
            self.notify_turn()

        self.socketio.start_background_task(presentation)
            
    def notify_turn(self):
        current_player = self.players[self.turn_index]['name']
        self.socketio.emit('turn_info', {'current': current_player, 'last_accusation': self.last_accusation})

    def handle_accusation(self, data):
        accuser_name = data.get('accuser')
        accused_name = data.get('accused')
        guess = data.get('character', '').strip()

        if not all([accuser_name, accused_name, guess]) or not self.game_started:
            return

        accuser_index = self.find_player_index(accuser_name)
        if accuser_index != self.turn_index:
            return

        accused_player = self.find_player(accused_name)
        if not accused_player or self.is_player_caught(accused_name):
            return

        accusation_text = f"{accuser_name} acusa a {accused_name} de ser {guess}."
        self.socketio.emit('last_accusation_update', {'text': f"{accusation_text}\ny es...."})
        
        def reveal_result():
            self.socketio.sleep(2)
            correct = guess.lower() == accused_player['character'].lower()
            result_text = "CORRECTO" if correct else "falso"
            
            self.last_accusation = f"{accusation_text}\ny es....\n{result_text}"
            self.socketio.emit('last_accusation_update', {'text': self.last_accusation})

            if correct:
                leader_player = self.find_player(self.players[accuser_index]['team_id'])
                leader_name = leader_player['name']
                self.teams[leader_name].append(accused_name)
                accused_player['team_id'] = leader_name
                
                # **CAMBIO**: Se añade el personaje del líder a la información del equipo
                team_info = {
                    'members': self.teams[leader_name],
                    'leader_character': leader_player['character']
                }

                self.socketio.emit('private_message', {
                    'sender': 'Sistema',
                    'msg': f"Has sido descubierto! Tu personaje era: {accused_player['character']}"
                }, room=accused_player['sid'])
                
                for p_name in self.teams[leader_name]:
                    player = self.find_player(p_name)
                    if player:
                        self.socketio.emit('update_team', team_info, room=player['sid'])
                
                self.turn_index = self.find_player_index(accused_name)
                self.notify_turn()
            else:
                self.next_turn()

        self.socketio.start_background_task(reveal_result)

    # ... (resto de funciones sin cambios) ...
    def next_turn(self):
        alive_players_indices = [i for i, p in enumerate(self.players) if not self.is_player_caught(p['name'])]
        if len(alive_players_indices) <= 1:
            self.socketio.emit('general_message', {'sender': 'Sistema', 'msg': 'Game over!'})
            return
        
        try:
            current_player_list_index = alive_players_indices.index(self.turn_index)
            next_player_list_index = (current_player_list_index + 1) % len(alive_players_indices)
            self.turn_index = alive_players_indices[next_player_list_index]
        except ValueError:
            # Si el jugador actual ya no está vivo (caso raro), se elige uno al azar
            self.turn_index = random.choice(alive_players_indices)

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
            self.socketio.emit('general_message', {'sender': sender, 'msg': msg})

    def handle_private_message(self, data):
        msg = data.get('msg', '').strip()
        sender_name = next((p['name'] for p in self.players if p['sid'] == request.sid), None)
        if msg and sender_name:
            sender = self.find_player(sender_name)
            leader_name = sender['team_id']
            members = self.teams.get(leader_name, [])
            for member_name in members:
                member = self.find_player(member_name)
                if member:
                    self.socketio.emit('private_message', {
                        'sender': f"{sender_name} (grupo)",
                        'msg': msg
                    }, room=member['sid'])