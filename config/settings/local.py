from .base import *

# .env を読み込む
load_dotenv()

DEBUG = True


ALLOWED_HOSTS = list(filter(None, os.getenv("ALLOWED_HOSTS", "127.0.0.1,localhost").split(",")))

INSTALLED_APPS += [
    "debug_toolbar",
]
MIDDLEWARE += [
    "debug_toolbar.middleware.DebugToolbarMiddleware",
]