import json
import asyncio
import logging
from channels.generic.websocket import AsyncWebsocketConsumer
from urllib.parse import parse_qs
import time
import traceback
from django.utils.translation import gettext as _
from django.utils.translation import activate
import redis.asyncio as aioredis
import os


""" #todo
AIを高速化
統計・ランキングを追加
アカウント機能を追加
有料プランを追加：広告削除、追加のAIを利用、英語以外のユーザー名も設定可能、優先マッチング、リバーシ検定の資格授与
オンラインマッチ機能の実装
勝利 / 敗北の画面（win / lose 煽り、再対戦のボタン、AI分析やハイライトの表示）。
レーティングをjsonに反映
bingにクロール依頼してアイコンとdescriptionを反映を確認
→ 次にSNSへのシェアを実装（ogp画像：盤面・勝率予測、上位n%など）

ボリューム層：AI、中〜上級、制限時間なし・有効手は表示する
"""

logger = logging.getLogger(__name__)

# Redis接続プールを管理する共有インスタンスを作成
# アプリケーション全体でこのインスタンスを再利用する
try:
    # 環境変数からRedis URLを取得、なければデフォルトを使用
    redis_url = os.environ.get("REDIS_URL", "redis://127.0.0.1:6379")
    redis_instance = aioredis.from_url(
        redis_url,
        decode_responses=True,
    )
    logger.info(f"Successfully created shared Redis connection pool for {redis_url}.")
except Exception as e:
    logger.error(f"Failed to create shared Redis connection pool for {redis_url}: {e}")
    # Redisが利用不可の場合、Noneを設定
    redis_instance = None

class OthelloConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        try:
            self.redis = redis_instance

            self.room_name = self.scope['url_route']['kwargs']['room_name']
            self.group_name = f"othello_{self.room_name}"

            # クエリパラメータ
            query_params = parse_qs(self.scope.get("query_string", b"").decode())
            player_id = query_params.get("playerId", [None])[0]
            player_name = query_params.get("playerName", [None])[0]
            language = query_params.get("lang", ["ja"])[0]
            activate(language)

            if not player_id:
                await self.send(text_data=json.dumps({"error": _("プレイヤーIDが提供されていません")}))
                await self.close()
                return

            if not player_name:
                await self.send(text_data=json.dumps({"error": _("プレイヤー名が提供されていません")}))
                await self.close()
                return

            # ★★★ Redisから部屋データを取得
            raw_data = await self.redis.get(f"game_rooms:{self.group_name}")
            if raw_data:
                game_state = json.loads(raw_data)
            else:
                # 新規部屋を作成
                time_limit = int(query_params.get("timeLimit", [0])[0])
                show_valid_moves = query_params.get("showValidMoves", [False])[0]

                logger.info(f"[NEW ROOM] {self.group_name} を作成")
                game_state = {
                    "board": [["" for _ in range(8)] for _ in range(8)],
                    "turn": "black",
                    "players": {},
                    "game_over": False,
                    "pass_count": 0,
                    "time_limit": time_limit,
                    "turn_start_time": asyncio.get_event_loop().time(),
                    "game_started": False,
                    "last_active": time.time(),
                    "show_valid_moves": show_valid_moves,
                    "history": ""
                }
                board = game_state["board"]
                board[3][3] = "white"
                board[3][4] = "black"
                board[4][3] = "black"
                board[4][4] = "white"

                # Redisへ保存
                await self.redis.set(
                    f"game_rooms:{self.group_name}",
                    json.dumps(game_state)
                )

            # グループに参加 & accept
            await self.channel_layer.group_add(self.group_name, self.channel_name)
            await self.accept()

            # Pingタスク開始
            self.ping_task = asyncio.create_task(self.send_ping())

            # 最新のゲーム状態を再取得（上で初期化した場合を含む）
            raw_data = await self.redis.get(f"game_rooms:{self.group_name}")
            game_state = json.loads(raw_data)
            players = game_state["players"]
            game_state["last_active"] = time.time()

            # 既存プレイヤーか新規か
            if player_id in players:
                role = players[player_id][0]
                player_name = players[player_id][1]
                is_reconnect = True
                players[player_id][2] = True
                logger.info(f"[RECONNECT] {player_id} が {self.group_name} に再接続 （{self.group_name}")
            else:
                is_reconnect = False
                logger.info(f"[CONNECT] {player_id} が {self.group_name} に接続. players: {players}")
                if len(players) == 0:
                    role = "black"
                elif len(players) == 1:
                    role = "white"
                else:
                    role = "spectator"
                players[player_id] = [role, player_name,True]

            self.role = role
            self.player_id = player_id
            self.player_name = player_name
            self.connected = True

            logger.info(f"[ASSIGN ROLE] player:{player_id} -> role:{role} （ルーム名：{self.group_name}")

            # 更新をRedisへ書き戻す
            await self.redis.set(
                f"game_rooms:{self.group_name}",
                json.dumps(game_state)
            )

            # ロールをクライアントへ送信
            await self.send(text_data=json.dumps({
                "action": "assign_role",
                "role": role,
                "reconnect": is_reconnect,
                "history": game_state["history"],
                "n_players": len(players),
                "time_limit": game_state["time_limit"],
                "show_valid_moves": game_state["show_valid_moves"],
            }))

            # ターンタイマーがある場合
            if role in ["black", "white"] and game_state["time_limit"] > 0 and not game_state["game_over"]:
                asyncio.create_task(self.schedule_turn_timeout())

            # 全員にプレイヤーリストを送信（観戦者も含む）
            await self.channel_layer.group_send(
                self.group_name,
                {
                    "type": "update_players",
                    "players": players,
                    "player_id": player_id
                }
            )

        except Exception as e:
            logger.error(f"[ERROR in connect] {str(e)} （ルーム名：{self.group_name}）")
            logger.error(traceback.format_exc())
            await self.close()

    async def update_players(self, event):
        await self.send(text_data=json.dumps({
            "action": "update_players",
            "players": event["players"],
            "player_id": event["player_id"],
            "setting": event.get("setting", False)
        }))

    async def disconnect(self, close_code):
        try:
            if hasattr(self, "ping_task"):
                self.ping_task.cancel()
            logger.info(f"[DISCONNECT] {getattr(self, 'player_id', None)} left {self.group_name}")

            # グループから削除
            try:
                await self.channel_layer.group_discard(self.group_name, self.channel_name)
            except Exception as e:
                logger.warning(f"[ERROR] group_discard failed: {e} （ルーム名：{self.group_name}）")

            # ★★★ Redisからゲーム状態を取得 & 更新
            raw_data = await self.redis.get(f"game_rooms:{self.group_name}")
            if raw_data:
                game_state = json.loads(raw_data)
                game_state["last_active"] = time.time()
                game_state["players"][self.player_id][2] = False
                await self.redis.set(f"game_rooms:{self.group_name}", json.dumps(game_state))
                active_players = sum(1 for p in game_state["players"].values() if p[2] and p[0] != "spectator")
                if active_players == 0:
                    logger.info(f"[NO ACTIVE PLAYERS] {self.group_name} has no active players. Deleting room.")
                    asyncio.create_task(self.schedule_room_deletion(self.group_name))

        except Exception as e:
            logger.error(f"[ERROR in disconnect] {str(e)} （ルーム名：{self.group_name}）")
            logger.error(traceback.format_exc())

    async def schedule_room_deletion(self, room_name):
        """ 1時間後に未使用のままなら削除 """
        await asyncio.sleep(3600)
        raw_data = await self.redis.get(f"game_rooms:{room_name}")
        if raw_data:
            game_state = json.loads(raw_data)
            if time.time() - game_state["last_active"] >= 3600:
                await self.redis.delete(f"game_rooms:{room_name}")
                logger.info(f"[ROOM DELETED] {room_name} was deleted due to inactivity")
    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
            logger.info(f"[RECEIVED] {data} （ルーム名：{self.group_name}）")

            # ★★★ 毎回Redisから取得
            raw_data = await self.redis.get(f"game_rooms:{self.group_name}")
            if not raw_data:
                logger.warning(f"[RECEIVE] Room {self.group_name} not found in Redis. Possibly expired?")
                return

            game_state = json.loads(raw_data)
            if game_state.get("game_over", False):
                logger.info(f"[GAME OVER] {self.group_name} の対戦は終了しています")
                return

            board = game_state["board"]
            game_state["last_active"] = time.time()

            if data.get("action") == "game_setting":
                time_limit = int(data.get("time_limit", 0))
                show_valid_moves = data.get("show_valid_moves", False)
                player_name = data.get("player_name", "unknown")
                game_state["time_limit"] = time_limit
                game_state["show_valid_moves"] = show_valid_moves
                if self.player_id in game_state["players"]:
                    game_state["players"][self.player_id][1] = player_name

                await self.channel_layer.group_send(
                    self.group_name,
                    {
                        "type": "update_players",
                        "players": game_state["players"],
                        "player_id": self.player_id,
                        "setting": True
                    }
                )
                logger.info(f"[GAME SETTING] {self.group_name} の設定が更新されました：{game_state}")
                # ★★★ Redisへ保存して終了
                await self.redis.set(f"game_rooms:{self.group_name}", json.dumps(game_state))
                return

            # プレイヤー数チェック
            if len(game_state["players"]) < 2 and self.role in ["black", "white"]:
                await self.send(text_data=json.dumps({
                    "error": _("対戦相手がまだ接続していません")
                }))
                return

            # ゲーム開始チェック
            if not game_state.get("game_started", False):
                game_state["game_started"] = True
                logger.info(f"[GAME STARTED] {self.group_name} の対戦開始: {game_state}")
                await self.channel_layer.group_send(
                    self.group_name,
                    {
                        "type": "game_message",
                        "message": {
                            "action": "game_start",
                            "time_limit": game_state["time_limit"],
                            "show_valid_moves": game_state["show_valid_moves"]
                        }
                    }
                )

            # 降参
            if data.get("action") == "surrender":
                if self.role not in ["black", "white"]:
                    await self.send(text_data=json.dumps({"error": _("観戦者は降参できません")}))
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
                        "reason": "surrender",
                        "history": game_state["history"]
                    }
                )

                # ★★★ Redis保存
                await self.redis.set(f"game_rooms:{self.group_name}", json.dumps(game_state))
                return

            # パス
            if data.get("action") == "pass":
                valid_moves = self.get_valid_moves(board, game_state["turn"])
                if valid_moves:
                    await self.send(text_data=json.dumps({
                        "error": _("有効な手が存在するため、パスはできません")
                    }))
                    return
                game_state["pass_count"] += 1
                if game_state["pass_count"] >= 2:
                    await self.end_natural_game()  # 中でRedis更新する想定
                    return
                else:
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

                # ★★★ Redis保存
                await self.redis.set(f"game_rooms:{self.group_name}", json.dumps(game_state))
                return

            # 通常の着手
            row = data.get("row")
            col = data.get("col")
            player = data.get("player")

            if player != game_state["turn"]:
                await self.send(text_data=json.dumps({
                    "error": f"[Not your turn] current : {game_state['turn']} "
                }))
                return

            if not self.is_valid_move(board, row, col, player):
                await self.send(text_data=json.dumps({
                    "error": _("このマスには石を置けません：") + f"{'abcdefgh'[col]}{row+1} ({row+1}, {col+1})"
                }))
                return

            discs_to_flip = self.get_flippable_discs(board, row, col, player)
            if not discs_to_flip:
                await self.send(text_data=json.dumps({
                    "error": "No discs to flip, invalid move"
                }))
                return

            board[row][col] = player
            for x, y in discs_to_flip:
                board[x][y] = player

            game_state["pass_count"] = 0
            game_state["turn"] = "white" if player == "black" else "black"
            game_state["turn_start_time"] = asyncio.get_event_loop().time()

            game_state["history"] += f"{player[0]}{row}{col},"
            await self.channel_layer.group_send(
                self.group_name,
                {
                    "type": "game_message",
                    "message": {
                        "action": "place_stone",
                        "history": game_state["history"]
                    }
                }
            )

            # 盤面満杯 or 両者に有効手がない場合
            if self.check_board_full(board) or (
                not self.get_valid_moves(board, "black") and not self.get_valid_moves(board, "white")
            ):
                await self.end_natural_game()
                return

            # タイマー再設定
            if game_state["time_limit"] > 0:
                asyncio.create_task(self.schedule_turn_timeout())

            # ★★★ 最後にRedisへ書き戻し
            await self.redis.set(f"game_rooms:{self.group_name}", json.dumps(game_state))

        except json.JSONDecodeError:
            logger.error("[ERROR] Invalid JSON received （ルーム名：{self.group_name}）")
            await self.send(text_data=json.dumps({"error": "Invalid JSON format"}))
        except Exception as e:
            logger.error(f"[ERROR in receive] {str(e)} （ルーム名：{self.group_name}）")
            logger.error(traceback.format_exc())
            await self.send(text_data=json.dumps({"error": f"Server Error: {str(e)}"}))

    async def game_message(self, event):
        await self.send(text_data=json.dumps(event["message"]))

    async def pass_message(self, event):
        await self.send(text_data=json.dumps(event["message"]))

    async def game_over_message(self, event):
        if hasattr(self, "ping_task"):
            self.ping_task.cancel()
        await self.send(text_data=json.dumps({
            "action": "game_over",
            "winner": event["winner"],
            "reason": event["reason"],
            "history": event.get("history", "")
        }))

    def isValidPosition(self, row, col):
        return 0 <= row < 8 and 0 <= col < 8

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

    def is_valid_move(self, board, row, col, player):
        if not self.isValidPosition(row, col) or board[row][col] != "":
            return False
        return bool(self.get_flippable_discs(board, row, col, player))

    def get_valid_moves(self, board, player):
        valid_moves = []
        for r in range(8):
            for c in range(8):
                if board[r][c] == "" and self.is_valid_move(board, r, c, player):
                    valid_moves.append((r, c))
        return valid_moves

    def check_board_full(self, board):
        for row in board:
            if "" in row:
                return False
        return True

    async def end_natural_game(self):
        """両者パスまたは盤面が埋まった場合の自然終了"""
        # ★★★ Redisから取得
        raw_data = await self.redis.get(f"game_rooms:{self.group_name}")
        if not raw_data:
            return
        game_state = json.loads(raw_data)
        board = game_state["board"]

        black_count = sum(cell == "black" for row in board for cell in row)
        white_count = sum(cell == "white" for row in board for cell in row)
        if black_count > white_count:
            winner = "black"
        elif white_count > black_count:
            winner = "white"
        else:
            winner = None  # 引き分け

        game_state["game_over"] = True
        game_state["winner"] = winner
        game_state["reason"] = "natural"

        # Redisに保存
        await self.redis.set(f"game_rooms:{self.group_name}", json.dumps(game_state))

        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "game_over_message",
                "winner": winner,
                "reason": "natural",
                "history": game_state["history"]
            }
        )

    async def schedule_turn_timeout(self):
        raw_data = await self.redis.get(f"game_rooms:{self.group_name}")
        if not raw_data:
            return
        game_state = json.loads(raw_data)
        time_limit = game_state.get("time_limit", 0)
        if time_limit <= 0 or game_state.get("game_over", False):
            return

        current_turn = game_state["turn"]
        my_turn_start = game_state["turn_start_time"]

        await asyncio.sleep(time_limit)

        # 再度取得して状況を確認
        raw_data2 = await self.redis.get(f"game_rooms:{self.group_name}")
        if not raw_data2:
            return
        latest_state = json.loads(raw_data2)

        # タイムアウト判定
        if (not latest_state.get("game_over", False) and 
            latest_state["turn"] == current_turn and 
            latest_state["turn_start_time"] == my_turn_start):
            opponent = "white" if current_turn == "black" else "black"
            latest_state["game_over"] = True
            latest_state["winner"] = opponent
            latest_state["reason"] = "timeout"

            await self.redis.set(f"game_rooms:{self.group_name}", json.dumps(latest_state))

            await self.channel_layer.group_send(
                self.group_name,
                {
                    "type": "game_over_message",
                    "winner": opponent,
                    "reason": "timeout",
                    "history": latest_state["history"]
                }
            )

    async def send_ping(self):
        last_action_time = asyncio.get_event_loop().time()
        while True:
            await asyncio.sleep(30)
            if asyncio.get_event_loop().time() - last_action_time > 36000:
                logger.info(f"[PING] Closing connection because over 10 hours has past from when game started")
                break
            await self.send(text_data=json.dumps({"type": "ping"}))