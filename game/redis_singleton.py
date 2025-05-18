import redis.asyncio as aioredis
import os
from django.conf import settings
import logging

logger = logging.getLogger(__name__)
SSL_ARGUMENT = "" if settings.DEBUG else "?ssl_cert_reqs=none"

# Redis接続プールを管理する共有インスタンスを作成
# アプリケーション全体でこのインスタンスを再利用する
try:
    # 環境変数からRedis URLを取得、なければデフォルトを使用
    redis_url = os.environ.get("REDIS_URL", "redis://127.0.0.1:6379") + SSL_ARGUMENT
    redis_instance = aioredis.from_url(
        redis_url,
        decode_responses=True,
    )
    logger.info(f"Successfully created shared Redis connection pool for {redis_url}.")
except Exception as e:
    logger.error(f"Failed to create shared Redis connection pool for {redis_url}: {e}")
    # Redisが利用不可の場合、Noneを設定
    redis_instance = None