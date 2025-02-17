import subprocess
import os
from django.contrib.sitemaps import Sitemap
from django.urls import reverse
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def get_git_lastmod(filepath):
    """特定のファイルの最新変更日を Git から取得"""
    try:
        file_path = os.path.join(BASE_DIR, "../", filepath)  # プロジェクトルートからのパス
        last_commit_date = subprocess.check_output(
            ["git", "log", "-1", "--format=%cd", "--date=iso-strict", "--", file_path]
        ).decode("utf-8").strip()
        return datetime.fromisoformat(last_commit_date)
    except Exception as e:
        print(f"Error getting last commit date for {filepath}: {e}")
        return datetime.utcnow()  # 取得できない場合は現在時刻を返す

class StaticViewSitemap(Sitemap):
    priority = 0.5        

    def items(self):
        return [
            ('player-mode', "templates/game/player.html"),
            ('ai-mode', "templates/game/ai.html"),
            ('online-mode', "templates/game/online.html"),
            ('blog-strategy', "templates/game/strategy-reversi-othello.html"),
        ]

    def location(self, item):
        """URL を適切に出力"""
        if item[0] == 'blog-strategy':
            return 'https://reversi.yuki-lab.com/strategy-reversi-othello.html'
        return f'https://reversi.yuki-lab.com{reverse(item[0])}'

    def lastmod(self, item):
        """最終更新日を ISO 8601 形式 (YYYY-MM-DDTHH:MM:SS+TZ) で返す"""
        lastmod_date = get_git_lastmod(item[1])
        return lastmod_date.isoformat()  # Google 用に時間情報も含める