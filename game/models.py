from django.contrib.auth.models import AbstractUser
from django.db import models
from django_otp.plugins.otp_totp.models import TOTPDevice  # 変更: TOTPDeviceを使用

class CustomUser(AbstractUser):
    """カスタムユーザーモデル"""

    _is_otp_verified = models.BooleanField(default=False)
    _otp_device = None  # 追加：OTPデバイスを一時的に保持

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