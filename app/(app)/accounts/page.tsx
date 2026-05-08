"use client";

import { useState, useEffect } from "react";
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
  Users, Plus, Trash2, Loader2, GitCompare, CheckCircle, XCircle,
} from "lucide-react";

interface Account {
  id: string;
  name: string;
  roleName: string;
  email: string;
  loginUrl: string;
  isActive: boolean;
  memo?: string;
}

const ROLE_OPTIONS = [
  { value: "admin", label: "管理者" },
  { value: "user", label: "一般ユーザー" },
  { value: "premium", label: "プレミアム" },
  { value: "readonly", label: "閲覧専用" },
  { value: "guest", label: "ゲスト" },
];

const MOCK_ACCOUNTS: Account[] = [
  {
    id: "acc-001",
    name: "テスト管理者",
    roleName: "admin",
    email: "admin@example.com",
    loginUrl: "https://example.com/admin/login",
    isActive: true,
    memo: "管理者権限を持つテストアカウント",
  },
  {
    id: "acc-002",
    name: "一般ユーザーA",
    roleName: "user",
    email: "user-a@example.com",
    loginUrl: "https://example.com/login",
    isActive: true,
    memo: "一般権限のテストアカウント",
  },
  {
    id: "acc-003",
    name: "プレミアムユーザー",
    roleName: "premium",
    email: "premium@example.com",
    loginUrl: "https://example.com/login",
    isActive: false,
    memo: "",
  },
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

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "",
    roleName: "user",
    email: "",
    loginUrl: "",
    memo: "",
  });
  const [formError, setFormError] = useState("");

  useEffect(() => {
    fetchAccounts();
  }, []);

  async function fetchAccounts() {
    setLoading(true);
    try {
      const res = await fetch("/api/accounts");
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      const list: Account[] = Array.isArray(data) ? data : data.accounts ?? [];
      setAccounts(list.length > 0 ? list : MOCK_ACCOUNTS);
    } catch {
      setAccounts(MOCK_ACCOUNTS);
    } finally {
      setLoading(false);
    }
  }

  function openDialog() {
    setForm({ name: "", roleName: "user", email: "", loginUrl: "", memo: "" });
    setFormError("");
    setDialogOpen(true);
  }

  async function handleAdd() {
    if (!form.name.trim()) { setFormError("名前を入力してください"); return; }
    if (!form.email.trim()) { setFormError("メールアドレスを入力してください"); return; }
    if (!form.loginUrl.trim()) { setFormError("ログインURLを入力してください"); return; }
    setFormError("");
    setSaving(true);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, isActive: true }),
      });
      if (!res.ok) throw new Error("add failed");
      const newAccount: Account = await res.json();
      setAccounts((prev) => [...prev, newAccount]);
    } catch {
      // Optimistic fallback
      const optimistic: Account = {
        id: `acc-${Date.now()}`,
        ...form,
        isActive: true,
      };
      setAccounts((prev) => [...prev, optimistic]);
    } finally {
      setSaving(false);
      setDialogOpen(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      const res = await fetch(`/api/accounts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
    } catch {
      // Continue with optimistic removal
    } finally {
      setAccounts((prev) => prev.filter((a) => a.id !== id));
      setDeleting(null);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">アカウント管理</h1>
          <p className="text-sm text-slate-500 mt-1">テストアカウントの登録・管理</p>
        </div>
        <Button onClick={openDialog} className="bg-blue-600 hover:bg-blue-700 gap-1.5">
          <Plus className="w-4 h-4" />
          アカウント追加
        </Button>
      </div>

      {/* Explanation card */}
      <Card className="border-0 shadow-sm bg-blue-50 border-blue-100">
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

      {/* Account table */}
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
                onClick={openDialog}
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
                  <TableHead className="text-xs">メモ</TableHead>
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
                      <span className="text-sm text-slate-600 font-mono text-xs">{account.email}</span>
                    </TableCell>
                    <TableCell>
                      <a
                        href={account.loginUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline font-mono truncate block max-w-[180px]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {account.loginUrl}
                      </a>
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
                    <TableCell>
                      <span className="text-xs text-slate-500 truncate block max-w-[140px]">{account.memo || "—"}</span>
                    </TableCell>
                    <TableCell className="pr-6 text-right">
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
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add account dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">アカウントを追加</DialogTitle>
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
                value={form.memo}
                onChange={(e) => setForm({ ...form, memo: e.target.value })}
                className="h-9 text-sm"
              />
            </div>

            {formError && <p className="text-xs text-red-500">{formError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="text-sm">
              キャンセル
            </Button>
            <Button onClick={handleAdd} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-sm">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
              追加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
