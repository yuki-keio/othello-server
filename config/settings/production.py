import os
import django_heroku
import dj_database_url
from .base import *



DEBUG = False

ALLOWED_HOSTS = os.getenv('ALLOWED_HOSTS', '').split(',')



# セキュリティ強化
SECURE_BROWSER_XSS_FILTER = True
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

# Heroku用の設定を適用
django_heroku.settings(locals())