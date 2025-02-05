from .base import *

DEBUG = True
ALLOWED_HOSTS = ["127.0.0.1", "localhost"]

INSTALLED_APPS += [
    "debug_toolbar",
]
MIDDLEWARE += [
    "debug_toolbar.middleware.DebugToolbarMiddleware",
]