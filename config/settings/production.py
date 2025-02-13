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

# CSPの設定
CSP_DEFAULT_SRC = ("'self'",)
CSP_CONNECT_SRC = (
    "'self'",
    "https://www.google.com",
    "https://www.gstatic.com",
    "https://www.googletagmanager.com",
    "https://pagead2.googlesyndication.com",
    "https://googleads.g.doubleclick.net",
    "https://ep1.adtrafficquality.google",
)

CSP_SCRIPT_SRC = (
    "'self'",
    "'nonce-{request.csp_nonce}'",
    "https://www.google.com",
    "https://www.gstatic.com",
    "https://www.googletagmanager.com",
    "https://pagead2.googlesyndication.com",
    "https://googleads.g.doubleclick.net",
    "https://cdnjs.cloudflare.com",
    "https://cdn.jsdelivr.net",  
)
CSP_IMG_SRC = (
    "'self'",
    "https://img.moppy.jp",
    "https://www.google.com",
    "https://www.gstatic.com",
    "https://pagead2.googlesyndication.com",
    "https://tpc.googlesyndication.com",
)
CSP_FRAME_SRC = (
    "'self'",
    "https://www.google.com",
    "https://googleads.g.doubleclick.net",
    "https://www.youtube.com",
    "https://securepubads.g.doubleclick.net",  
)
CSP_STYLE_SRC = (
    "'self'",
    "'nonce-{request.csp_nonce}'", 
    "https://fonts.googleapis.com",
    "https://pagead2.googlesyndication.com",
    "https://yuki-lab.com/static/",  
    "http://127.0.0.1:8000/static/",  
)
CSP_FONT_SRC = ("'self'", "https://fonts.gstatic.com")

# Middlewareに追加
MIDDLEWARE += ["csp.middleware.CSPMiddleware"]

# Heroku用の設定を適用
django_heroku.settings(locals())