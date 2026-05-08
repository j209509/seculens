"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const buttonStyle: React.CSSProperties = {
  padding: "8px 14px",
  border: "1px solid #2563eb",
  borderRadius: 8,
  background: "#2563eb",
  color: "#fff",
  fontSize: 13,
  cursor: "pointer",
};

const inputStyle: React.CSSProperties = {
  padding: "8px 12px",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  fontSize: 14,
  background: "#fff",
};

export function UserActions({
  userId,
  initialPlan,
  initialRole,
  isSelf,
}: {
  userId: string;
  initialPlan: string;
  initialRole: string;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [plan, setPlan] = useState(initialPlan);
  const [role, setRole] = useState(initialRole);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function patch(data: { plan?: string; role?: string }) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setMsg(`エラー: ${j.error || res.status}`);
      } else {
        setMsg("更新しました");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (isSelf) {
      setMsg("自分自身は削除できません");
      return;
    }
    if (
      !confirm(
        "このユーザーを削除しますか？ 関連するスキャンも削除されます。この操作は取り消せません。"
      )
    ) {
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setMsg(`エラー: ${j.error || res.status}`);
      } else {
        router.push("/admin/users");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <label
          style={{
            display: "block",
            fontSize: 12,
            fontWeight: 600,
            color: "#475569",
            marginBottom: 6,
          }}
        >
          プラン変更
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            style={inputStyle}
            disabled={busy}
          >
            <option value="free">Free</option>
            <option value="standard">Standard</option>
            <option value="pro">Pro</option>
            <option value="enterprise">Enterprise</option>
          </select>
          <button
            onClick={() => patch({ plan })}
            style={buttonStyle}
            disabled={busy || plan === initialPlan}
          >
            プラン保存
          </button>
        </div>
      </div>

      <div>
        <label
          style={{
            display: "block",
            fontSize: 12,
            fontWeight: 600,
            color: "#475569",
            marginBottom: 6,
          }}
        >
          管理者権限
        </label>
        <button
          onClick={() => {
            const next = role === "admin" ? "user" : "admin";
            setRole(next);
            patch({ role: next });
          }}
          style={{
            ...buttonStyle,
            background: role === "admin" ? "#dc2626" : "#2563eb",
            borderColor: role === "admin" ? "#dc2626" : "#2563eb",
          }}
          disabled={busy || isSelf}
          title={isSelf ? "自身のロールは変更できません" : ""}
        >
          {role === "admin" ? "管理者権限を剥奪" : "管理者権限を付与"}
        </button>
      </div>

      <div>
        <label
          style={{
            display: "block",
            fontSize: 12,
            fontWeight: 600,
            color: "#475569",
            marginBottom: 6,
          }}
        >
          危険な操作
        </label>
        <button
          onClick={handleDelete}
          style={{
            ...buttonStyle,
            background: "#dc2626",
            borderColor: "#dc2626",
          }}
          disabled={busy || isSelf}
          title={isSelf ? "自分自身は削除できません" : ""}
        >
          ユーザーを削除
        </button>
      </div>

      {msg && (
        <div
          style={{
            fontSize: 13,
            color: msg.startsWith("エラー") ? "#dc2626" : "#16a34a",
          }}
        >
          {msg}
        </div>
      )}
    </div>
  );
}
