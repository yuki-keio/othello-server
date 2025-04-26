from django.test import TestCase
from .models import CustomUser  # テスト対象のモデルをインポート

class CustomUserModelTest(TestCase):
    def setUp(self):
        # テスト前の準備
        CustomUser.objects.create(email='test@example.com', display_name='TestUser')

    def test_user_creation(self):
        user = CustomUser.objects.get(email='test@example.com')
        self.assertEqual(user.display_name, 'TestUser')