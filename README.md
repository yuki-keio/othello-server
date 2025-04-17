# リバーシ （インクルーシブデザイン）

![ゲーム画面](https://reversi.yuki-lab.com/static/game/images/share-image.webp)

## 公開サーバー
● **こちらから遊べます:** [https://reversi.yuki-lab.com](https://reversi.yuki-lab.com)

🌐 このオセロゲームをブラウザからプレイできます！ぜひお試しください。

## ライセンス
このプロジェクトは MIT ライセンスの下で公開されています。
著作権は以下の通りです：

**© 2025 Yuki Ichida (Japan Neurodiversity Association / Yuki-Lab)**
🔗 **Japan Neurodiversity Association:** [https://dioden.org](https://dioden.org)
🔗 **Yuki-Lab:** [https://yuki-lab.com](https://yuki-lab.com)

本ソフトウェアを使用する際は、この著作権表示をそのまま保持してください。

## 使用技術

### フロントエンド
 - HTML：非同期での読み込みにより高速化
 - CSS：UDフォントの採用やAltの追加など、インクルーシブデザインを意識しています。
 - JavaScript：αβ法を用いてAI対戦機能を構築

### バックエンド
 - Python (Django)：オンライン対戦機能を実装
   - Django Channels：WebSocketを用いたリアルタイム通信を実現
 - Redis：ゲームの状態を管理

### インフラ
 - Heroku：本番環境へのデプロイ
 - Cloudflare：DNS管理

### その他
 - Google Analytics + Microsoft Clarity：ユーザー行動の分析
 - Google Search Console + Bing Webmaster Tools：SEO対策
 - Google AdSense：広告配信による収益
 - Stripe：決済機能の実装
 - Django Internationalization (i18n)：日本語・英語の両方に対応