"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Users, Plus, Trash2, Loader2, GitCompare, CheckCircle, XCircle, Pencil,
  Crown, AlertTriangle,
} from "lucide-react";

type Account = {
  id: string;
  name: string;
  roleName: string;
  email: string;
  loginUrl: string;
  isActive: boolean;
  notes?: string;
};

const ROLE_OPTIONS = [
  { value: "admin", label: "管理者" },
  { value: "user", label: "一般ユーザー" },
  { value: "premium", label: "プレミアム" },
  { value: "readonly", label: "閲覧専用" },
  { value: "guest", label: "ゲスト" },
];

function roleLabel(role: string) {
  return ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role;
}

function roleBadgeClass(role: string) {
  switch (role) {
    case "admin": return "bg-red-100 text-red-700";
    case "premium": return "bg-purple-100 text-purple-700";
    case "readonly": return "bg-slate-100 text-slate-600";
    case "guest": return "bg-gray-100 text-gray-600";
    default: return "bg-blue-100 text-blue-700";
  }
}

const EMPTY_FORM = {
  name: "",
  roleName: "user",
  email: "",
  password: "",
  loginUrl: "",
  notes: "",
};

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [planForbidden, setPlanForbidden] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [formError, setFormError] = useState("");

  useEffect(() => {
    fetchAccounts();
  }, []);

  async function fetchAccounts() {
    setLoading(true);
    setError(null);
    setPlanForbidden(false);
    setUnauthorized(false);
    try {
      const res = await fetch("/api/accounts");
      if (res.status === 401) {
        setUnauthorized(true);
        setAccounts([]);
        return;
      }
      if (res.status === 403) {
        setPlanForbidden(true);
        setAccounts([]);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list: Account[] = Array.isArray(data) ? data : data.accounts ?? [];
      setAccounts(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "取得に失敗しました");
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }

  function openCreateDialog() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setFormError("");
    setDialogOpen(true);
  }

  function openEditDialog(account: Account) {
    setEditingId(account.id);
    setForm({
      name: account.name,
      roleName: account.roleName,
      email: account.email,
      password: "",
      loginUrl: account.loginUrl,
      notes: account.notes ?? "",
    });
    setFormError("");
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { setFormError("名前を入力してください"); return; }
    if (!form.email.trim()) { setFormError("メールアドレスを入力してください"); return; }
    if (!form.loginUrl.trim()) { setFormError("ログインURLを入力してください"); return; }
    setFormError("");
    setSaving(true);
    try {
      if (editingId) {
        const res = await fetch(`/api/accounts/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name,
            roleName: form.roleName,
            email: form.email,
            loginUrl: form.loginUrl,
            notes: form.notes,
          }),
        });
        if (!res.ok) throw new Error("更新に失敗しました");
        const updated: Account = await res.json();
        setAccounts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      } else {
        const res = await fetch("/api/accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name,
            roleName: form.roleName,
            email: form.email,
            password: form.password,
            loginUrl: form.loginUrl,
            notes: form.notes,
          }),
        });
        if (!res.ok) throw new Error("作成に失敗しました");
        const created: Account = await res.json();
        setAccounts((prev) => [created, ...prev]);
      }
      setDialogOpen(false);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("このアカウントを削除しますか？")) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/accounts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("削除に失敗しました");
      setAccounts((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      alert(e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setDeleting(null);
    }
  }

  if (unauthorized) {
    return (
      <div className="p-6">
        <Card className="border-0 shadow-sm">
          <CardContent className="py-16 flex flex-col items-center text-slate-500">
            <AlertTriangle className="w-10 h-10 mb-2 text-amber-500" />
            <p className="text-sm font-medium text-slate-700">ログインが必要です</p>
            <Link href="/login" className="mt-4 text-xs text-blue-600 hover:underline">
              ログインへ →
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (planForbidden) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">テストアカウント管理</h1>
          <p className="text-sm text-slate-500 mt-1">認証後ページの脆弱性診断に使用するアカウントを登録</p>
        </div>
        <Card className="border-0 shadow-md bg-gradient-to-br from-blue-600 to-indigo-700 text-white">
          <CardContent className="pt-8 pb-8 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center mb-4">
              <Crown className="w-7 h-7 text-yellow-300" />
            </div>
            <h2 className="text-xl font-bold">Proプラン以上が必要です</h2>
            <p className="text-sm text-blue-100 mt-2 max-w-md">
              テストアカウントを使用したログイン後ページの脆弱性診断は、Proプラン以上でご利用いただけます。
              管理者権限と一般ユーザーの差分テストなど、より深い診断が可能になります。
            </p>
            <Link
              href="/pricing"
              className="mt-6 inline-flex items-center gap-2 bg-white text-blue-700 text-sm font-bold px-5 py-2.5 rounded-xl hover:bg-blue-50 transition-colors"
            >
              プランを確認する →
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">テストアカウント管理</h1>
          <p className="text-sm text-slate-500 mt-1">認証後ページの脆弱性診断に使用するアカウントを登録</p>
        </div>
        <Button onClick={openCreateDialog} className="bg-blue-600 hover:bg-blue-700 gap-1.5">
          <Plus className="w-4 h-4" />
          アカウント追加
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      <Card className="border-0 shadow-sm bg-blue-50">
        <CardContent className="pt-5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
              <GitCompare className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-blue-900">差分テストについて</p>
              <p className="text-sm text-blue-700 mt-0.5 leading-relaxed">
                2つのアカウントを選択してURLをスキャンすると、レスポンスの差分から認可不備を自動検出します。
                管理者と一般ユーザーなど、権限の異なるアカウントペアを登録してください。
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-600" />
            登録アカウント一覧
            <span className="ml-1 text-xs font-normal text-slate-400">（{accounts.length}件）</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600 mr-2" />
              <span className="text-sm text-slate-500">読み込み中...</span>
            </div>
          ) : accounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Users className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">アカウントが登録されていません</p>
              <button
                onClick={openCreateDialog}
                className="mt-3 text-xs text-blue-600 hover:underline"
              >
                最初のアカウントを追加する
              </button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-100">
                  <TableHead className="text-xs pl-6">名前</TableHead>
                  <TableHead className="text-xs">ロール</TableHead>
                  <TableHead className="text-xs">メールアドレス</TableHead>
                  <TableHead className="text-xs">ログインURL</TableHead>
                  <TableHead className="text-xs">ステータス</TableHead>
                  <TableHead className="text-xs pr-6 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => (
                  <TableRow key={account.id} className="border-slate-100 hover:bg-slate-50">
                    <TableCell className="pl-6">
                      <span className="text-sm font-medium text-slate-900">{account.name}</span>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${roleBadgeClass(account.roleName)}`}>
                        {roleLabel(account.roleName)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-slate-600 font-mono">{account.email}</span>
                    </TableCell>
                    <TableCell>
                      {account.loginUrl ? (
                        <a
                          href={account.loginUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline font-mono truncate block max-w-[200px]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {account.loginUrl}
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {account.isActive ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                          <CheckCircle className="w-3.5 h-3.5" /> 有効
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-400 font-medium">
                          <XCircle className="w-3.5 h-3.5" /> 無効
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <div className="flex items-center gap-1 justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                          onClick={() => openEditDialog(account)}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-slate-400 hover:text-red-500 hover:bg-red-50"
                          onClick={() => handleDelete(account.id)}
                          disabled={deleting === account.id}
                        >
                          {deleting === account.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              {editingId ? "アカウントを編集" : "アカウントを追加"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1.5">名前 <span className="text-red-500">*</span></label>
              <Input
                placeholder="例: テスト管理者"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="h-9 text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1.5">ロール <span className="text-red-500">*</span></label>
              <Select value={form.roleName} onValueChange={(v) => setForm({ ...form, roleName: v ?? "user" })}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1.5">メールアドレス <span className="text-red-500">*</span></label>
              <Input
                type="email"
                placeholder="例: test@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="h-9 text-sm"
              />
            </div>

            {!editingId && (
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1.5">パスワード</label>
                <Input
                  type="password"
                  placeholder="ログインに使用するパスワード"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="h-9 text-sm"
                />
                <p className="text-[11px] text-slate-400 mt-1">サーバーで暗号化して保存されます</p>
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1.5">ログインURL <span className="text-red-500">*</span></label>
              <Input
                type="url"
                placeholder="例: https://example.com/login"
                value={form.loginUrl}
                onChange={(e) => setForm({ ...form, loginUrl: e.target.value })}
                className="h-9 text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1.5">メモ</label>
              <Input
                placeholder="このアカウントに関するメモ（任意）"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="h-9 text-sm"
              />
            </div>

            {formError && <p className="text-xs text-red-500">{formError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="text-sm">
              キャンセル
            </Button>
            <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-sm">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              {editingId ? "保存" : "追加"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
