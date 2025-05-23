from .redis_singleton import redis_instance
import json, uuid, random, logging, asyncio
from channels.generic.websocket import AsyncWebsocketConsumer

logger = logging.getLogger(__name__)

# Redisキーの定数化
QUEUE_KEY = "reversi:queue"
ACTIVE_PLAYERS_SET_KEY = "reversi:active_players"

class MatchConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.player_id = None
        self.allow_bot = False
        await self.accept()
        logger.info(f"Client connected: {self.channel_name}")

    async def disconnect(self, close_code):
        logger.info(f"Client disconnecting: {self.channel_name}, Player ID: {self.player_id}, Close code: {close_code}")
        if self.player_id:
            player_meta_to_remove = {
                "channel": self.channel_name, # self.channel_name はdisconnect時にはまだ有効
                "player_id": self.player_id,
            }
            player_meta_json_to_remove = json.dumps(player_meta_to_remove)

            # Luaスクリプトでキューからの削除とアクティブプレイヤーセットからの削除をアトミックに実行
            lua_script_disconnect = """
            local queue_key = KEYS[1]
            local active_players_set_key = KEYS[2]
            local player_meta_json = ARGV[1]
            local player_id = ARGV[2]

            local lrem_count = redis.call('LREM', queue_key, 0, player_meta_json)
            local srem_count = redis.call('SREM', active_players_set_key, player_id)

            return {lrem_count, srem_count}
            """
            try:
                lrem_count, srem_result = await redis_instance.eval(
                    lua_script_disconnect,
                    2,  # Number of KEYS
                    QUEUE_KEY, ACTIVE_PLAYERS_SET_KEY,
                    player_meta_json_to_remove, self.player_id
                )

                if lrem_count > 0:
                    logger.info(f"Player {self.player_id} (meta: {player_meta_json_to_remove}) removed from queue. Count: {lrem_count}")
                
                if srem_result > 0:
                    logger.info(f"Player {self.player_id} removed from active players set (via Lua).")
                else:
                    # LREMで削除されていれば、通常こちらも削除されるはず。
                    # もしアクティブセットに元々いなかった場合（例：joinが完了する前に切断）はこちらが0になる。
                    logger.info(f"Player {self.player_id} not found in active players set or already removed (via Lua).")
            except Exception as e:
                logger.error(f"Error during atomic disconnect for player {self.player_id}: {e}")

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
            logger.error(f"Player ID mismatch for channel {self.channel_name}. Current: {self.player_id}, Received: {received_player_id}")
            await self.send_error_message("Player ID mismatch for this connection.")
            return

        if message_type == "join":
            logger.info(f"Join request received from player {self.player_id} (channel: {self.channel_name})")
            if data.get("allow_bot"):
                self.allow_bot = True
                logger.info(f"Player {self.player_id} has opted for bot matchmaking if needed.")
            player_meta = {
                "channel": self.channel_name,
                "player_id": self.player_id,
            }
            player_meta_json = json.dumps(player_meta)

            # Luaスクリプトでアクティブプレイヤーセットの確認と追加、キューへの追加をアトミックに実行
            lua_script_join = """
            local queue_key = KEYS[1]
            local active_players_set_key = KEYS[2]
            local player_meta_json_to_add = ARGV[1]
            local player_id_to_add = ARGV[2]

            -- 既にアクティブプレイヤーセットにいるか確認
            if redis.call('SISMEMBER', active_players_set_key, player_id_to_add) == 1 then
              return {0, 0, 1} -- {rpush_len, sadd_result, already_exists_flag}
            end

            -- キューに追加
            local rpush_len = redis.call('RPUSH', queue_key, player_meta_json_to_add)
            -- アクティブプレイヤーセットに追加
            local sadd_result = redis.call('SADD', active_players_set_key, player_id_to_add)

            return {rpush_len, sadd_result, 0} -- 0 for not already_exists
            """
            try:
                rpush_len, sadd_res, already_exists = await redis_instance.eval(
                    lua_script_join,
                    2, # Number of KEYS
                    QUEUE_KEY, ACTIVE_PLAYERS_SET_KEY,
                    player_meta_json, self.player_id
                )

                if already_exists == 1:
                    logger.info(f"Player {self.player_id} is already in queue or game (checked via Lua).")
                    await self.send(text_data=json.dumps({
                        "type": "error",
                        "message": "You are already in the matchmaking queue or playing a game."
                    }))
                    return

                # Luaスクリプトが正常に実行され、already_existsでなければ、追加は成功しているはず
                # sadd_res が 1 ならセットに新規追加成功
                if sadd_res == 1:
                    logger.info(f"Player {self.player_id} added to queue (new length: {rpush_len}) and active players set. Meta: {player_meta}")
                    await self.try_pair()
                else:
                    # already_existsでないなら基本的にありえないはず
                    logger.error(f"Player {self.player_id} join logic inconsistency. RPUSH_LEN: {rpush_len}, SADD_RES: {sadd_res}, ALREADY_EXISTS: {already_exists}")
                    await self.send_error_message("Failed to join matchmaking due to an unexpected server issue. Please try again.")
            except Exception as e:
                logger.error(f"Error during atomic join for player {self.player_id}: {e}")
                await self.send_error_message("An error occurred while trying to join the queue. Please try again.")
        elif message_type == "cancel_join":
            logger.info(f"Cancel join request received from player {self.player_id} (channel: {self.channel_name})")
            if self.player_id:
                player_meta_to_remove = {
                    "channel": self.channel_name,
                    "player_id": self.player_id,
                }
                player_meta_json_to_remove = json.dumps(player_meta_to_remove)

                lua_script_cancel = """
                local queue_key = KEYS[1]
                local active_players_set_key = KEYS[2]
                local player_meta_json = ARGV[1]
                local player_id = ARGV[2]

                local lrem_count = redis.call('LREM', queue_key, 0, player_meta_json)
                local srem_count = redis.call('SREM', active_players_set_key, player_id)
                
                -- If lrem_count is 0, it means the player was not in the queue (possibly already matched)
                if lrem_count == 0 then
                    return {lrem_count, srem_count, 1} -- 1 indicates already matched or not in queue
                end

                return {lrem_count, srem_count, 0} -- 0 indicates successfully removed from queue
                """
                try:
                    lrem_count, srem_result, already_matched_or_not_in_queue = await redis_instance.eval(
                        lua_script_cancel,
                        2,  # Number of KEYS
                        QUEUE_KEY, ACTIVE_PLAYERS_SET_KEY,
                        player_meta_json_to_remove, self.player_id
                    )

                    if already_matched_or_not_in_queue == 1:
                        logger.info(f"Player {self.player_id} was not in queue during cancellation (possibly already matched). LREM: {lrem_count}, SREM: {srem_result}")
                        # クライアントには特に通知せず、matchedイベントで処理させる
                    elif lrem_count > 0:
                        logger.info(f"Player {self.player_id} (meta: {player_meta_json_to_remove}) removed from queue due to cancellation. Count: {lrem_count}")
                        if srem_result > 0:
                            logger.info(f"Player {self.player_id} also removed from active players set during cancellation.")
                    else:
                        logger.info(f"Player {self.player_id} not found in queue or active set during cancellation attempt. LREM: {lrem_count}, SREM: {srem_result}")

                except Exception as e:
                    logger.error(f"Error during cancellation for player {self.player_id}: {e}")
                    await self.send_error_message("An error occurred while trying to cancel matchmaking.")
            else:
                logger.warning(f"Cancel join request received without player_id from {self.channel_name}")
                await self.send_error_message("Cannot cancel matchmaking without a player ID.")

        else:
            logger.info(f"Received non-join/non-cancel message type '{message_type}' from player {self.player_id}")

    async def try_pair(self):
        logger.info(f"Current queue: {await redis_instance.lrange(QUEUE_KEY, 0, -1)}")
        logger.info(f"Current active players: {await redis_instance.smembers(ACTIVE_PLAYERS_SET_KEY)}")

        if await redis_instance.llen(QUEUE_KEY) < 2:
            await self.send(text_data=json.dumps({"type": "waiting"}))
            logger.info(f"Player {self.player_id} is waiting for another player (queue length < 2).")
            if self.allow_bot and not hasattr(self, 'bot_task_started'):
                self.bot_task_started = True
                asyncio.create_task(self.bot_match_timeout())
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
        try:
            p1_json, p2_json = await redis_instance.eval(lua_script_pop_two, 1, QUEUE_KEY)
        except Exception as e:
            logger.error(f"Error evaluating lua_script_pop_two: {e}")
            await self.send_error_message("Matchmaking system error. Please try again.")
            return


        if not p2_json:
            # 既に自分がキューにいない可能性もあるが、try_pairを呼び出したプレイヤーへの通知は行う
            current_player_is_waiting = True
            if self.player_id:
                try:
                    # 自分自身がキューの先頭に戻されたか、あるいはまだキューにいるか確認
                    # (ただし、この確認自体が競合の影響を受ける可能性はある)
                    player_meta_self = {"channel": self.channel_name, "player_id": self.player_id}
                    queue_items_json = await redis_instance.lrange(QUEUE_KEY, 0, 0) # キューの先頭だけ確認
                    if queue_items_json and json.loads(queue_items_json[0]) == player_meta_self:
                         logger.info(f"Player {self.player_id} was returned to queue or is still waiting (could not form a pair, p2_json is nil).")
                    else:
                        # 既にマッチングされたか、別の理由でキューからいなくなった可能性
                        logger.info(f"Player {self.player_id} is no longer at the head of the queue or not in queue (p2_json is nil, possibly matched by another process).")
                        current_player_is_waiting = False
                except Exception as e:
                    logger.warning(f"Error checking if player {self.player_id} is still in queue: {e}")

            if current_player_is_waiting:
                 await self.send(text_data=json.dumps({"type": "waiting"}))
            return

        try:
            p1_data = json.loads(p1_json)
            p2_data = json.loads(p2_json)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to decode player data from queue. P1: {p1_json}, P2: {p2_json}. Error: {e}")
            # 問題のデータをキューの末尾に戻し、再試行の機会を与える (ただしループのリスクも考慮)
            # active_players_setからは削除しない (まだマッチングしていないため)
            # この処理はアトミックではないが、エラーリカバリの一環
            if p1_json: await redis_instance.rpush(QUEUE_KEY, p1_json)
            if p2_json: await redis_instance.rpush(QUEUE_KEY, p2_json)
            logger.error("Returned corrupted player data to the end of the queue.")
            await self.send_error_message("Failed to process matchmaking queue. Please try joining again later.")
            return

        # Luaスクリプトでアクティブプレイヤーセットからペアになった2人をアトミックに削除
        lua_script_srem_multi = """
        local active_set = KEYS[1]
        local total_removed = 0
        for i = 1, #ARGV do
            total_removed = total_removed + redis.call('SREM', active_set, ARGV[i])
        end
        return total_removed
        """
        try:
            removed_count = await redis_instance.eval(
                lua_script_srem_multi,
                1, # Number of KEYS
                ACTIVE_PLAYERS_SET_KEY,
                p1_data["player_id"], p2_data["player_id"]
            )
            logger.info(f"Removed {p1_data['player_id']} and {p2_data['player_id']} from active players set (total removed: {removed_count}) after successful pairing (via Lua).")
            if removed_count < 2: # 万が一両方削除できなかった場合
                logger.warning(f"Expected to remove 2 players from active set, but removed {removed_count}. p1: {p1_data['player_id']}, p2: {p2_data['player_id']}")
        except Exception as e:
            logger.error(f"Error removing players from active set via Lua: {e}. Players: {p1_data['player_id']}, {p2_data['player_id']}")
            # この時点でプレイヤーはキューからはPOPされている。アクティブセットからの削除に失敗した場合、
            # 手動でのクリーンアップや、ゲーム開始後に再度削除を試みるなどのリカバリが必要になる可能性がある。
            # ここではエラーをログに残し、処理を続行する。

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
                    meta["channel"], 
                    {
                        "type": "matchDone", 
                        "room_id": room_id,
                        "color": color,
                        "opponent_player_id": opponent_id
                    }
                )
            except Exception as e: # channel_layer.send が失敗するケースも考慮
                logger.error(f"Failed to send matchDone to {meta['player_id']} on channel {meta['channel']}. Error: {e}")
                # ここで失敗した場合のリカバリー策も検討が必要 (例:相手にもキャンセル通知、キューに戻すなど)
                # 今回はログのみ

    async def match_with_bot(self):
        room_id = uuid.uuid4().hex
        bot_player_id = "bot"
        color = "black"
        await self.send(text_data=json.dumps({
            "type": "matched",
            "room_id": room_id,
            "color": color,
            "opponent_player_id": bot_player_id
        }))
        logger.info(f"Player {self.player_id} matched with bot (bot_player) as {color} in room {room_id}.")
    async def bot_match_timeout(self):
        await asyncio.sleep(29 + random.randint(0, 6))
        if await redis_instance.llen(QUEUE_KEY) < 2:
            logger.info(f"Player {self.player_id} is matched with a bot due to timeout.")
            await self.match_with_bot()

    async def matchDone(self, event):
        logger.info(f"Sending 'matched' event to player {self.player_id} (channel: {self.channel_name}). Event: {event}")
        await self.send(text_data=json.dumps({
            "type": "matched",
            "room_id": event["room_id"],
            "color": event["color"],
            "opponent_player_id": event.get("opponent_player_id")
        }))

    async def send_error_message(self, message):
        # player_id が None の可能性も考慮 (connect 直後など)
        player_id_for_log = self.player_id if self.player_id else "Unknown"
        logger.warning(f"Sending error message to player {player_id_for_log} (channel: {self.channel_name}): {message}")
        try:
            await self.send(text_data=json.dumps({
                "type": "error",
                "message": message
            }))
        except Exception as e:
            logger.error(f"Failed to send error message to {self.channel_name}: {e}")