import os

DJANGO_SETTINGS_MODULE = os.getenv("DJANGO_SETTINGS_MODULE", "config.settings.local")

if DJANGO_SETTINGS_MODULE == 'local':
    from .local import *
else:
    from .production import *
