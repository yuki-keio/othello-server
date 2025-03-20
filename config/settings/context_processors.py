import os
from django.conf import settings

def timestamp_processor(request):
    deploy_timestamp_path = os.path.join(settings.BASE_DIR, "deploy_timestamp.txt")

    if os.path.exists(deploy_timestamp_path):
        with open(deploy_timestamp_path, "r") as f:
            timestamp = f.read().strip()
    else:
        timestamp = "0"

    return {"TIMESTAMP": timestamp}