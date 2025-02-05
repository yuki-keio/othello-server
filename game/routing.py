from django.urls import re_path
from .consumers import OthelloConsumer

websocket_urlpatterns = [
    re_path(r"ws/othello/(?P<room_name>\w+)/$", OthelloConsumer.as_asgi()),
]