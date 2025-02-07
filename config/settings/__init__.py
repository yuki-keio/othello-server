import os

DJANGO_SETTINGS_MODULE = os.getenv("DJANGO_SETTINGS_MODULE", "config.settings.local")