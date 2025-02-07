from .base import *

# .env を読み込む
load_dotenv()

DEBUG = True
ALLOWED_HOSTS = ["https://othello-d5eeb31e1569.herokuapp.com","127.0.0.1", "localhost"]

INSTALLED_APPS += [
    "debug_toolbar",
]
MIDDLEWARE += [
    "debug_toolbar.middleware.DebugToolbarMiddleware",
]