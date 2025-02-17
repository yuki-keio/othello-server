import os
from django.contrib.sitemaps import Sitemap
from django.urls import reverse
from datetime import datetime

class StaticViewSitemap(Sitemap):
    priority = 0.5        

    def items(self):
        """各URLをリストとして返す"""
        return ["player-mode","ai-mode","online-mode","blog-strategy"]

    def location(self, item):
        return reverse(item)

    def lastmod(self, item):
        """Gitの最新コミット日を `datetime.date` 型で返す"""
        return self.get_git_lastmod().date()  

    @staticmethod
    def get_git_lastmod():
        """Gitの最新コミット日を取得"""
        BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        deploy_timestamp_path = os.path.join(BASE_DIR, "deploy_timestamp.txt")

        try:
            with open(deploy_timestamp_path, "r") as f:
                return datetime.fromisoformat(f.read().strip())  # `datetime.datetime` 型で返す
        except (FileNotFoundError, ValueError):
            return datetime.utcnow()