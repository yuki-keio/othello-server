import subprocess
from django.contrib.sitemaps import Sitemap
from django.urls import reverse
from datetime import datetime

def get_git_lastmod():
    """最新のGitコミット日を取得する"""
    try:
        last_commit_date = subprocess.check_output(
            ["git", "log", "-1", "--format=%cd", "--date=iso-strict"]
        ).decode("utf-8").strip()
        return datetime.fromisoformat(last_commit_date)
    except Exception as e:
        print(f"Error getting last commit date: {e}")
        return datetime.utcnow()  # 取得できない場合は現在時刻を返す

class StaticViewSitemap(Sitemap):
    priority = 0.5        

    def items(self):
        return ['player-mode', 'ai-mode', 'online-mode', 'blog-strategy']

    def location(self, item):
        return reverse(item)

    def lastmod(self, item):
        return get_git_lastmod()