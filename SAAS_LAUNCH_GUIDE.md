# Sequlia SaaS ローンチガイド

本番環境はFly.ioにデプロイ済み（https://seculens.fly.dev）。
SaaSとして実運用するには、以下の3つの環境変数セットアップが必要です。

---

## 🔑 必要な作業（合計15〜20分）

### 1. AUTH_SECRET の設定（必須・3分）

セッショントークン（JWT）の署名キー。長くてランダムな文字列を1つ作って設定するだけ。

PowerShellで以下を実行：

```powershell
$secret = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 64 | ForEach-Object { [char]$_ })
flyctl secrets set --app seculens AUTH_SECRET="$secret"
```

これでセッション暗号化キーが本番にセットされます。

---

### 2. Stripe アカウント + 商品登録（必須・10〜15分）

#### A. Stripeアカウント作成
1. https://stripe.com でアカウント作成
2. テストモードのまま作業（本番有効化は後でOK）
3. ダッシュボード右上「テスト環境」のままで進める

#### B. 商品登録（2つ作る）

**Standard プラン（¥4,980/月）**
1. ダッシュボード → 商品カタログ → 商品を追加
2. 名前: `Sequlia Standard`
3. 価格: ¥4,980 / 月（継続）/ JPY
4. 保存後、Price ID（`price_xxxxx`）をコピー

**Pro プラン（¥19,800/月）**
1. 同様に商品追加
2. 名前: `Sequlia Pro`
3. 価格: ¥19,800 / 月（継続）/ JPY
4. Price ID をコピー

#### C. APIキーを取得
1. ダッシュボード → 開発者 → APIキー
2. **シークレットキー**（`sk_test_xxxxx`）をコピー

#### D. Webhook設定
1. ダッシュボード → 開発者 → Webhook
2. エンドポイント追加: `https://seculens.fly.dev/api/stripe/webhook`
3. 監視するイベント:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
4. **署名シークレット**（`whsec_xxxxx`）をコピー

#### E. Fly.ioに環境変数をセット

PowerShellで（コピペした値を当てはめる）:

```powershell
flyctl secrets set --app seculens `
  STRIPE_SECRET_KEY="sk_test_xxxxxxx" `
  STRIPE_WEBHOOK_SECRET="whsec_xxxxxxx" `
  STRIPE_PRICE_STANDARD="price_xxxxxxx" `
  STRIPE_PRICE_PRO="price_xxxxxxx" `
  APP_BASE_URL="https://seculens.fly.dev"
```

---

### 3. （オプション）独自ドメイン設定

ドメイン取得後（`sequlia.com` 等）：

```powershell
flyctl certs create sequlia.com --app seculens
flyctl certs create www.sequlia.com --app seculens
flyctl certs show sequlia.com --app seculens  # DNSレコードを表示
```

→ ドメインレジストラの管理画面で表示されたAレコード/AAAAレコードを設定。
→ `APP_BASE_URL` を `https://sequlia.com` に変更:

```powershell
flyctl secrets set --app seculens APP_BASE_URL="https://sequlia.com"
```

→ Stripe WebhookのURLも `https://sequlia.com/api/stripe/webhook` に変更。

---

## ✅ 動作確認

1. https://seculens.fly.dev にアクセス
2. 右上「無料登録」→ 新規アカウント作成
3. ダッシュボードで使用状況確認（3/月）
4. `/pricing` で「Standard プラン」をクリック
5. Stripeテストカード `4242 4242 4242 4242` で決済
6. 課金成功 → プランが`standard`に切り替わる

---

## 🆘 困ったら

- アプリのログ確認: `flyctl logs --app seculens`
- 直接DBアクセス: `flyctl postgres connect -a seculens-db`
- 環境変数確認: `flyctl secrets list --app seculens`

---

## 📦 機能サマリー

| 機能 | 状態 |
|---|---|
| ユーザー登録/ログイン（メール+パスワード） | ✅ |
| パスワードリセット（メール送信は未実装） | ⚠️ DBトークンは生成 |
| マルチテナント（ユーザーごとにスキャン分離） | ✅ |
| Stripe Checkout（プラン購入） | ✅ |
| Stripe Customer Portal（カード変更・解約） | ✅ |
| Stripe Webhook（自動プラン更新） | ✅ |
| プランごとの月間スキャン上限 | ✅ |
| プランごとの機能制限（API/認証スキャン） | ✅ |
| 利用状況ダッシュボード | ✅ |
| 経産省SCS★3 / IPA SECURITY ACTION★2 対応LP | ✅ |
| 22種類の実スキャンエンジン | ✅ |

## 🚧 後で実装したい

- メール送信（パスワードリセット・通知）→ Resend/SendGrid連携
- Google OAuth ログイン
- チーム/組織アカウント
- API キー発行
- 月次レポート自動メール
- 管理者ダッシュボード
