from django.contrib.auth.models import AbstractUser
from django.db import models
from django_otp.plugins.otp_totp.models import TOTPDevice  # 変更: TOTPDeviceを使用
from django.utils.translation import gettext_lazy as _
from django.contrib.auth.models import BaseUserManager

class CustomUserManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('メールアドレスは必須です')
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('display_name', 'Admin')

        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superuser must have is_staff=True.')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser must have is_superuser=True.')
        return self.create_user(email, password, **extra_fields)


SUBSCRIPTION_CHOICES = [
    ('monthly', _('月単位')),
    ('yearly', _('年単位')),
    ('none', _('なし')),
    ('lifetime', _('買い切り'))
]

class CustomUser(AbstractUser):
    """カスタムユーザーモデル"""

    _otp_device = None

    objects = CustomUserManager()

    username = None
    email = models.EmailField(_('メールアドレス'), unique=True)

    # 課金関連
    subscription_type = models.CharField(
        max_length=10,
        choices=SUBSCRIPTION_CHOICES,
        default='none'
    )

    # ゲーム関連
    display_name = models.CharField(max_length=30, default="unknown")
    highest_ai_level = models.IntegerField(default=1)

    # 権限・管理
    role_level = models.IntegerField(default=1)  # 1:ユーザー, 2:管理者, 他

    # 対戦
    rating = models.IntegerField(default=1500, db_index=True)

    # BAN 状態
    ban_status = models.IntegerField(default=0)  # 0:正常, 1〜:警告, 999:永久BAN
    
    stripe_customer_id = models.CharField(max_length=255, blank=True, null=True)

    reserved1 = models.CharField(max_length=100, blank=True, null=True, db_index=True)
    reserved2 = models.CharField(max_length=100, blank=True, null=True)
    reserved3 = models.CharField(max_length=100, blank=True, null=True)
    reserved4 = models.CharField(max_length=100, blank=True, null=True)
    reserved5 = models.CharField(max_length=100, blank=True, null=True)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = []

    def is_verified(self):
        """OTPデバイスが有効かどうかを判定（メソッドとして定義）"""
        return self.otp_device is not None  # Django-OTP のデバイスがあるかをチェック

    @property
    def otp_device(self):
        """このユーザーが設定しているOTPデバイスを取得"""
        if not hasattr(self, '_otp_device') or self._otp_device is None:
            self._otp_device = TOTPDevice.objects.filter(user=self, confirmed=True).first()  # 変更: Device → TOTPDevice
        return self._otp_device

    @otp_device.setter
    def otp_device(self, device):
        """OTPデバイスをセットできるようにする"""
        self._otp_device = device

    def __str__(self):
        return self.email