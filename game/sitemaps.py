import os
from django.contrib.sitemaps import Sitemap
from django.urls import reverse
from datetime import datetime

# Djangoプロジェクトのルートディレクトリを取得
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def get_git_lastmod():
    """プロジェクトのルートにある deploy_timestamp.txt から最新コミット日時を取得"""
    deploy_timestamp_path = os.path.join(BASE_DIR, "deploy_timestamp.txt")
    
    try:
        with open(deploy_timestamp_path, "r") as f:
            return datetime.fromisoformat(f.read().strip())
    except (FileNotFoundError, ValueError):
        return datetime.utcnow()  # ファイルがない場合は現在時刻を返す

class StaticViewSitemap(Sitemap):
    changefreq = "daily"
    priority = 0.5        

    def items(self):
        return ['player-mode', 'ai-mode', 'online-mode', 'blog-strategy']
    def lastmod(self, item):
        return get_git_lastmod()