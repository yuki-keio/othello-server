from django.shortcuts import render, redirect
from urllib.parse import urlencode
from django.http import HttpResponse
import logging
from django.utils.translation import get_language

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

def robots_txt(request):
    content = """User-agent: *
Disallow:

Sitemap: https://reversi.yuki-lab.com/sitemap.xml
"""
    return HttpResponse(content, content_type="text/plain")