import os
from django.contrib.sitemaps import Sitemap
from django.urls import reverse
from datetime import datetime
from django.conf import settings

class StaticViewSitemap(Sitemap):
    priority = 0.5
    changefreq = 'monthly'

    i18n = True
    alternates = True

    def items(self):
        """各URLをリストとして返す"""
        return ["index", "ai-mode", "online-mode", "blog-strategy"]

    def location(self, item):
        return reverse(item)

    def priority(self, item):
        """ホームページのみ優先度を0.8に、それ以外は0.5"""
        return 0.8 if item == "index" else 0.5

    def lastmod(self, item):
        """Gitの最新コミット日を `datetime.date` 型で返す"""
        return self.get_git_lastmod().date()  

    @staticmethod
    def get_git_lastmod():
        """Gitの最新コミット日を取得"""
        deploy_timestamp_path = os.path.join(settings.BASE_DIR, "deploy_timestamp.txt")

        try:
            with open(deploy_timestamp_path, "r") as f:
                return datetime.fromisoformat(f.read().strip())  # `datetime.datetime` 型で返す
        except (FileNotFoundError, ValueError):
            return datetime.utcnow()