# リバーシ （インクルーシブデザイン）

![ゲーム画面](https://reversi.yuki-lab.com/static/game/images/share-image.webp)

## 公開サーバー
● **こちらから遊べます:** [https://reversi.yuki-lab.com](https://reversi.yuki-lab.com)

🌐 このオセロゲームをブラウザからプレイできます！ぜひお試しください。

## ライセンス
このプロジェクトは MIT ライセンスの下で公開されています。  
著作権は以下の通りです：

**© 2025 Yuki Ichida (Japan Neurodiversity Association)**  
🔗 **Website:** [https://dioden.org](https://dioden.org)  

本ソフトウェアを使用する際は、この著作権表示をそのまま保持してください。

## 使用技術

### フロントエンド
 - HTML
 - CSS：ユニバーサルデザインを採用しています
 - JavaScript：αβ法を用いてAI対戦機能を構築

### バックエンド
 - Python (Django)：オンライン対戦機能を実装
   - Django Channels：WebSocketを用いたリアルタイム通信を実現

### インフラ
 - Heroku：本番環境へのデプロイ
 - Cloudflare：DNS管理

### その他
 - Google Analytics：ユーザー行動の分析
 - AdSense：広告配信による収益化
 - Django Internationalization (i18n)：英語への対応