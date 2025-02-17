# game/sitemaps.py
from django.contrib.sitemaps import Sitemap
from django.urls import reverse

class StaticViewSitemap(Sitemap):
    changefreq = "monthly"  # 更新頻度の目安
    priority = 0.5          # ページの重要度（0～1）

    def items(self):
        # ここでURLの名前（urls.py で定義した name）をリストで返す
        return ['player-mode', 'ai-mode', 'online-mode', 'blog-strategy']

    def location(self, item):
        return reverse(item)