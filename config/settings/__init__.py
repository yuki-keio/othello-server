import os

DJANGO_SETTINGS_MODULE = os.getenv("DJANGO_SETTINGS_MODULE", "config.settings.local")

if DJANGO_SETTINGS_MODULE == 'config.settings.local':
    print("local")
    from .local import *
else:
    print("production")
    from .production import *
