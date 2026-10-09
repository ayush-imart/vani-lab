import { Lock } from "lucide-react";
import { Pill } from "./common";

type Row = {
  kind: "ctx" | "add" | "del";
  text: string;
  leftNo?: number;
  rightNo?: number;
};

function diffRows(a: string, b: string): Row[] {
  const x = a.split("\n");
  const y = b.split("\n");
  const n = x.length;
  const m = y.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i]![j]! = x[i] === y[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const rows: Row[] = [];
  let i = 0;
  let j = 0;
  let l = 1;
  let r = 1;
  while (i < n && j < m) {
    if (x[i] === y[j]) {
      rows.push({ kind: "ctx", text: x[i]!, leftNo: l++, rightNo: r++ });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      rows.push({ kind: "del", text: x[i]!, leftNo: l++ });
      i++;
    } else {
      rows.push({ kind: "add", text: y[j]!, rightNo: r++ });
      j++;
    }
  }
  while (i < n) rows.push({ kind: "del", text: x[i++]!, leftNo: l++ });
  while (j < m) rows.push({ kind: "add", text: y[j++]!, rightNo: r++ });
  return rows;
}

export function DiffCounts({ a, b }: { a: string; b: string }) {
  const rows = diffRows(a, b);
  const adds = rows.filter((r) => r.kind === "add").length;
  const dels = rows.filter((r) => r.kind === "del").length;
  return (
    <div className="diff-chips">
      <span className="pill pill-green">+{adds} lines</span>
      <span className="pill pill-red">
        −{dels} line{dels === 1 ? "" : "s"}
      </span>
    </div>
  );
}

export function DiffView({
  a,
  b,
  aTitle,
  bTitle,
  mode = "diff",
  onBChange,
  lockA = false,
}: {
  a: string;
  b: string;
  aTitle: string;
  bTitle: string;
  mode?: "diff" | "edit";
  onBChange?: (value: string) => void;
  lockA?: boolean;
}) {
  const editing = mode === "edit" && !!onBChange;
  return (
    <div className="diff-view">
      <div className="diff-head">
        <div className="diff-title">
          <strong>{aTitle}</strong>
          {lockA && <Lock size={12} />}
        </div>
        <div className="diff-title">
          <strong>{bTitle}</strong>
          <Pill tone={editing ? "amber" : "blue"}>{editing ? "editing" : "editable"}</Pill>
        </div>
      </div>
      {editing ? (
        <div className="diff-row edit-row">
          <div className="diff-cell stacked">
            {a.split("\n").map((line, i) => (
              <div className="diff-line" key={i}>
                <span className="diff-no">{i + 1}</span>
                <span className="diff-text">{line || " "}</span>
              </div>
            ))}
          </div>
          <div className="diff-cell edit-cell">
            <textarea
              className="diff-editor"
              aria-label="Variant prompt editor"
              value={b}
              onChange={(e) => onBChange?.(e.target.value)}
              spellCheck={false}
            />
          </div>
        </div>
      ) : (
        <div className="diff-body">
          {diffRows(a, b).map((row, index) => (
            <div className="diff-row" key={index}>
              <div className={`diff-cell ${row.kind === "del" ? "del" : ""}`}>
                {row.kind !== "add" && (
                  <>
                    <span className="diff-no">{row.leftNo}</span>
                    <span className="diff-marker">{row.kind === "del" ? "−" : ""}</span>
                    <span className="diff-text">{row.text || " "}</span>
                  </>
                )}
              </div>
              <div className={`diff-cell ${row.kind === "add" ? "add" : ""}`}>
                {row.kind !== "del" && (
                  <>
                    <span className="diff-no">{row.rightNo}</span>
                    <span className="diff-marker">{row.kind === "add" ? "+" : ""}</span>
                    <span className="diff-text">{row.text || " "}</span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
