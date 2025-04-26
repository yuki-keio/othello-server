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

logger = logging.getLogger(__name__)

def index(request):
    return render(request, "game/index.html", {"mode": 'player' })

def game_view(request, mode=None):

    logger.info(f"Current language: {get_language()}")
    logger.info(f"Request LANGUAGE_CODE: {request.LANGUAGE_CODE}")
    query_mode = request.GET.get('mode')

    # `/player/` へのアクセスを `/` へリダイレクト
    if request.path == "/player/":
        return redirect("/", permanent=True)

    # query_mode が指定されている場合のみリダイレクト
    if query_mode in ["online", "ai", "player"]:
        query_params = request.GET.dict()  # QueryDict → 辞書に変換
        query_params.pop("mode", None)  # mode パラメータを削除

        # リダイレクト先を決定（ここで mode ではなく query_mode を使う）
        if query_mode == "online":
            new_url = "/online/"
        elif query_mode == "ai":
            new_url = "/ai/"
        elif query_mode == "player":
            new_url = "/"

        # 他のクエリパラメータがある場合、それを新しいURLに付加
        if query_params:
            new_url += f"?{urlencode(query_params)}"

        return redirect(new_url, permanent=True)

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
            print(f"[Signup] {form.cleaned_data['email']} signup success. related data: {form.cleaned_data}, {form.errors}, redirect('user-login'): {redirect('user_login')}")
            return redirect('user_login')
        else:
            logger.warning(f"Form not valid: {form.errors}")
    else:
        form = CustomUserCreationForm()
        print(f"[Signup] GET request. not post. Form: {form}")
    return render(request, 'game/signup.html', {'form': form})

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

class CustomTwoFactorLoginView(TwoFactorLoginView):
    def get_success_url(self):
        if self.request.user.is_staff:
            return '/admin/'
        else:
            return '/'
class UserLoginView(LoginView):

    def form_valid(self, form):
        user = form.get_user()
        print(f"[Login] {user.email} login success.")
        if user.is_staff:
            print("[Login] Staff user attempted to log in without 2FA.")
            return redirect('/login/') # リダイレクトでログインを拒否
        response = super().form_valid(form)
        print(f"[Login] Redirecting to: {response['Location']}, response: {response}")
        return response