"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  User, Bell, Shield, Mail, CheckCircle, Loader2, AlertTriangle, Trash2,
  Lock, Crown,
} from "lucide-react";

type Me = {
  id: string;
  email: string;
  name: string | null;
  plan: string;
  role: string;
  createdAt: string;
};

const PLAN_LABEL: Record<string, string> = {
  free: "Free",
  standard: "Standard",
  pro: "Pro",
  enterprise: "Enterprise",
};

export default function SettingsPage() {
  const router = useRouter();

  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Profile form
  const [name, setName] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Password form
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdMsg, setPwdMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Notifications (UI placeholder, persisted to localStorage only)
  const [notifSaved, setNotifSaved] = useState(false);

  // Delete account
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) {
          if (res.status === 401) throw new Error("ログインが必要です");
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        const u = data.user as Me;
        if (!cancelled) {
          setMe(u);
          setName(u?.name ?? "");
        }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "取得に失敗しました");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  async function handleProfileSave() {
    setProfileSaving(true);
    setProfileMsg(null);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "保存に失敗しました");
      setMe((prev) => (prev ? { ...prev, name: (data.user?.name as string | null) ?? name } : prev));
      setProfileMsg({ kind: "ok", text: "保存しました" });
    } catch (e) {
      setProfileMsg({ kind: "err", text: e instanceof Error ? e.message : "保存に失敗しました" });
    } finally {
      setProfileSaving(false);
      setTimeout(() => setProfileMsg(null), 3000);
    }
  }

  async function handlePasswordChange() {
    setPwdMsg(null);
    if (newPwd.length < 8) {
      setPwdMsg({ kind: "err", text: "新しいパスワードは8文字以上で入力してください" });
      return;
    }
    if (newPwd !== confirmPwd) {
      setPwdMsg({ kind: "err", text: "新しいパスワードが一致しません" });
      return;
    }
    setPwdSaving(true);
    try {
      const res = await fetch("/api/auth/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: currentPwd,
          newPassword: newPwd,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "更新に失敗しました");
      setCurrentPwd("");
      setNewPwd("");
      setConfirmPwd("");
      setPwdMsg({ kind: "ok", text: "パスワードを更新しました" });
    } catch (e) {
      setPwdMsg({ kind: "err", text: e instanceof Error ? e.message : "更新に失敗しました" });
    } finally {
      setPwdSaving(false);
      setTimeout(() => setPwdMsg(null), 4000);
    }
  }

  function handleNotifSave() {
    setNotifSaved(true);
    setTimeout(() => setNotifSaved(false), 2500);
  }

  async function handleDeleteAccount() {
    const ok = window.confirm(
      "本当に削除しますか? すべてのスキャン履歴も削除されます"
    );
    if (!ok) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/auth/me", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "削除に失敗しました");
      }
      router.push("/");
    } catch (e) {
      alert(e instanceof Error ? e.message : "削除に失敗しました");
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600 mr-2" />
        <span className="text-sm text-slate-500">読み込み中...</span>
      </div>
    );
  }

  if (loadError || !me) {
    return (
      <div className="p-6">
        <Card className="border-0 shadow-sm">
          <CardContent className="py-16 flex flex-col items-center text-slate-500">
            <AlertTriangle className="w-10 h-10 mb-2 text-amber-500" />
            <p className="text-sm font-medium text-slate-700">
              {loadError ?? "ユーザー情報を取得できませんでした"}
            </p>
            <Link href="/login" className="mt-4 text-xs text-blue-600 hover:underline">
              ログインへ →
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const initial =
    (me.name?.trim() || me.email).slice(0, 1).toUpperCase();
  const registered = new Date(me.createdAt).toLocaleDateString("ja-JP", {
    year: "numeric", month: "long", day: "numeric",
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">設定</h1>
        <p className="text-sm text-slate-500 mt-1">アカウント情報の管理</p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList className="h-9">
          <TabsTrigger value="profile" className="text-xs gap-1.5">
            <User className="w-3.5 h-3.5" />プロフィール
          </TabsTrigger>
          <TabsTrigger value="security" className="text-xs gap-1.5">
            <Lock className="w-3.5 h-3.5" />セキュリティ
          </TabsTrigger>
          <TabsTrigger value="notifications" className="text-xs gap-1.5">
            <Bell className="w-3.5 h-3.5" />通知設定
          </TabsTrigger>
          <TabsTrigger value="danger" className="text-xs gap-1.5 data-[state=active]:text-red-600">
            <Trash2 className="w-3.5 h-3.5" />危険ゾーン
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-6 space-y-6">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold">プロフィール</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-4">
                <Avatar className="w-16 h-16">
                  <AvatarFallback className="bg-blue-600 text-white text-xl font-bold">
                    {initial}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold text-slate-900">
                    {me.name?.trim() || me.email.split("@")[0]}
                  </p>
                  <p className="text-sm text-slate-500 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5" /> {me.email}
                  </p>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1.5">表示名</label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="表示名を入力"
                    className="h-9 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1.5">メールアドレス</label>
                  <Input
                    value={me.email}
                    disabled
                    className="h-9 text-sm bg-slate-50"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">セキュリティのため変更できません</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1.5 flex items-center gap-1.5">
                    <Crown className="w-3.5 h-3.5" /> プラン
                  </label>
                  <div className="h-9 flex items-center gap-2">
                    <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">
                      {PLAN_LABEL[me.plan] ?? me.plan}
                    </Badge>
                    <Link href="/billing" className="text-xs text-blue-600 hover:underline">
                      プラン管理 →
                    </Link>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1.5">登録日</label>
                  <div className="h-9 flex items-center text-sm text-slate-600">{registered}</div>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <Button
                  onClick={handleProfileSave}
                  disabled={profileSaving}
                  className="bg-blue-600 hover:bg-blue-700 text-sm"
                >
                  {profileSaving ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-1" /> 保存中...</>
                  ) : (
                    "プロフィールを保存"
                  )}
                </Button>
                {profileMsg && (
                  <span
                    className={`text-xs font-medium flex items-center gap-1 ${
                      profileMsg.kind === "ok" ? "text-emerald-600" : "text-red-500"
                    }`}
                  >
                    {profileMsg.kind === "ok" ? (
                      <CheckCircle className="w-3.5 h-3.5" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5" />
                    )}
                    {profileMsg.text}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="mt-6 space-y-6">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold">パスワード変更</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1.5">現在のパスワード</label>
                <Input
                  type="password"
                  value={currentPwd}
                  onChange={(e) => setCurrentPwd(e.target.value)}
                  placeholder="••••••••"
                  className="h-9 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1.5">新しいパスワード</label>
                <Input
                  type="password"
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  placeholder="8文字以上"
                  className="h-9 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1.5">新しいパスワード（確認）</label>
                <Input
                  type="password"
                  value={confirmPwd}
                  onChange={(e) => setConfirmPwd(e.target.value)}
                  placeholder="••••••••"
                  className="h-9 text-sm"
                />
              </div>
              <div className="flex items-center gap-3 pt-1">
                <Button
                  onClick={handlePasswordChange}
                  disabled={pwdSaving}
                  className="bg-blue-600 hover:bg-blue-700 text-sm"
                >
                  {pwdSaving ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-1" /> 更新中...</>
                  ) : (
                    "パスワードを更新"
                  )}
                </Button>
                {pwdMsg && (
                  <span
                    className={`text-xs font-medium flex items-center gap-1 ${
                      pwdMsg.kind === "ok" ? "text-emerald-600" : "text-red-500"
                    }`}
                  >
                    {pwdMsg.kind === "ok" ? (
                      <CheckCircle className="w-3.5 h-3.5" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5" />
                    )}
                    {pwdMsg.text}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="mt-6">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Bell className="w-4 h-4 text-blue-600" /> 通知設定
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-slate-500">
                Slack / Discord / メール通知の連携機能は近日提供予定です。現状は表示のみのプレースホルダーです。
              </p>
              {[
                { label: "メール通知", desc: "スキャン完了時にメールで通知します" },
                { label: "Slack通知", desc: "Slack Webhookで結果を通知します（近日提供予定）" },
                { label: "Discord通知", desc: "Discord Webhookで結果を通知します（近日提供予定）" },
                { label: "Criticalアラート", desc: "Critical脆弱性検出時に即時通知します" },
              ].map((item, idx) => (
                <div key={item.label} className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{item.label}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer ml-4">
                    <input type="checkbox" defaultChecked={idx === 0} className="sr-only peer" />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
                  </label>
                </div>
              ))}
              <div className="flex items-center gap-3 pt-2">
                <Button
                  onClick={handleNotifSave}
                  className="bg-blue-600 hover:bg-blue-700 text-sm"
                >
                  通知設定を保存
                </Button>
                {notifSaved && (
                  <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" /> 保存しました
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="danger" className="mt-6">
          <Card className="border-red-200 bg-red-50/30 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold text-red-700 flex items-center gap-2">
                <Shield className="w-4 h-4" /> 危険ゾーン
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-white border border-red-200 p-4">
                <p className="text-sm font-semibold text-slate-900">アカウントを削除</p>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  アカウントを削除すると、すべてのスキャン履歴・テストアカウント・診断結果が完全に削除されます。
                  この操作は取り消せません。
                </p>
                <Button
                  onClick={handleDeleteAccount}
                  disabled={deleting}
                  className="mt-3 bg-red-600 hover:bg-red-700 text-sm gap-1.5"
                >
                  {deleting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> 削除中...</>
                  ) : (
                    <><Trash2 className="w-4 h-4" /> アカウントを削除する</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
