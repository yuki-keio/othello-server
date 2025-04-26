from django import forms
from django.contrib.auth import get_user_model
from django.contrib.auth.forms import AuthenticationForm, UserCreationForm
from django.utils.translation import gettext_lazy as _

User = get_user_model()

class CustomUserCreationForm(UserCreationForm):
    class Meta:
        model = User
        fields = ("email",) 
        labels = {"email": _("メールアドレス")}

class CustomAuthenticationForm(AuthenticationForm):
    username = forms.EmailField(
        label=_("メールアドレス"),
        widget=forms.EmailInput(attrs={"autofocus": True})
    )