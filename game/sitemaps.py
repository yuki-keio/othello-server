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
        return ["index", "ai-mode", "online-mode", "blog-strategy", "legacy-keio-url"]

    def location(self, item):
        if item == "legacy-keio-url":
            return "https://web.sfc.keio.ac.jp/~t21055yi/othello/"
        return reverse(item)

    def priority(self, item):
        """ホームページのみ優先度を0.8に、それ以外は0.5。legacy-keio-urlは0.3"""
        if item == "index":
            return 0.8
        elif item == "legacy-keio-url":
            return 0.3
        else:
            return 0.5

    def lastmod(self, item):
        """Gitの最新コミット日を `datetime.date` 型で返す。legacy-keio-urlはNone"""
        if item == "legacy-keio-url":
            return None
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