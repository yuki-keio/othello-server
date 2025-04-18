import os
import django_heroku
import dj_database_url
import sentry_sdk
from .base import *
from sentry_sdk.integrations.django import DjangoIntegration

sentry_sdk.init(
    dsn=os.environ['SENTRY_DSN'],
    integrations=[DjangoIntegration()],
    traces_sample_rate=0.2,
    send_default_pii=True,
)

DEBUG = False

ALLOWED_HOSTS = os.getenv('ALLOWED_HOSTS', '127.0.0.1,localhost,reversi.yuki-lab.com').split(',')

# セキュリティ強化
SECURE_BROWSER_XSS_FILTER = True
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

CSP_DEFAULT_SRC = ("'self'",)
CSP_CONNECT_SRC = (
    "'self'",
    "https://www.google.com",
    "https://www.gstatic.com",
    "https://www.googletagmanager.com",
    "https://www.google-analytics.com",
    "https://fundingchoicesmessages.google.com",
    "https://pagead2.googlesyndication.com",
    "https://googleads.g.doubleclick.net",
    "https://ep1.adtrafficquality.google",
    "https://ep2.adtrafficquality.google",
    "https://fonts.googleapis.com/",
    "https://fonts.gstatic.com/",
    "https://cdn.jsdelivr.net/",
    "https://cdnjs.cloudflare.com/",
    "https://*.clarity.ms",
    "https://www.clarity.ms",
)

CSP_SCRIPT_SRC = (
    "'self'",
    "https://www.google.com",
    "https://www.gstatic.com",
    "https://ep2.adtrafficquality.google",
    "https://www.googletagmanager.com",
    "https://pagead2.googlesyndication.com",
    "https://googleads.g.doubleclick.net",
    "https://cdnjs.cloudflare.com",
    "https://cdn.jsdelivr.net",
    "blob:",
    "https://www.clarity.ms",
    "https://js.stripe.com/",
)
CSP_IMG_SRC = (
    "'self'",
    "https://img.moppy.jp",
    "https://www.google.com",
    "https://www.gstatic.com",
    "https://pagead2.googlesyndication.com",
    "https://tpc.googlesyndication.com",
    "https://ep1.adtrafficquality.google",
    "https://*.clarity.ms",
    "https://c.bing.com",
)
CSP_FRAME_SRC = (
    "'self'",
    "https://www.google.com",
    "https://googleads.g.doubleclick.net",
    "https://www.youtube.com",
    "https://securepubads.g.doubleclick.net", 
    "https://ep2.adtrafficquality.google",  
    "https://pagead2.googlesyndication.com",
    "https://js.stripe.com",
)
CSP_STYLE_SRC = (
    "'self'",
    "https://fonts.googleapis.com",
    "https://pagead2.googlesyndication.com",
    "https://reversi.yuki-lab.com/static/",  
    "http://127.0.0.1:8000/static/",  
)
CSP_STYLE_SRC_ATTR = ("'unsafe-inline'",) 
CSP_FONT_SRC = ("'self'", "https://fonts.gstatic.com")

CSP_INCLUDE_NONCE_IN = ("script-src","style-src")# Heroku用の設定を適用
django_heroku.settings(locals())