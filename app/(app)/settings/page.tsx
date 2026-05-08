"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  User, CreditCard, Bell, Shield, Building, Mail, Phone, Edit2, CheckCircle,
  Bot, Eye, EyeOff, Loader2,
} from "lucide-react";

const BILLING_HISTORY = [
  { id: "inv-001", date: "2026-04-01", amount: "¥9,800", status: "支払済", plan: "スタンダードプラン" },
  { id: "inv-002", date: "2026-03-01", amount: "¥9,800", status: "支払済", plan: "スタンダードプラン" },
  { id: "inv-003", date: "2026-02-01", amount: "¥9,800", status: "支払済", plan: "スタンダードプラン" },
  { id: "inv-004", date: "2026-01-01", amount: "¥4,900", status: "支払済", plan: "スタータープラン" },
  { id: "inv-005", date: "2025-12-01", amount: "¥4,900", status: "支払済", plan: "スタータープラン" },
];

const PLANS = [
  {
    name: "スタータープラン",
    price: "¥4,900",
    scans: 50,
    features: ["月50回のスキャン", "OWASP Top10検査", "メールレポート", "3ヶ月の履歴保存"],
    current: false,
  },
  {
    name: "スタンダードプラン",
    price: "¥9,800",
    scans: 200,
    features: ["月200回のスキャン", "OWASP Top10検査", "PDFレポート", "12ヶ月の履歴保存", "優先サポート", "比較・分析機能"],
    current: true,
  },
  {
    name: "エンタープライズ",
    price: "要お問い合わせ",
    scans: -1,
    features: ["無制限スキャン", "カスタム検査項目", "APIアクセス", "SIEM連携", "専任担当者", "SLA保証"],
    current: false,
  },
];

export default function SettingsPage() {
  const [saved, setSaved] = useState(false);
  const [aiSaved, setAiSaved] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);

  // AI settings state
  const [apiKey, setApiKey] = useState("sk-proj-••••••••••••••••••••••••••••••••••••••••");
  const [showKey, setShowKey] = useState(false);
  const [aiModel, setAiModel] = useState("gpt-4o");
  const [aiEnabled, setAiEnabled] = useState(true);
  const [dailyBudget, setDailyBudget] = useState("5.00");

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  async function handleAiSave() {
    setAiSaving(true);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          openaiApiKey: apiKey,
          aiModel,
          aiEnabled,
          dailyBudget: parseFloat(dailyBudget) || 0,
        }),
      });
    } catch {
      // Ignore API errors
    } finally {
      setAiSaving(false);
      setAiSaved(true);
      setTimeout(() => setAiSaved(false), 2500);
    }
  }

  const maskedKey = apiKey.startsWith("sk-")
    ? apiKey.slice(0, 10) + "•".repeat(Math.max(0, apiKey.length - 14)) + apiKey.slice(-4)
    : apiKey;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">設定</h1>
        <p className="text-sm text-slate-500 mt-1">アカウントとサブスクリプションの管理</p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList className="h-9">
          <TabsTrigger value="profile" className="text-xs gap-1.5"><User className="w-3.5 h-3.5" />プロフィール</TabsTrigger>
          <TabsTrigger value="plan" className="text-xs gap-1.5"><Shield className="w-3.5 h-3.5" />利用プラン</TabsTrigger>
          <TabsTrigger value="billing" className="text-xs gap-1.5"><CreditCard className="w-3.5 h-3.5" />請求履歴</TabsTrigger>
          <TabsTrigger value="notifications" className="text-xs gap-1.5"><Bell className="w-3.5 h-3.5" />通知設定</TabsTrigger>
          <TabsTrigger value="ai" className="text-xs gap-1.5"><Bot className="w-3.5 h-3.5" />AI設定</TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="mt-6 space-y-6">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold">基本情報</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-4">
                <Avatar className="w-16 h-16">
                  <AvatarFallback className="bg-blue-600 text-white text-xl font-bold">山</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold text-slate-900">山田 太郎</p>
                  <p className="text-sm text-slate-500">管理者</p>
                  <button className="text-xs text-blue-600 hover:underline mt-0.5 flex items-center gap-1">
                    <Edit2 className="w-3 h-3" /> アバターを変更
                  </button>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { label: "姓", value: "山田", icon: User },
                  { label: "名", value: "太郎", icon: User },
                  { label: "メールアドレス", value: "yamada@techsolution.co.jp", icon: Mail },
                  { label: "電話番号", value: "03-1234-5678", icon: Phone },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label}>
                    <label className="text-xs font-medium text-slate-500 block mb-1.5">{label}</label>
                    <div className="relative">
                      <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input defaultValue={value} className="pl-9 h-9 text-sm" />
                    </div>
                  </div>
                ))}
              </div>

              <Separator />

              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1.5 flex items-center gap-1.5">
                  <Building className="w-3.5 h-3.5" /> 会社名
                </label>
                <Input defaultValue="株式会社テックソリューション" className="h-9 text-sm" />
              </div>

              <div className="flex items-center gap-3">
                <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-sm">
                  変更を保存
                </Button>
                {saved && (
                  <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" /> 保存しました
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold">パスワード変更</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {["現在のパスワード", "新しいパスワード", "新しいパスワード（確認）"].map((label) => (
                <div key={label}>
                  <label className="text-xs font-medium text-slate-500 block mb-1.5">{label}</label>
                  <Input type="password" placeholder="••••••••" className="h-9 text-sm" />
                </div>
              ))}
              <Button variant="outline" size="sm" className="text-xs">パスワードを更新</Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Plan Tab */}
        <TabsContent value="plan" className="mt-6 space-y-6">
          <Card className="border-0 shadow-sm bg-blue-600 text-white">
            <CardContent className="pt-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-blue-200 uppercase tracking-wide">現在のプラン</p>
                  <p className="text-2xl font-bold mt-0.5">スタンダードプラン</p>
                  <p className="text-sm text-blue-200 mt-0.5">月額 ¥9,800（税込）</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-blue-200">今月の残りスキャン回数</p>
                  <p className="text-4xl font-bold mt-0.5">153</p>
                  <p className="text-xs text-blue-200">/ 200回</p>
                </div>
              </div>
              <div className="mt-4 h-2 bg-blue-500 rounded-full overflow-hidden">
                <div className="h-full bg-white rounded-full" style={{ width: "76.5%" }} />
              </div>
              <p className="text-xs text-blue-200 mt-1">次回更新日: 2026年5月1日</p>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {PLANS.map((plan) => (
              <Card key={plan.name} className={`border-0 shadow-sm relative ${plan.current ? "ring-2 ring-blue-600" : ""}`}>
                {plan.current && (
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                    <Badge className="bg-blue-600 text-white text-xs">現在のプラン</Badge>
                  </div>
                )}
                <CardContent className="pt-6">
                  <p className="font-semibold text-slate-900">{plan.name}</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{plan.price}</p>
                  {plan.scans > 0 && <p className="text-xs text-slate-500">月{plan.scans}回のスキャン</p>}
                  <Separator className="my-4" />
                  <ul className="space-y-2">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-xs text-slate-600">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Button
                    className={`w-full mt-4 text-sm ${plan.current ? "bg-slate-100 text-slate-400 cursor-default hover:bg-slate-100" : plan.name === "エンタープライズ" ? "bg-slate-900 hover:bg-slate-800" : "bg-blue-600 hover:bg-blue-700"}`}
                    disabled={plan.current}
                  >
                    {plan.current ? "利用中" : plan.name === "エンタープライズ" ? "お問い合わせ" : "このプランに変更"}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Billing Tab */}
        <TabsContent value="billing" className="mt-6 space-y-6">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold">お支払い方法</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 p-4 rounded-lg border border-slate-200 bg-slate-50">
                <div className="w-10 h-7 bg-blue-600 rounded flex items-center justify-center">
                  <span className="text-white text-xs font-bold">VISA</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">•••• •••• •••• 4242</p>
                  <p className="text-xs text-slate-500">有効期限: 12/28</p>
                </div>
                <Button variant="outline" size="sm" className="ml-auto text-xs">変更</Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base font-semibold">請求履歴</CardTitle>
              <Button variant="outline" size="sm" className="text-xs gap-1.5">
                <CreditCard className="w-3.5 h-3.5" /> すべてダウンロード
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left text-xs font-medium text-slate-500 px-6 py-3">請求日</th>
                    <th className="text-left text-xs font-medium text-slate-500 py-3">プラン</th>
                    <th className="text-left text-xs font-medium text-slate-500 py-3">金額</th>
                    <th className="text-left text-xs font-medium text-slate-500 py-3">ステータス</th>
                    <th className="text-left text-xs font-medium text-slate-500 py-3 pr-6">領収書</th>
                  </tr>
                </thead>
                <tbody>
                  {BILLING_HISTORY.map((inv) => (
                    <tr key={inv.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="text-sm text-slate-600 px-6 py-3">{inv.date}</td>
                      <td className="text-sm text-slate-800 py-3">{inv.plan}</td>
                      <td className="text-sm font-semibold text-slate-900 py-3">{inv.amount}</td>
                      <td className="py-3">
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                          <CheckCircle className="w-3 h-3" /> {inv.status}
                        </span>
                      </td>
                      <td className="py-3 pr-6">
                        <button className="text-xs text-blue-600 hover:underline">ダウンロード</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="mt-6">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold">通知設定</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { label: "スキャン完了通知", desc: "スキャンが完了したときにメールで通知します", defaultChecked: true },
                { label: "Criticalリスク検出アラート", desc: "Criticalレベルの脆弱性が検出された際に即時通知します", defaultChecked: true },
                { label: "週次サマリーレポート", desc: "毎週月曜日に先週の診断サマリーを送信します", defaultChecked: true },
                { label: "スキャン残回数アラート", desc: "月間スキャン回数が残り20%以下になった際に通知します", defaultChecked: false },
                { label: "プランの更新通知", desc: "サブスクリプションの更新前日に通知します", defaultChecked: true },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{item.label}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer ml-4">
                    <input type="checkbox" defaultChecked={item.defaultChecked} className="sr-only peer" />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
                  </label>
                </div>
              ))}
              <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-sm mt-2">
                通知設定を保存
              </Button>
              {saved && (
                <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" /> 保存しました
                </span>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Settings Tab */}
        <TabsContent value="ai" className="mt-6 space-y-6">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Bot className="w-4 h-4 text-blue-600" />
                AI設定
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* API Key */}
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1.5">
                  OpenAI APIキー
                </label>
                <div className="relative">
                  <Input
                    type={showKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="h-9 text-sm pr-10 font-mono"
                    placeholder="sk-proj-..."
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  表示中: {showKey ? apiKey : maskedKey}
                </p>
              </div>

              <Separator />

              {/* Model selection */}
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1.5">
                  使用モデル
                </label>
                <Select value={aiModel} onValueChange={(v) => setAiModel(v ?? "gpt-4o")}>
                  <SelectTrigger className="h-9 text-sm w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gpt-5.5">GPT-5.5（最新・高精度）</SelectItem>
                    <SelectItem value="gpt-4o">GPT-4o（推奨）</SelectItem>
                    <SelectItem value="gpt-4.1-mini">GPT-4.1 mini（高速・低コスト）</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-400 mt-1">
                  脆弱性の解析・レポート生成に使用するモデルを選択します
                </p>
              </div>

              <Separator />

              {/* AI Enable toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-800">AI解析</p>
                  <p className="text-xs text-slate-500 mt-0.5">スキャン結果のAIによる自動解析とレポート生成を有効にします</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer ml-4">
                  <input
                    type="checkbox"
                    checked={aiEnabled}
                    onChange={(e) => setAiEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
                </label>
              </div>

              <Separator />

              {/* Daily budget */}
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1.5">
                  1日の予算上限（$）
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 text-sm">$</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.50"
                    value={dailyBudget}
                    onChange={(e) => setDailyBudget(e.target.value)}
                    className="h-9 text-sm w-32"
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  1日あたりのOpenAI API利用費の上限。上限に達するとAI解析が一時停止されます。
                </p>
              </div>

              {/* AI status info */}
              <div className={`rounded-lg p-3 ${aiEnabled ? "bg-emerald-50 border border-emerald-100" : "bg-slate-50 border border-slate-200"}`}>
                <p className={`text-xs font-medium flex items-center gap-1.5 ${aiEnabled ? "text-emerald-700" : "text-slate-500"}`}>
                  {aiEnabled ? (
                    <><CheckCircle className="w-3.5 h-3.5" /> AI解析は有効です</>
                  ) : (
                    <><Bot className="w-3.5 h-3.5" /> AI解析は無効です</>
                  )}
                </p>
                <p className={`text-xs mt-0.5 ${aiEnabled ? "text-emerald-600" : "text-slate-400"}`}>
                  {aiEnabled
                    ? `モデル: ${aiModel} / 予算上限: $${dailyBudget}/日`
                    : "AI解析を有効にするにはトグルをONにしてください"}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  onClick={handleAiSave}
                  disabled={aiSaving}
                  className="bg-blue-600 hover:bg-blue-700 text-sm"
                >
                  {aiSaving ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-1" /> 保存中...</>
                  ) : (
                    "AI設定を保存"
                  )}
                </Button>
                {aiSaved && (
                  <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" /> 保存しました
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
