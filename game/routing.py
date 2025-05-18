from django.urls import re_path, path
from .consumers import OthelloConsumer
from .matching_consumer import MatchConsumer

websocket_urlpatterns = [
    re_path(r"ws/othello/(?P<room_name>[-\w]+)/$", OthelloConsumer.as_asgi()),
    path("ws/match/", MatchConsumer.as_asgi()),
]