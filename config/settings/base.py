import os
from pathlib import Path
from datetime import timedelta
from django.urls import reverse_lazy
from django.utils.translation import gettext_lazy as _

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent.parent

LOCALE_PATHS = [
    os.path.join(BASE_DIR, 'locale'),  
]

# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/4.0/howto/deployment/checklist/

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = os.environ.get("SECRET_KEY")  # 環境変数から取得
DEBUG = os.getenv("DEBUG", "True") == "True"

LOGGING_LEVEL = 'DEBUG' if DEBUG else 'WARNING'

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '[{levelname}] {asctime} {name} - {message}',
            'style': '{',
        },
        'simple': {
            'format': '[{levelname}] {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
            'level': LOGGING_LEVEL,
        },
    },
    'root': {
        'handlers': ['console'],
        'level': LOGGING_LEVEL,
    },
    'loggers': {
        'django': {
            'handlers': ['console'],
            'level': LOGGING_LEVEL,
            'propagate': False,
        },
        'django.channels': {
            'handlers': ['console'],
            'level': LOGGING_LEVEL,
            'propagate': False,
        },
        'django.channels.session': {
            'handlers': ['console'],
            'level': LOGGING_LEVEL,
            'propagate': False,
        },
    },
}

CSP_USE_NONCE = True

CSRF_TRUSTED_ORIGINS = list(filter(None, os.getenv("CSRF_TRUSTED_ORIGINS", "https://127.0.0.1,https://localhost").split(",")))

SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
# Application definition

INSTALLED_APPS = [
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.sitemaps',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'channels',
    "csp",
    'django_otp',
    'django_otp.plugins.otp_totp',
    'django_otp.plugins.otp_static',
    'two_factor',
    'axes',
    'django.contrib.admin',
    'django.contrib.auth',
    'htmlmin',
    'game',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    "whitenoise.middleware.WhiteNoiseMiddleware",
    'django.middleware.gzip.GZipMiddleware',  
    'django.contrib.sessions.middleware.SessionMiddleware',
    'csp.middleware.CSPMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.locale.LocaleMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django_otp.middleware.OTPMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'axes.middleware.AxesMiddleware',
    'htmlmin.middleware.HtmlMinifyMiddleware',
    'htmlmin.middleware.MarkRequestMiddleware',
]

HTML_MINIFY = True
KEEP_COMMENTS_ON_MINIFYING = False
EXCLUDE_FROM_MINIFYING = ('^admin/', '^api/')  # 例: 管理画面とAPI系のURLを除外


# Axesの設定
AXES_FAILURE_LIMIT = 7  # 失敗回数
AXES_LOCK_OUT_AT_FAILURE = True  # 失敗回数超過でロック
AXES_RESET_ON_SUCCESS = True  # 成功したらリセット
AXES_COOLOFF_TIME = timedelta(minutes=10)
AXES_COOLOFF_MESSAGE = _("誤ったログイン情報が7連続で入力されたため、アカウントが10分間ロックされました。しばらくしてから再試行してください。")

LOGIN_URL = reverse_lazy('user_login')
LOGIN_REDIRECT_URL = reverse_lazy('index')
LOGOUT_REDIRECT_URL = reverse_lazy('index')

TWO_FACTOR_CALLABLE_REDIRECT = lambda request: '/admin/' if request.user.is_staff else '/'

AUTH_USER_MODEL = 'game.CustomUser'

ROOT_URLCONF = 'config.urls'

STRIPE_SECRET_KEY = os.getenv('STRIPE_SECRET_KEY')
STRIPE_PUBLIC_KEY = os.getenv('STRIPE_PUBLIC_KEY')
STRIPE_PRICE_ID = os.getenv('STRIPE_PRICE_ID')
STRIPE_WEBHOOK_SECRET = os.getenv('STRIPE_WEBHOOK_SECRET')


TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [os.path.join(BASE_DIR, 'game/templates')],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
                'config.settings.context_processors.timestamp_processor',
                'config.settings.context_processors.debug_processor',
                'config.settings.context_processors.stripe_processor',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

# Database
# https://docs.djangoproject.com/en/4.0/ref/settings/#databases

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}

X_FRAME_OPTIONS = 'DENY'

# Password validation
# https://docs.djangoproject.com/en/4.0/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
        'OPTIONS': {'min_length': 6},
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
]

AUTHENTICATION_BACKENDS = [
    'axes.backends.AxesStandaloneBackend', 
    'django.contrib.auth.backends.ModelBackend',  
]

# Internationalization
# https://docs.djangoproject.com/en/4.0/topics/i18n/

LANGUAGE_CODE = 'ja'

LANGUAGES = [
    ('ja', 'Japanese'),
    ('en', 'English'),
]

TIME_ZONE = 'Asia/Tokyo'

USE_I18N = True
USE_L10N = True
USE_TZ = True

SESSION_COOKIE_AGE = 1209600
SESSION_EXPIRE_AT_BROWSER_CLOSE = False

# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/4.0/howto/static-files/

STATIC_URL = '/static/'

STATIC_ROOT = os.path.join(BASE_DIR, "staticfiles")
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'
WHITENOISE_MAX_AGE = 7884000

STATICFILES_DIRS = [BASE_DIR / "game" / "static"] if DEBUG =="True" else []

# Default primary key field type
# https://docs.djangoproject.com/en/4.0/ref/settings/#default-auto-field

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ASGI 設定
ASGI_APPLICATION = "config.asgi.application"

# Django Channels のチャンネルレイヤー
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {
            "hosts": [
                os.environ.get("CUSTOM_REDIS_URL", "redis://127.0.0.1:6379")
                ],
        },
    },
}