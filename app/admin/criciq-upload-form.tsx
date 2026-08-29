"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { bulkUploadCricIQAction, type CricIQRow, type CricIQUploadResult } from "./setup-actions";
import { Sparkles, FileText, ClipboardPaste, AlertTriangle, CheckCircle2 } from "lucide-react";

interface ParsedCricIQRow extends CricIQRow {
  valid: boolean;
}

// CricIQ's export headers are things like "CricClubs ID", "Batting Average",
// "Boundary %" — normalize to snake_case so lookups are consistent
// regardless of exact spacing/punctuation CricIQ uses.
const transformHeader = (h: string) =>
  h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

function rowsFromParseResult(results: Papa.ParseResult<Record<string, string>>): {
  rows: ParsedCricIQRow[] | null;
  error: string | null;
} {
  const headers = results.meta.fields ?? [];
  const hasCricClubsId = headers.some((h) => h === "cricclubs_id");

  if (!hasCricClubsId) {
    return { rows: null, error: `Needs a "CricClubs ID" column. Found: ${headers.join(", ") || "(none)"}` };
  }

  const rows: ParsedCricIQRow[] = results.data.map((r) => {
    const cricclubsId = (r.cricclubs_id || "").trim();
    const num = (v: string | undefined): number | null => {
      if (v === undefined || v === null || v.trim() === "") return null;
      const n = Number(v);
      return isNaN(n) ? null : n;
    };
    return {
      cricclubsId,
      playerName: (r.player_name || "").trim(),
      status: (r.status || "").trim(),
      error: (r.error || "").trim(),
      primaryRole: (r.primary_role || "").trim(),
      persona: (r.persona || "").trim(),
      superpowers: (r.superpowers || "").trim(),
      strengths: (r.strengths || "").trim(),
      watchOuts: (r.watch_outs || "").trim(),
      patterns: (r.patterns || "").trim(),
      runs: num(r.runs),
      innings: num(r.innings),
      notOuts: num(r.not_outs),
      battingAvg: num(r.batting_average),
      strikeRate: num(r.strike_rate),
      highestScore: num(r.highest_score),
      fifties: num(r["50s"]),
      hundreds: num(r["100s"]),
      fours: num(r.fours),
      sixes: num(r.sixes),
      ducks: num(r.ducks),
      boundaryPct: num(r.boundary),
      wickets: num(r.wickets),
      overs: num(r.overs),
      maidens: num(r.maidens),
      economy: num(r.economy),
      bowlingAvg: num(r.bowling_average),
      bowlingSr: num(r.bowling_sr),
      roleBasis: (r.role_basis || "").trim(),
      battingScore: num(r.batting_score_0_100),
      bowlingScore: num(r.bowling_score_0_100),
      performanceScore: num(r.performance_score_0_100),
      raw: r,
      valid: !!cricclubsId,
    };
  });

  return { rows, error: null };
}

const parseConfig = { header: true as const, skipEmptyLines: true as const, transformHeader };

export function CricIQUploadForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"file" | "paste">("file");
  const [rows, setRows] = useState<ParsedCricIQRow[]>([]);
  const [sourceLabel, setSourceLabel] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<CricIQUploadResult | null>(null);

  const validCount = rows.filter((r) => r.valid).length;

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
    Papa.parse<Record<string, string>>(file, { ...parseConfig, complete: applyParseResult, error: (e) => setParseError(e.message) });
  };

  const handleParsePaste = () => {
    setResult(null);
    setSourceLabel("pasted text");
    if (!pasteText.trim()) {
      setParseError("Paste the report contents first.");
      return;
    }
    applyParseResult(Papa.parse<Record<string, string>>(pasteText.trim(), parseConfig));
  };

  const handleUpload = () => {
    const validRows = rows.filter((r) => r.valid);
    startTransition(async () => {
      const res = await bulkUploadCricIQAction(validRows);
      setResult(res);
      setRows([]);
      setSourceLabel("");
      setPasteText("");
      router.refresh();
    });
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
        <Sparkles size={13} /> Upload CricIQ report
      </button>
    );
  }

  return (
    <div className="border border-[var(--line)] rounded-lg p-4 bg-[var(--paper)] space-y-3 mb-4">
      <h3 className="text-sm font-semibold flex items-center gap-1.5">
        <Sparkles size={14} className="text-[var(--brand)]" /> Upload CricIQ tournament report
      </h3>
      <p className="text-xs text-[var(--ink-soft)]">
        Export a tournament report from CricIQ and upload it here. Players are matched by CricClubs ID —
        rows for players not yet in your pool are skipped and listed below.
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
            Matched {result.matched} player{result.matched !== 1 ? "s" : ""}
            {result.unmatched > 0 && ` · ${result.unmatched} not found in pool`}
            {result.skipped > 0 && ` · ${result.skipped} skipped`}
          </p>
          {result.unmatchedNames.length > 0 && (
            <p className="text-xs text-[var(--ink-soft)] mt-1">Not in pool: {result.unmatchedNames.slice(0, 8).join(", ")}{result.unmatchedNames.length > 8 && "…"}</p>
          )}
          {result.skippedReasons.length > 0 && (
            <ul className="text-xs text-[var(--danger)] mt-1 space-y-0.5">
              {result.skippedReasons.slice(0, 8).map((s, i) => (
                <li key={i}>{s.name}: {s.reason}</li>
              ))}
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
            placeholder="Paste the CricIQ report CSV contents here, including the header row"
            rows={5}
            className="w-full px-2 py-2 rounded border border-[var(--line)] text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/30"
          />
          <button
            onClick={handleParsePaste}
            className="py-1.5 px-4 rounded bg-white border border-[var(--line)] text-xs font-semibold text-[var(--ink-soft)] hover:border-[var(--brand)] hover:text-[var(--brand)] transition-colors"
          >
            Parse pasted report
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
            {sourceLabel}: {validCount} row{validCount !== 1 ? "s" : ""} ready
          </p>
          <div className="max-h-48 overflow-y-auto border border-[var(--line)] rounded bg-white">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-[var(--paper)]">
                <tr className="text-left text-[var(--ink-soft)] border-b border-[var(--brand-soft)]">
                  <th className="px-2 py-1.5">Name</th>
                  <th className="px-2 py-1.5">CricClubs ID</th>
                  <th className="px-2 py-1.5">Status</th>
                  <th className="px-2 py-1.5">Role</th>
                  <th className="px-2 py-1.5">Bat</th>
                  <th className="px-2 py-1.5">Bowl</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-[var(--paper)] last:border-0">
                    <td className="px-2 py-1">{r.playerName}</td>
                    <td className="px-2 py-1 font-mono">{r.cricclubsId}</td>
                    <td className="px-2 py-1">{r.status}</td>
                    <td className="px-2 py-1">{r.primaryRole || "—"}</td>
                    <td className="px-2 py-1 font-mono">{r.battingScore ?? "—"}</td>
                    <td className="px-2 py-1 font-mono">{r.bowlingScore ?? "—"}</td>
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
          {isPending ? "Uploading…" : `Upload ${validCount || ""} row${validCount !== 1 ? "s" : ""}`}
        </button>
        <button onClick={reset} className="px-3 py-1.5 rounded border border-[var(--line)] text-xs font-semibold text-[var(--ink-soft)]">
          Close
        </button>
      </div>
    </div>
  );
}
