from django.urls import path
from . import views

urlpatterns = [
    path('', views.index, name='index'),
    path('player/', views.game_view, {'mode': 'player'}, name='player-mode'),
    path('ai/', views.game_view, {'mode': 'ai'}, name='ai-mode'),
    path('online/', views.game_view, {'mode': 'online'}, name='online-mode'),
    path('robots.txt', views.robots_txt, name='robots-txt'),
    path("strategy-reversi-othello.html", views.othello_view, name="blog-strategy"),
    path("offline.html", views.offline_view, name="offline"),
]