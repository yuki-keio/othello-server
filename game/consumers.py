import json
import asyncio
import logging
from channels.generic.websocket import AsyncWebsocketConsumer
from urllib.parse import parse_qs
import time

logger = logging.getLogger(__name__)

class OthelloConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        try:
            self.room_name = self.scope['url_route']['kwargs']['room_name']
            self.group_name = f"othello_{self.room_name}"

            # ゲーム状態を保持する辞書を channel_layer に用意
            if not hasattr(self.channel_layer, "game_rooms"):
                self.channel_layer.game_rooms = {}

            # クエリパラメータから player_id を取得
            query_params = parse_qs(self.scope.get("query_string", b"").decode())
            player_id = query_params.get("playerId", [None])[0]
           

            if not player_id:
                await self.send(text_data=json.dumps({"error": "プレイヤーIDが提供されていません"}))
                await self.close()
                return
            
            
            

            if self.group_name not in self.channel_layer.game_rooms:
                
                time_limit = int(query_params.get("timeLimit", [0])[0])
                logger.info(f"time_limit: {time_limit}")
                show_valid_moves = query_params.get("showValidMoves", [False])[0]
                logger.info(f"show_valid_moves: {show_valid_moves}")
                
                logger.info(f"[NEW ROOM] {self.group_name} を作成")
                self.channel_layer.game_rooms[self.group_name] = {
                    "board": [["" for _ in range(8)] for _ in range(8)],
                    "turn": "black",         # 
                    "players": {},
                    "game_over": False,
                    "pass_count": 0,         # 連続パス回数
                    "time_limit": time_limit,  # ターンごとの持ち時間（秒）
                    "turn_start_time": asyncio.get_event_loop().time(),
                    "game_started": False,
                    "last_active": time.time(),
                    "show_valid_moves": show_valid_moves


                }
                board = self.channel_layer.game_rooms[self.group_name]["board"]
                board[3][3] = "white"
                board[3][4] = "black"
                board[4][3] = "black"
                board[4][4] = "white"

            await self.channel_layer.group_add(self.group_name, self.channel_name)
            await self.accept()

            game_state = self.channel_layer.game_rooms[self.group_name]
            players = game_state["players"]
            game_state["last_active"] = time.time()  # 誰かが入ったら更新

            # 既存のプレイヤーか確認し、役割を維持
            if player_id in players:
                role = players[player_id]
                is_reconnect = True
                logger.info(f"[RECONNECT] {player_id} が {self.group_name} に再接続")
            else:
                is_reconnect = False
                logger.info(f"[CONNECT] {player_id} が {self.group_name} に接続. players: {players}")
                # 新規プレイヤーの場合、役割を割り当てる
                if len(players) == 0:
                    role = "black"
                elif len(players) == 1:
                    role = "white"
                else:
                    role = "spectator"
                players[player_id] = role  # プレイヤーを登録

            self.role = role
            self.player_id = player_id
            logger.info(f"[ASSIGN ROLE] {player_id} -> {role}")

            await self.send(text_data=json.dumps({
                "action": "assign_role",
                "role": role,
                "reconnect": is_reconnect
            }))

            # プレイヤーの場合、ターンタイマーをセット
            if role in ["black", "white"] and game_state["time_limit"] > 0 and not game_state["game_over"]:
                asyncio.create_task(self.schedule_turn_timeout())

            # 全員にプレイヤーリストを送信（観戦者も含む）
            await self.channel_layer.group_send(
                self.group_name,
                {
                    "type": "update_players",
                    "players": list(players.keys()),
                    "player_id": player_id
                }
            )
        except Exception as e:
            logger.error(f"[ERROR in connect] {str(e)}")
            logger.error(traceback.format_exc())  # 詳細なエラートレースをログに記録
            await self.close()

    async def update_players(self, event):
        await self.send(text_data=json.dumps({
            "action": "update_players",
            "players": event["players"],
            "player_id": event["player_id"]
        }))
 
    async def disconnect(self, close_code):
        try:
            logger.info(f"[DISCONNECT] {self.player_id} left {self.group_name}")
            # WebSocket のグループから削除
            try:
                await self.channel_layer.group_discard(self.group_name, self.channel_name)
            except Exception as e:
                logger.warning(f"[ERROR] group_discard failed: {e}")
            
            game_state = self.channel_layer.game_rooms.get(self.group_name)
            if game_state:
                # 最後のプレイヤーが抜けたら last_active を更新
                game_state["last_active"] = time.time()
                if len(game_state["players"]) == 0:
                    asyncio.create_task(self.schedule_room_deletion(self.group_name))
        except Exception as e:
            logger.error(f"[ERROR in disconnect] {str(e)}")
            logger.error(traceback.format_exc())
            


    async def schedule_room_deletion(self, room_name):
        """ 1時間後に未使用のままなら削除 """
        await asyncio.sleep(3600)
        if room_name in self.channel_layer.game_rooms:
            game_state = self.channel_layer.game_rooms[room_name]
            if time.time() - game_state["last_active"] >= 3600:
                del self.channel_layer.game_rooms[room_name]
                logger.info(f"[ROOM DELETED] {room_name} was deleted due to inactivity")

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
            logger.info(f"[RECEIVED] {data}")
            game_state = self.channel_layer.game_rooms[self.group_name]
            if game_state.get("game_over", False):
                logger.info(f"[GAME OVER] {self.group_name} の対戦は終了しています")
                return  # ゲーム終了後は以降のメッセージを無視
            board = game_state["board"]
            game_state["last_active"] = time.time()


            # オンライン対戦の場合、部屋内に2人未満なら手を受け付けない
            if len(game_state["players"]) < 2 and self.role in ["black", "white"]:
                await self.send(text_data=json.dumps({
                    "error": "対戦相手がまだ接続していません。もう少々お待ちください。"
                }))
                return
            if not game_state.get("game_started", False):
                game_state["game_started"] = True
                logger.info(f"[GAME STARTED] {self.group_name} の対戦が開始されました")
                # ゲーム開始時を通知
                
                await self.channel_layer.group_send(
                    self.group_name,
                    {
                        "type": "game_message",
                        "message": 
                        {
                            "action": "game_start",
                            "time_limit": game_state["time_limit"],
                            "show_valid_moves": game_state["show_valid_moves"]
                        }
                    }
                )
                
                
            
            # 降参処理
            if data.get("action") == "surrender":
                if self.role not in ["black", "white"]:
                    await self.send(text_data=json.dumps({
                        "error": "観戦者は降参できません"
                    }))
                    return
                opponent = "white" if self.role == "black" else "black"
                game_state["game_over"] = True
                game_state["winner"] = opponent
                game_state["reason"] = "surrender"
                await self.channel_layer.group_send(
                    self.group_name,
                    {
                        "type": "game_over_message",
                        "winner": opponent,
                        "reason": "surrender"
                    }
                )
                return

            # パス処理
            if data.get("action") == "pass":
                valid_moves = self.get_valid_moves(board, game_state["turn"])
                if valid_moves:
                    await self.send(text_data=json.dumps({
                        "error": "有効な手が存在するため、パスはできません"
                    }))
                    return
                # パスが有効な場合：連続パス回数を増加
                game_state["pass_count"] += 1
                if game_state["pass_count"] >= 2:
                    # 両者がパスした場合、自然終了
                    await self.end_natural_game(game_state)
                    return
                else:
                    # ターン交代
                    game_state["turn"] = "white" if game_state["turn"] == "black" else "black"
                    game_state["turn_start_time"] = asyncio.get_event_loop().time()
                    await self.channel_layer.group_send(
                        self.group_name,
                        {
                            "type": "pass_message",
                            "message": {"action": "pass", "new_turn": game_state["turn"]}
                        }
                    )
                    if game_state["time_limit"] > 0:
                        asyncio.create_task(self.schedule_turn_timeout())
                    return

            # 通常の着手処理
            row = data.get("row")
            col = data.get("col")
            player = data.get("player")

            # ターンチェック
            if player != game_state["turn"]:
                await self.send(text_data=json.dumps({
                    "error": f"Not your turn: 現在は {game_state['turn']} の番です。"
                }))
                return

            # 着手妥当性チェック（空セルであり、ひっくり返せる石が存在するか）
            if not self.is_valid_move(board, row, col, player):
                await self.send(text_data=json.dumps({"error": f"このマス({row}, {col}) には石を置けません"}))
                return

            # 着手可能な場合、ひっくり返す石を取得
            discs_to_flip = self.get_flippable_discs(board, row, col, player)
            if not discs_to_flip:
                await self.send(text_data=json.dumps({"error": "No discs to flip, invalid move"}))
                return

            # 着手＆ひっくり返しの実施
            board[row][col] = player
            for x, y in discs_to_flip:
                board[x][y] = player

            # 有効な手があった場合は連続パスをリセット
            game_state["pass_count"] = 0

            # ターン交代
            game_state["turn"] = "white" if player == "black" else "black"
            game_state["turn_start_time"] = asyncio.get_event_loop().time()
            move_data = {
                "action": "place_stone",
                "row": row,
                "col": col,
                "player": player,
                "flipped": discs_to_flip,
                "new_turn": game_state["turn"]
            }
            await self.channel_layer.group_send(
                self.group_name,
                {"type": "game_message", "message": move_data}
            )

            # 自然終了判定：盤面が満杯、または双方に有効手がない場合
            if self.check_board_full(board) or (
                not self.get_valid_moves(board, "black") and not self.get_valid_moves(board, "white")
            ):
                await self.end_natural_game(game_state)
                return

            # 時間制限がある場合、ターンタイムアウトタスクを再設定
            if game_state["time_limit"] > 0:
                asyncio.create_task(self.schedule_turn_timeout())
        except json.JSONDecodeError:
            logger.error("[ERROR] Invalid JSON received")
            await self.send(text_data=json.dumps({"error": "Invalid JSON format"}))

        except Exception as e:
            logger.error(f"[ERROR in receive] {str(e)}")
            logger.error(traceback.format_exc())

            await self.send(text_data=json.dumps({"error": f"Server Error: {str(e)}"}))   
    async def game_message(self, event):
        await self.send(text_data=json.dumps(event["message"]))

    async def pass_message(self, event):
        await self.send(text_data=json.dumps(event["message"]))

    async def game_over_message(self, event):
        await self.send(text_data=json.dumps({
            "action": "game_over",
            "winner": event["winner"],
            "reason": event["reason"]
        }))

    # 盤面上の位置が有効かどうか
    def isValidPosition(self, row, col):
        return 0 <= row < 8 and 0 <= col < 8

    # 指定位置に石を置いた場合、ひっくり返せる石のリストを返す
    def get_flippable_discs(self, board, row, col, player):
        opponent = "white" if player == "black" else "black"
        directions = [(-1, -1), (-1, 0), (-1, 1),
                      (0, -1),           (0, 1),
                      (1, -1),  (1, 0),  (1, 1)]
        discs_to_flip = []
        for dx, dy in directions:
            x, y = row + dx, col + dy
            temp = []
            while self.isValidPosition(x, y) and board[x][y] == opponent:
                temp.append((x, y))
                x += dx
                y += dy
            if self.isValidPosition(x, y) and board[x][y] == player and temp:
                discs_to_flip.extend(temp)
        return discs_to_flip

    # 着手の妥当性：空セルであり、ひっくり返せる石が1つ以上ある場合
    def is_valid_move(self, board, row, col, player):
        if not self.isValidPosition(row, col) or board[row][col] != "":
            return False
        return bool(self.get_flippable_discs(board, row, col, player))

    # 現在の盤面における有効な手の一覧を返す
    def get_valid_moves(self, board, player):
        valid_moves = []
        for r in range(8):
            for c in range(8):
                if board[r][c] == "" and self.is_valid_move(board, r, c, player):
                    valid_moves.append((r, c))
        return valid_moves

    # 盤面が満杯かどうか
    def check_board_full(self, board):
        for row in board:
            if "" in row:
                return False
        return True

    async def end_natural_game(self, game_state):
        board = game_state["board"]
        black_count = sum(cell == "black" for row in board for cell in row)
        white_count = sum(cell == "white" for row in board for cell in row)
        if black_count > white_count:
            winner = "black"
        elif white_count > black_count:
            winner = "white"
        else:
            winner = None  # 引き分けの場合
        game_state["game_over"] = True
        game_state["winner"] = winner
        game_state["reason"] = "natural"
        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "game_over_message",
                "winner": winner,
                "reason": "natural"
            }
        )

    async def schedule_turn_timeout(self):
        game_state = self.channel_layer.game_rooms[self.group_name]
        time_limit = game_state.get("time_limit", 0)
        if time_limit <= 0 or game_state.get("game_over", False):
            return
        current_turn = game_state["turn"]
        my_turn_start = game_state["turn_start_time"]
        await asyncio.sleep(time_limit)
        # タイムアウト判定：ターンが変わっておらず、開始時刻も同じ場合
        if (not game_state.get("game_over", False) and 
            game_state["turn"] == current_turn and 
            game_state["turn_start_time"] == my_turn_start):
            opponent = "white" if current_turn == "black" else "black"
            game_state["game_over"] = True
            game_state["winner"] = opponent
            game_state["reason"] = "timeout"
            await self.channel_layer.group_send(
                self.group_name,
                {
                    "type": "game_over_message",
                    "winner": opponent,
                    "reason": "timeout"
                }
            )