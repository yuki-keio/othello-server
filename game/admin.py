from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import CustomUser

@admin.register(CustomUser)
class CustomUserAdmin(UserAdmin):
    model = CustomUser
    list_display = ('email', 'display_name', 'is_staff', 'is_active', 'subscription_type', 'subscription_expiry', 'role_level', 'ban_status', 'rating')
    list_filter = ('is_staff', 'is_active', 'subscription_type', 'role_level', 'ban_status')
    search_fields = ('email', 'display_name')
    ordering = ('email',)

    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        ('課金情報', {'fields': ('subscription_type', 'subscription_expiry')}),
        ('ゲーム情報', {'fields': ('display_name', 'highest_ai_level', 'rating')}),
        ('権限', {'fields': ('is_staff', 'is_active', 'is_superuser', 'role_level', 'groups', 'user_permissions')}),
        ('BAN情報', {'fields': ('ban_status', 'reserved1', 'reserved2', 'reserved3', 'reserved4', 'reserved5')}),
    )

    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('email', 'password1', 'password2', 'is_staff', 'is_active')}
        ),
    )