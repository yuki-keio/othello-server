"""config URL Configuration

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/4.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""

from django.contrib import admin
from django.urls import path, include, re_path
from two_factor.urls import urlpatterns as tf_urls
from axes.decorators import axes_dispatch
from django.contrib.auth.views import LoginView

from django.views.static import serve
import os
from django.conf import settings
from django.contrib.sitemaps.views import sitemap
from game.sitemaps import StaticViewSitemap
from django.views.generic.base import RedirectView
from django.conf.urls.i18n import i18n_patterns  
from game.views import game_view, service_worker

sitemaps = {  # ← ここで sitemaps を定義
    'static': StaticViewSitemap(),
}

urlpatterns = [
    path('admin/', include(tf_urls)),  # 2FA付きの管理画面
    path('admin/account/login/', axes_dispatch(LoginView.as_view()), name='login'),  
    path("sw.js", service_worker, name="service_worker"),
    path('', include('game.urls')),
    path('sitemap.xml', sitemap, {'sitemaps': sitemaps}, name='django.contrib.sitemaps.views.sitemap'),
    path('i18n/', include('django.conf.urls.i18n')),
    path(
        "google3cf76dfeb0923fe8.html",
        serve,
        {
            "document_root": os.path.join(settings.BASE_DIR, "game/static/game"),
            "path": "google3cf76dfeb0923fe8.html",
        },
    ),
    re_path(r'^favicon\.ico$', RedirectView.as_view(url=settings.STATIC_URL + 'game/images/favicon/favicon.ico', permanent=True)),
]

urlpatterns += i18n_patterns(

    path('', include('game.urls')),
    prefix_default_language=False
)

if settings.DEBUG:  # デバッグモードのときだけ admin-site を有効化
    urlpatterns += [
        path('admin-site/', admin.site.urls),  # 2FAなしの管理画面（デバッグ用）
    ]