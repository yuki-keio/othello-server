from django.shortcuts import render, redirect
from urllib.parse import urlencode
from django.http import HttpResponse

def index(request):
    return redirect('ai-mode')

def game_view(request, mode=None):
    query_mode = request.GET.get('mode')

    # query_mode が指定されている場合のみリダイレクト
    if query_mode in ["online", "ai", "player"]:
        query_params = request.GET.dict()  # QueryDict → 辞書に変換
        query_params.pop("mode", None)  # mode パラメータを削除

        # リダイレクト先を決定（ここで mode ではなく query_mode を使う）
        if query_mode == "online":
            new_url = "/online/"
        elif query_mode == "ai":
            new_url = "/ai/"
        else:
            new_url = "/player/"

        # 他のクエリパラメータがある場合、それを新しいURLに付加
        if query_params:
            new_url += f"?{urlencode(query_params)}"

        return redirect(new_url, permanent=True)

    # mode パラメータがない場合は通常のページ表示
    return render(request, "game/index.html", {"mode": mode})


def robots_txt(request):
    content = """User-agent: *
Disallow:

Sitemap: https://reversi.yuki-lab.com/sitemap.xml
"""
    return HttpResponse(content, content_type="text/plain")