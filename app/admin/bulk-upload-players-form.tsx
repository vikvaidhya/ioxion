"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { bulkAddPlayersAction, type BulkPlayerRow, type BulkUploadResult } from "./setup-actions";
import { Upload, Download, AlertTriangle, CheckCircle2, FileText, ClipboardPaste } from "lucide-react";

interface Props {
  auctionId: string;
  categories: { name: string; basePrice: number }[];
}

interface ParsedRow extends BulkPlayerRow {
  valid: boolean;
  issue?: string;
}

// Shared between file-upload and paste paths — takes whatever Papa.parse
// gave us (from a File or a raw string, both produce the same shape) and
// turns it into validated rows. Keeping this in one place means the two
// input methods can never silently drift in what they accept.
function rowsFromParseResult(results: Papa.ParseResult<Record<string, string>>): {
  rows: ParsedRow[] | null;
  error: string | null;
} {
  const headers = results.meta.fields ?? [];
  const hasName = headers.some((h) => h === "full_name" || h === "name");
  const hasCricClubsId = headers.some((h) => h === "cricclubs_id" || h === "cricclubsid");

  if (!hasName || !hasCricClubsId) {
    return {
      rows: null,
      error: `Needs columns for name and CricClubs ID. Found: ${headers.join(", ") || "(none)"}`,
    };
  }

  const rows: ParsedRow[] = results.data.map((r) => {
    const fullName = (r.full_name || r.name || "").trim();
    const cricclubsId = (r.cricclubs_id || r.cricclubsid || "").trim();
    const dob = (r.dob || r.date_of_birth || "").trim() || null;
    const category = (r.category || "").trim() || null;
    const valid = !!fullName && !!cricclubsId;
    return { fullName, cricclubsId, dob, category, valid, issue: valid ? undefined : "Missing name or CricClubs ID" };
  });

  return { rows, error: null };
}

const parseConfig = {
  header: true as const,
  skipEmptyLines: true as const,
  transformHeader: (h: string) => h.trim().toLowerCase().replace(/\s+/g, "_"),
};

export function BulkUploadPlayersForm({ auctionId, categories }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"file" | "paste">("file");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [sourceLabel, setSourceLabel] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<BulkUploadResult | null>(null);

  const validCount = rows.filter((r) => r.valid).length;
  const invalidCount = rows.length - validCount;

  const applyParseResult = (results: Papa.ParseResult<Record<string, string>>) => {
    const { rows: parsed, error } = rowsFromParseResult(results);
    if (error) {
      setParseError(error);
      setRows([]);
    } else {
      setParseError(null);
      setRows(parsed!);
    }
  };

  const handleFile = (file: File) => {
    setResult(null);
    setSourceLabel(file.name);
    Papa.parse<Record<string, string>>(file, {
      ...parseConfig,
      complete: applyParseResult,
      error: (err) => setParseError(err.message),
    });
  };

  const handleParsePaste = () => {
    setResult(null);
    setSourceLabel("pasted text");
    if (!pasteText.trim()) {
      setParseError("Paste some rows first.");
      return;
    }
    const results = Papa.parse<Record<string, string>>(pasteText.trim(), parseConfig);
    applyParseResult(results);
  };

  const handleUpload = () => {
    const validRows = rows.filter((r) => r.valid);
    startTransition(async () => {
      const res = await bulkAddPlayersAction(auctionId, validRows);
      if ("error" in res) {
        setParseError(res.error);
      } else {
        setResult(res);
        setRows([]);
        setSourceLabel("");
        setPasteText("");
        router.refresh();
      }
    });
  };

  const downloadTemplate = () => {
    const csv =
      "full_name,cricclubs_id,dob,category\nJohn Smith,CC100234,1995-04-12," +
      (categories[0]?.name ?? "Category A") +
      "\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "iOxion-player-upload-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setOpen(false);
    setRows([]);
    setSourceLabel("");
    setPasteText("");
    setResult(null);
    setParseError(null);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-semibold px-3 py-1.5 rounded-md border border-[var(--line)] text-[var(--ink-soft)] hover:border-[var(--brand)] hover:text-[var(--brand)] transition-colors flex items-center gap-1"
      >
        <Upload size={13} /> Bulk upload
      </button>
    );
  }

  return (
    <div className="border border-[var(--line)] rounded-lg p-4 bg-[var(--paper)] space-y-3 mb-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Bulk upload players</h3>
        <button
          onClick={downloadTemplate}
          className="text-xs font-medium text-[var(--brand)] hover:underline flex items-center gap-1"
        >
          <Download size={12} /> Download template
        </button>
      </div>
      <p className="text-xs text-[var(--ink-soft)]">
        Needs <strong>full_name</strong> and <strong>cricclubs_id</strong> columns (required). Optional:
        <strong> dob</strong> (YYYY-MM-DD) and <strong> category</strong> (must match a configured category
        name, or defaults to your first category).
      </p>

      <div className="flex gap-1 border-b border-[var(--brand-soft)]">
        <button
          onClick={() => setMode("file")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border-b-2 -mb-px transition-colors ${
            mode === "file" ? "border-[var(--brand)] text-[var(--ink)]" : "border-transparent text-[var(--ink-soft)]"
          }`}
        >
          <FileText size={12} /> Upload file
        </button>
        <button
          onClick={() => setMode("paste")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border-b-2 -mb-px transition-colors ${
            mode === "paste" ? "border-[var(--brand)] text-[var(--ink)]" : "border-transparent text-[var(--ink-soft)]"
          }`}
        >
          <ClipboardPaste size={12} /> Paste text
        </button>
      </div>

      {result && (
        <div className="bg-white border border-[var(--line)] rounded p-3 text-sm">
          <p className="font-semibold flex items-center gap-1.5 mb-1">
            <CheckCircle2 size={14} className="text-[var(--brand)]" />
            Added {result.added} player{result.added !== 1 ? "s" : ""}
            {result.failed > 0 && ` · ${result.failed} failed`}
          </p>
          {result.errors.length > 0 && (
            <ul className="text-xs text-[var(--danger)] mt-1 space-y-0.5">
              {result.errors.slice(0, 10).map((e, i) => (
                <li key={i}>
                  Row {e.row} ({e.fullName || "blank"}): {e.message}
                </li>
              ))}
              {result.errors.length > 10 && <li>…and {result.errors.length - 10} more</li>}
            </ul>
          )}
        </div>
      )}

      {mode === "file" ? (
        <input
          type="file"
          accept=".csv"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
          className="text-sm"
        />
      ) : (
        <div className="space-y-2">
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={`full_name,cricclubs_id,dob,category\nJohn Smith,CC100234,1995-04-12,${categories[0]?.name ?? "Category A"}\nJane Doe,CC100235,,`}
            rows={6}
            className="w-full px-2 py-2 rounded border border-[var(--line)] text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/30"
          />
          <p className="text-xs text-[var(--ink-faint)]">
            First line must be the header row (comma-separated), same as the CSV template — this also
            works if you copy-paste directly from a spreadsheet.
          </p>
          <button
            onClick={handleParsePaste}
            className="py-1.5 px-4 rounded bg-white border border-[var(--line)] text-xs font-semibold text-[var(--ink-soft)] hover:border-[var(--brand)] hover:text-[var(--brand)] transition-colors"
          >
            Parse pasted rows
          </button>
        </div>
      )}

      {parseError && (
        <p className="text-xs text-[var(--danger)] flex items-center gap-1.5">
          <AlertTriangle size={13} /> {parseError}
        </p>
      )}

      {rows.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-[var(--ink-soft)] mb-2">
            {sourceLabel}: {validCount} valid row{validCount !== 1 ? "s" : ""}
            {invalidCount > 0 && `, ${invalidCount} invalid (will be skipped)`}
          </p>
          <div className="max-h-48 overflow-y-auto border border-[var(--line)] rounded bg-white">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-[var(--paper)]">
                <tr className="text-left text-[var(--ink-soft)] border-b border-[var(--brand-soft)]">
                  <th className="px-2 py-1.5">Name</th>
                  <th className="px-2 py-1.5">CricClubs ID</th>
                  <th className="px-2 py-1.5">Category</th>
                  <th className="px-2 py-1.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={`border-b border-[var(--paper)] last:border-0 ${!r.valid ? "bg-[var(--danger-soft)]" : ""}`}>
                    <td className="px-2 py-1">{r.fullName || "—"}</td>
                    <td className="px-2 py-1 font-mono">{r.cricclubsId || "—"}</td>
                    <td className="px-2 py-1">{r.category || "(default)"}</td>
                    <td className="px-2 py-1">
                      {r.valid ? (
                        <span className="text-[var(--brand)]">OK</span>
                      ) : (
                        <span className="text-[var(--danger)]">{r.issue}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleUpload}
          disabled={isPending || validCount === 0}
          className="py-1.5 px-4 rounded bg-[var(--brand)] text-white text-xs font-semibold disabled:opacity-40"
        >
          {isPending ? "Uploading…" : `Upload ${validCount || ""} player${validCount !== 1 ? "s" : ""}`}
        </button>
        <button onClick={reset} className="px-3 py-1.5 rounded border border-[var(--line)] text-xs font-semibold text-[var(--ink-soft)]">
          Close
        </button>
      </div>
    </div>
  );
}
