import { useRef, useState } from "react";
import { CheckCircle2, FileText, Loader2, Upload } from "lucide-react";
import { importStatement } from "@/api";
import type { StatementImportResult } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Import() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<StatementImportResult | null>(null);

  async function upload() {
    if (!file || busy) return;
    setError("");
    setResult(null);
    setBusy(true);
    try {
      setResult(await importStatement(file));
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (err: any) {
      setError(
        err?.code === "ECONNABORTED"
          ? "The scan timed out. Try a smaller statement, or check the AI service is running."
          : "Import failed. Make sure the file is a valid PDF/CSV statement and the backend is up."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Import statements</h1>
        <p className="text-muted-foreground">
          Upload a bank or credit-card statement (PDF or CSV). Jarvis scans it, detects which
          account it belongs to, and adds the transactions automatically — duplicates are skipped.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload a statement</CardTitle>
          <CardDescription>Any bank or card — the AI figures out the account.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/30 px-6 py-10 text-center transition-colors hover:border-primary hover:bg-muted/50"
          >
            <Upload className="size-7 text-muted-foreground" />
            {file ? (
              <span className="flex items-center gap-2 text-sm font-medium">
                <FileText className="size-4 text-primary" /> {file.name}
              </span>
            ) : (
              <>
                <span className="text-sm font-medium">Click to choose a file</span>
                <span className="text-xs text-muted-foreground">PDF or CSV, up to 10 MB</span>
              </>
            )}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.csv,application/pdf,text/csv"
            className="hidden"
            onChange={(e) => {
              setResult(null);
              setError("");
              setFile(e.target.files?.[0] ?? null);
            }}
          />

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button onClick={upload} disabled={!file || busy} className="w-full gap-2">
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Scanning…
              </>
            ) : (
              <>
                <Upload className="size-4" /> Upload &amp; scan
              </>
            )}
          </Button>
          {busy && (
            <p className="text-center text-xs text-muted-foreground">
              Reading the statement and extracting transactions — this can take a moment on a local model.
            </p>
          )}
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader className="flex flex-row items-center gap-3 space-y-0">
            <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-500">
              <CheckCircle2 className="size-5" />
            </div>
            <div>
              <CardTitle className="text-base">Imported {result.fileName}</CardTitle>
              <CardDescription>
                {result.accountName
                  ? `Into ${result.accountName}`
                  : "Account could not be detected from the statement"}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Found" value={result.total} />
              <Stat label="Imported" value={result.imported} accent="#10b981" />
              <Stat label="Duplicates" value={result.duplicates} accent="#f59e0b" />
              <Stat label="Skipped" value={result.skipped} accent="#6b7280" />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold tracking-tight" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
    </div>
  );
}
