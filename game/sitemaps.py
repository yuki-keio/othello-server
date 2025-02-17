import os
from django.contrib.sitemaps import Sitemap
from django.urls import reverse
from datetime import datetime

class StaticViewSitemap(Sitemap):
    changefreq = "daily"
    priority = 0.5        

    def items(self):
        """各URLをリストとして返す"""
        return [
            {"url": reverse("player-mode")},
            {"url": reverse("ai-mode")},
            {"url": reverse("online-mode")},
            {"url": "/strategy-reversi-othello.html"},  # 静的ページ
        ]

    def location(self, item):
        """URLをそのまま返す"""
        return item["url"]

    def lastmod(self, item):
        """ISO 8601形式でGitの最新コミット日を返す"""
        return self.get_git_lastmod().isoformat()

    @staticmethod
    def get_git_lastmod():
        """Gitの最新コミット日を取得"""
        BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        deploy_timestamp_path = os.path.join(BASE_DIR, "deploy_timestamp.txt")

        try:
            with open(deploy_timestamp_path, "r") as f:
                return datetime.fromisoformat(f.read().strip())
        except (FileNotFoundError, ValueError):
            return datetime.utcnow()