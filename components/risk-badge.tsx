import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { RiskLevel } from "@/lib/mock-data";

const config: Record<RiskLevel, { label: string; className: string }> = {
  critical: { label: "Critical", className: "bg-red-600 text-white hover:bg-red-600" },
  high: { label: "High", className: "bg-orange-500 text-white hover:bg-orange-500" },
  medium: { label: "Medium", className: "bg-amber-500 text-white hover:bg-amber-500" },
  low: { label: "Low", className: "bg-green-600 text-white hover:bg-green-600" },
  info: { label: "Info", className: "bg-blue-500 text-white hover:bg-blue-500" },
};

export function RiskBadge({ level }: { level: RiskLevel }) {
  const { label, className } = config[level];
  return <Badge className={cn("text-xs font-semibold", className)}>{label}</Badge>;
}

export function RiskScoreBadge({ score }: { score: number }) {
  const level = score >= 80 ? "critical" : score >= 60 ? "high" : score >= 40 ? "medium" : "low";
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center w-10 h-10 rounded-full text-sm font-bold",
        level === "critical" && "bg-red-100 text-red-700",
        level === "high" && "bg-orange-100 text-orange-700",
        level === "medium" && "bg-amber-100 text-amber-700",
        level === "low" && "bg-green-100 text-green-700"
      )}
    >
      {score}
    </span>
  );
}
