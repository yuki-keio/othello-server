from django.contrib import admin
from django.urls import path, include, re_path
from two_factor.urls import urlpatterns as tf_urls
from axes.decorators import axes_dispatch
from django.contrib.auth.views import LogoutView,PasswordChangeView, PasswordChangeDoneView
from django.views.static import serve
from django.conf import settings
from django.contrib.sitemaps.views import sitemap
from game.sitemaps import StaticViewSitemap
from django.views.generic.base import RedirectView
from django.conf.urls.i18n import i18n_patterns
from game.views import service_worker, signup,premium_status,CreateCheckoutSessionView, premium_intent,payment_success,payment_cancel,stripe_webhook,CreateCustomerPortalSessionView
import os
from game.views import CustomTwoFactorLoginView
from game.views import UserLoginView

sitemaps = {  # ← ここで sitemaps を定義
    'static': StaticViewSitemap(),
}

urlpatterns = [
    path('admin/account/login/', axes_dispatch(CustomTwoFactorLoginView.as_view()), name='login'),
    path('admin/account/', include(tf_urls, namespace='two_factor')),
    path('admin/', admin.site.urls),
    path('api/premium-status/', premium_status, name='premium_status'),
    path('stripe/webhook/', stripe_webhook, name='stripe_webhook'),
    path("sw.js", service_worker, name="service_worker"),
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
    path('login/', axes_dispatch(UserLoginView.as_view()), name='user_login'),
    path('logout/', LogoutView.as_view(), name='user_logout'),
    path('signup/', signup, name='user_signup'),
    path('password_change/', PasswordChangeView.as_view(), name='password_change'),
    path('password_change/done/', PasswordChangeDoneView.as_view(), name='password_change_done'),
    path('api/create-checkout-session/', CreateCheckoutSessionView.as_view(), name='create_checkout_session'),
    path('api/create-customer-portal-session/', CreateCustomerPortalSessionView.as_view(), name='create_customer_portal_session'),
    path('premium-intent/', premium_intent, name='premium_intent'),
    path('success/', payment_success, name='payment_success'),
    path('cancel/', payment_cancel, name='payment_cancel'),
    path('', include('game.urls')),
    prefix_default_language=False
)