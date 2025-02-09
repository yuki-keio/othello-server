web_othello/
│── venv/                     # 仮想環境（この中にPython・パッケージが入る）
│── manage.py                  # Djangoのエントリーポイント
│── .env                        # 環境変数（SECRET_KEYなど）
│── .gitignore                  # Gitで管理しないファイルの指定
│── LICENSE                    # ライセンス
│── README.md                    # READMEファイル
│── .python-version                    # Pythonのバージョン指定
│── requirements.txt            # 必要なPythonライブラリ一覧
│── db.sqlite3                  # SQLiteのDBファイル（または他のDBを使用）
│
├── config/                   # 設定ファイル
│   ├── __init__.py
│   ├── settings/
│   │   ├── __init__.py
│   │   ├── base.py           # 共通設定
│   │   ├── local.py          # 開発環境向け設定
│   │   ├── production.py     # 本番環境向け設定
│   ├── urls.py
│   ├── asgi.py
│   ├── wsgi.py
│
├── game/                        # アプリケーションフォルダ（オセロのロジック）
│   ├── __init__.py
│   ├── apps.py
│   ├── models.py                # ゲームのデータモデル
│   ├── views.py                 # 通常のDjangoビュー（API用）
│   ├── urls.py                  # ルーティング
│   ├── admin.py                 # Djangoの管理画面設定
│   ├── consumers.py             # WebSocket用のConsumer
│   ├── routing.py               # WebSocketのルーティング
│   ├── services.py              # ゲームロジックを切り出す
│   ├── tests.py                 # ユニットテスト
│   ├── migrations/              # DBマイグレーションファイル
│   ├── templates/               # HTMLテンプレート（フロントエンド）
│   │   ├── game/
│   │   │   ├── index.html
│   │   │   ├── room.html
│   │   │   ├── result.html
│   │   ├── base.html             # 共通テンプレート
│   ├── static/                   # 静的ファイル（CSS, JS, 画像）
│   │   ├── game/
│   │   │   ├── style.css
│   │   │   ├── sw.js
│   │   │   ├── script.js
│   │   │   ├── sounds/
│   │   │   │   ├── place-stone.mp3
│   │   │   │   ├── victory.mp3
│   │   │   │   ├── defeat.mp3
│   │   │   ├── images/
│   │   │   │   ├── copy.png
│   │   │   │   ├── share-image.png
│   │   │   │   ├── setting.svg
│   │   │   │   ├── favicon/
│
├── staticfiles/                 # `collectstatic` で集めた静的ファイル（本番環境用）
├── logs/                        # ログファイルの保存ディレクトリ
│   ├── django.log
│   ├── error.log
│
└── docs/                        # ドキュメント（API仕様・設計書）
    ├── ARCHITECTURE.md