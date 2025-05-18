from .redis_singleton import redis_instance
import json, uuid, random, logging
from channels.generic.websocket import AsyncWebsocketConsumer

logger = logging.getLogger(__name__)

# Redisキーの定数化
QUEUE_KEY = "reversi:queue"
ACTIVE_PLAYERS_SET_KEY = "reversi:active_players"

class MatchConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.player_id = None
        await self.accept()
        logger.info(f"Client connected: {self.channel_name}")

    async def disconnect(self, close_code):
        logger.info(f"Client disconnecting: {self.channel_name}, Player ID: {self.player_id}, Close code: {close_code}")
        if self.player_id:
            player_meta_to_remove = {
                "channel": self.channel_name,
                "player_id": self.player_id,
            }
            removed_count = await redis_instance.lrem(QUEUE_KEY, 0, json.dumps(player_meta_to_remove))
            if removed_count > 0:
                logger.info(f"Player {self.player_id} (channel: {self.channel_name}) removed from queue. Count: {removed_count}")

            # アクティブプレイヤーのセットからも削除
            srem_result = await redis_instance.srem(ACTIVE_PLAYERS_SET_KEY, self.player_id)
            if srem_result > 0:
                logger.info(f"Player {self.player_id} removed from active players set.")
            else:
                logger.info(f"Player {self.player_id} not found in active players set (possibly already matched or not fully joined/removed).")
        
        logger.info(f"Client disconnected: {self.channel_name}, Player ID: {self.player_id}")

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            logger.error(f"Invalid JSON received from {self.channel_name}: {text_data}")
            await self.send_error_message("Invalid JSON format.")
            return

        message_type = data.get("type")
        received_player_id = data.get("player_id")

        if not received_player_id:
            logger.warning(f"Message without player_id received from {self.channel_name}: {data}")
            await self.send_error_message("Player ID is missing in the message.")
            return

        if self.player_id is None:
            self.player_id = received_player_id
            logger.info(f"Player ID {self.player_id} associated with channel {self.channel_name}")
        elif self.player_id != received_player_id:
            # 通常、一度紐付けられたplayer_idは変わらない
            logger.error(f"Player ID mismatch for channel {self.channel_name}. Current: {self.player_id}, Received: {received_player_id}")
            await self.send_error_message("Player ID mismatch for this connection.")
            return

        if message_type == "join":
            logger.info(f"Join request received from player {self.player_id} (channel: {self.channel_name})")
            # 既にアクティブプレイヤーセットにいるか確認 (重複参加防止)
            if await redis_instance.sismember(ACTIVE_PLAYERS_SET_KEY, self.player_id):
                logger.info(f"Player {self.player_id} is already in queue or game.")
                await self.send(text_data=json.dumps({
                    "type": "error",
                    "message": "You are already in the matchmaking queue or playing a game."
                }))
                return

            player_meta = {
                "channel": self.channel_name,
                "player_id": self.player_id,
            }

            await redis_instance.rpush(QUEUE_KEY, json.dumps(player_meta))
            await redis_instance.sadd(ACTIVE_PLAYERS_SET_KEY, self.player_id)
            logger.info(f"Player {self.player_id} added to queue and active players set. Meta: {player_meta}")

            await self.try_pair()
        else:
            logger.info(f"Received non-join message type '{message_type}' from player {self.player_id}")

    async def try_pair(self):
        logger.info(f"Current queue: {await redis_instance.lrange(QUEUE_KEY, 0, -1)}")
        logger.info(f"Current active players: {await redis_instance.smembers(ACTIVE_PLAYERS_SET_KEY)}")

        if await redis_instance.llen(QUEUE_KEY) < 2:
            await self.send(text_data=json.dumps({"type": "waiting"}))
            logger.info(f"Player {self.player_id} is waiting for another player (queue length < 2).")
            return

        # Luaスクリプトでアトミックに2人取得
        lua_script_pop_two = """
        local queue = KEYS[1]
        local p1 = redis.call('LPOP', queue)
        if not p1 then
            return {nil, nil}
        end
        local p2 = redis.call('LPOP', queue)
        if not p2 then
            redis.call('LPUSH', queue, p1)
            return {nil, nil}
        end
        return {p1, p2}
        """
        p1_json, p2_json = await redis_instance.eval(lua_script_pop_two, 1, QUEUE_KEY)

        if not p2_json:  # 競合などで1人しか取れなかったか、Luaスクリプト内でp1を戻した場合
            await self.send(text_data=json.dumps({"type": "waiting"}))
            logger.info(f"Player {self.player_id} is waiting (could not form a pair, p2_json is nil).")
            return

        try:
            p1_data = json.loads(p1_json)
            p2_data = json.loads(p2_json)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to decode player data from queue. P1: {p1_json}, P2: {p2_json}. Error: {e}")
            # 問題のデータをキューの末尾に戻し、再試行の機会を与える (ただしループのリスクも考慮)
            # active_players_setからは削除しない (まだマッチングしていないため)
            if p1_json: await redis_instance.rpush(QUEUE_KEY, p1_json)
            if p2_json: await redis_instance.rpush(QUEUE_KEY, p2_json)
            logger.error("Returned corrupted player data to the end of the queue.")
            await self.send_error_message("Failed to process matchmaking queue. Please try joining again later.")
            return

        await redis_instance.srem(ACTIVE_PLAYERS_SET_KEY, p1_data["player_id"])
        await redis_instance.srem(ACTIVE_PLAYERS_SET_KEY, p2_data["player_id"])
        logger.info(f"Removed {p1_data['player_id']} and {p2_data['player_id']} from active players set after successful pairing.")

        room_id = uuid.uuid4().hex
        colors = random.sample(["black", "white"], 2)

        paired_players_info = [
            {"meta": p1_data, "color": colors[0], "opponent_id": p2_data["player_id"]},
            {"meta": p2_data, "color": colors[1], "opponent_id": p1_data["player_id"]},
        ]

        for player_info in paired_players_info:
            meta = player_info["meta"]
            color = player_info["color"]
            opponent_id = player_info["opponent_id"]
            
            logger.info(f"Pairing player {meta['player_id']} (channel: {meta['channel']}) as {color} with opponent {opponent_id}. Room: {room_id}")
            try:
                await self.channel_layer.send(
                    meta["channel"], # 各プレイヤーのチャンネルに送信
                    {
                        "type": "matchDone", # このクラスのmatchDoneメソッドを呼び出す
                        "room_id": room_id,
                        "color": color,
                        "opponent_player_id": opponent_id
                    }
                )
            except Exception as e:
                logger.error(f"Failed to send matchDone to {meta['player_id']} on channel {meta['channel']}. Error: {e}")

    async def matchDone(self, event):
        logger.info(f"Sending 'matched' event to player {self.player_id} (channel: {self.channel_name}). Event: {event}")
        await self.send(text_data=json.dumps({
            "type": "matched",
            "room_id": event["room_id"],
            "color": event["color"],
            "opponent_player_id": event.get("opponent_player_id")
        }))

    async def send_error_message(self, message):
        logger.warning(f"Sending error message to player {self.player_id} (channel: {self.channel_name}): {message}")
        await self.send(text_data=json.dumps({
            "type": "error",
            "message": message
        }))