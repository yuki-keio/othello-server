from django.shortcuts import render, redirect
from urllib.parse import urlencode
from django.http import HttpResponse
import logging
from django.utils.translation import get_language
import os
from django.conf import settings
from .forms import CustomUserCreationForm
from two_factor.views import LoginView as TwoFactorLoginView
from django.contrib.auth.views import LoginView
from django.http import JsonResponse
from django.views import View
import stripe
from django.views.decorators.csrf import csrf_exempt
from game.models import CustomUser
from django.contrib.auth.decorators import login_required
from django.utils.translation import gettext as _
from django.utils.decorators import method_decorator
from django.template.loader import render_to_string

logger = logging.getLogger(__name__)

def index(request):
    return render(request, "game/index.html", {"mode": 'player' })

def game_view(request, mode=None):
    if request.path == "/player/":
        return redirect("/", permanent=True)
    return render(request, "game/index.html", {"mode": mode })

def othello_view(request):
    return render(request, "game/strategy-reversi-othello.html")

def offline_view(request):
    return render(request, "game/offline.html")

def signup(request):
    if request.method == 'POST':
        form = CustomUserCreationForm(request.POST)
        if form.is_valid():
            form.save()
            return redirect('user_login')
        else:
            logger.warning(f"Form not valid: {form.errors}")
    else:
        form = CustomUserCreationForm()
    return render(request, 'game/signup.html', {'form': form})
@login_required
def premium_intent(request):
    """ログイン後に課金処理を開始するための中間ページ"""
    return render(request, 'game/premium_intent.html')
def payment_success(request):
    return render(request, 'game/payment_success.html')
def payment_cancel(request):
    return render(request, 'game/payment_cancel.html')
def auth_status(request):
    return JsonResponse({'is_authenticated': request.user.is_authenticated})
def premium_status(request):
    if request.user.is_authenticated:
        return JsonResponse({'is_premium': request.user.subscription_type != 'none'})
    else:
        return JsonResponse({'is_premium': False})
def service_worker(request):
    """Service Worker ファイルを提供"""
    sw_path = os.path.join(settings.BASE_DIR, "game/static/game/sw.js")
    with open(sw_path, "r", encoding="utf-8") as sw_file:
        response = HttpResponse(sw_file.read(), content_type="application/javascript; charset=utf-8")
        response["Service-Worker-Allowed"] = "/"
        return response

def robots_txt(request):
    content = """User-agent: *
Disallow:

Sitemap: https://reversi.yuki-lab.com/sitemap.xml
"""
    return HttpResponse(content, content_type="text/plain")

def manifest(request):
    user_lang = request.LANGUAGE_CODE  # i18nのミドルウェアが有効ならこれでOK
    content = render_to_string('game/manifest.json', {
        'lang': user_lang
    })
    return HttpResponse(content, content_type='application/manifest+json')

stripe.api_key = settings.STRIPE_SECRET_KEY

@method_decorator(login_required, name='dispatch')
class CreateCheckoutSessionView(View):
    def post(self, request, *args, **kwargs):
        if request.user.subscription_type != 'none':
            return JsonResponse({'error': _('ご契約済みのサブスクリプションが適用されました')}, status=400)
        l_prefix = get_language()
        l_prefix = "" if l_prefix == 'ja' else ("/"+l_prefix)
        checkout_params = {
            'payment_method_types': ['card'],
            'line_items': [{
                'price': settings.STRIPE_PRICE_ID,
                'quantity': 1,
            }],
            'mode': 'subscription',
            'success_url': request.build_absolute_uri(f"{l_prefix}/success/"),
            'cancel_url': request.build_absolute_uri(f"{l_prefix}/cancel/"),
        }
        if request.user.stripe_customer_id:
            checkout_params['customer'] = request.user.stripe_customer_id
        else:
            checkout_params['customer_email'] = request.user.email
        session = stripe.checkout.Session.create(**checkout_params)
        return JsonResponse({'id': session.id})

class CreateCustomerPortalSessionView(View):
    def post(self, request, *args, **kwargs):
        stripe.api_key = settings.STRIPE_SECRET_KEY
        l_prefix = get_language()
        l_prefix = "" if l_prefix == 'ja' else (l_prefix + "/")
        # Stripe Customer IDを取得（必要ならDBに保存しておくと良い）
        customer_id = request.user.stripe_customer_id

        session = stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=request.build_absolute_uri(f"/{l_prefix}"),
        )
        return JsonResponse({'url': session.url})

@csrf_exempt
def stripe_webhook(request):
    payload = request.body
    sig_header = request.META.get('HTTP_STRIPE_SIGNATURE')
    endpoint_secret = settings.STRIPE_WEBHOOK_SECRET
    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, endpoint_secret
        )
    except ValueError:
        return HttpResponse(status=400)
    except stripe.error.SignatureVerificationError:
        return HttpResponse(status=400)

    # サブスク開始
    if event['type'] == 'checkout.session.completed':
        session = event['data']['object']
        email = session.get('customer_email')
        if email:
            try:
                user = CustomUser.objects.get(email=email)
                user.stripe_customer_id = session["customer"]
                user.subscription_type = 'monthly' # 課金ステータス更新
                user.save()
            except CustomUser.DoesNotExist:
                logger.error(f"User with email {email} does not exist.")
    elif event['type'] == 'invoice.payment_failed':
        invoice = event['data']['object']
        customer_id = invoice['customer']
        try:
            user = CustomUser.objects.get(stripe_customer_id=customer_id)
            user.subscription_type = 'none'
            user.save()
        except CustomUser.DoesNotExist:
            logger.error(f"No user with customer_id {customer_id}")

    # サブスク停止
    elif event['type'] == 'customer.subscription.deleted':
        subscription = event['data']['object']
        customer_id = subscription['customer']
        try:
            user = CustomUser.objects.get(stripe_customer_id=customer_id)
            user.subscription_type = 'none'
            user.save()
        except CustomUser.DoesNotExist:
            logger.error(f"No user with customer_id {customer_id}")
    return HttpResponse(status=200)

class CustomTwoFactorLoginView(TwoFactorLoginView):
    def get_success_url(self):
        if self.request.user.is_staff:
            return '/admin/'
        else:
            return '/'

class UserLoginView(LoginView):
    def form_valid(self, form):
        user = form.get_user()
        if user.is_staff:
            return redirect('/login/') # リダイレクトでログインを拒否
        return super().form_valid(form)