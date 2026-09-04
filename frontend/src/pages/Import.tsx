import { useMemo, useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight, CalendarRange, CheckCircle2, FileText, Loader2, Sparkles, Upload } from "lucide-react";
import { confirmStatement, previewStatementStream } from "@/api";
import type { PreviewTransaction, StatementImportResult } from "@/types";
import { formatINR, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type AccountEdit = { bank: string; last4: string; accountType: string };
type Summary = { spending: number; earning: number; fromDate: string | null; toDate: string | null };

const ACCOUNT_TYPES = [
  { value: "SAVINGS", label: "Savings account" },
  { value: "CREDIT_CARD", label: "Credit card" },
  { value: "DEBIT_CARD", label: "Debit card" },
];

// The categories the AI may assign — used to populate the per-row dropdown.
const CATEGORY_OPTIONS = [
  "Food",
  "Shopping",
  "Bills & Utilities",
  "Transport",
  "Entertainment",
  "Health",
  "Transfers",
  "Card Payment",
  "Income",
  "Miscellaneous",
  "Uncategorized",
];
function categoryOptions(current?: string | null): string[] {
  return current && !CATEGORY_OPTIONS.includes(current) ? [current, ...CATEGORY_OPTIONS] : CATEGORY_OPTIONS;
}

export default function Import() {
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [started, setStarted] = useState(false); // a scan has begun → show the review area
  const [scanning, setScanning] = useState(false); // stream in progress
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [acct, setAcct] = useState<AccountEdit>({ bank: "", last4: "", accountType: "SAVINGS" });
  const [accountMeta, setAccountMeta] = useState<{ displayName: string | null; isNew: boolean }>({
    displayName: null,
    isNew: true,
  });
  const [rows, setRows] = useState<PreviewTransaction[]>([]);
  const [detectedCards, setDetectedCards] = useState<string[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [result, setResult] = useState<StatementImportResult | null>(null);

  function reset() {
    abortRef.current?.abort();
    setFile(null);
    setStarted(false);
    setScanning(false);
    setRows([]);
    setDetectedCards([]);
    setSummary(null);
    setResult(null);
    setError("");
    setAcct({ bank: "", last4: "", accountType: "SAVINGS" });
    setAccountMeta({ displayName: null, isNew: true });
    if (inputRef.current) inputRef.current.value = "";
  }

  function setCategory(i: number, category: string) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, category } : r)));
  }

  // Cards the backend detected from the statement's card sections (shown even if a card's rows
  // couldn't be extracted, e.g. a card with only a payment). Falls back to rows' last-4s.
  const cards = useMemo(() => {
    if (detectedCards.length > 0) return detectedCards;
    return Array.from(new Set(rows.map((r) => r.last4).filter((x): x is string => !!x)));
  }, [detectedCards, rows]);
  const multiCard = cards.length > 1;

  async function scan() {
    if (!file || scanning) return;
    setError("");
    setResult(null);
    setRows([]);
    setDetectedCards([]);
    setSummary(null);
    setStarted(true);
    setScanning(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await previewStatementStream(
        file,
        {
          onAccount: (a, cards) => {
            setAcct({ bank: a.bank ?? "", last4: a.last4 ?? "", accountType: a.accountType ?? "SAVINGS" });
            setAccountMeta({ displayName: a.displayName, isNew: a.isNew });
            setDetectedCards(cards ?? []);
          },
          onTransactions: (batch) => setRows((rs) => [...rs, ...batch]),
          onDone: (s) =>
            setSummary({
              spending: Number(s.spending),
              earning: Number(s.earning),
              fromDate: s.fromDate,
              toDate: s.toDate,
            }),
        },
        ctrl.signal
      );
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        setError("Couldn't read this file. Make sure it's a valid PDF, Excel, or CSV statement and the backend is up.");
      }
    } finally {
      setScanning(false);
    }
  }

  async function confirm() {
    if (confirming || scanning || rows.length === 0) return;
    setConfirming(true);
    setError("");
    try {
      const res = await confirmStatement({
        fileName: file?.name ?? "statement",
        bank: acct.bank.trim() || null,
        // Multi-card: each row carries its own card last-4, so don't force a single account.
        last4: multiCard ? null : acct.last4.trim() || null,
        accountType: acct.accountType || null,
        transactions: rows,
      });
      setResult(res);
      setStarted(false);
      setRows([]);
      setSummary(null);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch {
      setError("Import failed. Please try again — the backend may be down.");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Import statements</h1>
        <p className="text-muted-foreground">
          Upload a bank or credit-card statement (PDF, Excel, or CSV). Jarvis scans it and shows you
          what it found — nothing is saved until you confirm.
        </p>
      </div>

      {/* Step 1 — upload + scan */}
      {!started && !result && (
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
                  <span className="text-xs text-muted-foreground">PDF, XLS/XLSX, or CSV — up to 10 MB</span>
                </>
              )}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.csv,.xls,.xlsx,application/pdf,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => {
                setError("");
                setFile(e.target.files?.[0] ?? null);
              }}
            />

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button onClick={scan} disabled={!file} className="w-full gap-2">
              <Sparkles className="size-4" /> Scan statement
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 2 — review (streams in live) + confirm */}
      {started && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Review before importing</CardTitle>
              <CardDescription>
                {file?.name} · nothing has been saved yet.
              </CardDescription>
            </div>
            {scanning && (
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Scanning… {rows.length} so far
              </span>
            )}
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Detected account — editable, prefilled from the scan */}
            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{multiCard ? "Cards" : "Account"}</span>
                {multiCard ? (
                  <Badge className="border-transparent bg-violet-500/15 text-violet-500">
                    {cards.length} cards detected
                  </Badge>
                ) : (
                  accountMeta.isNew &&
                  acct.last4 && (
                    <Badge className="border-transparent bg-emerald-500/15 text-emerald-500">
                      New — will be added
                    </Badge>
                  )
                )}
              </div>
              {multiCard && (
                <div className="flex flex-wrap gap-2">
                  {cards.map((c) => (
                    <Badge key={c} variant="secondary" className="font-mono">
                      •••• {c}
                    </Badge>
                  ))}
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs text-muted-foreground">Bank</Label>
                  <Input value={acct.bank} onChange={(e) => setAcct({ ...acct, bank: e.target.value })} placeholder="e.g. HDFC" />
                </div>
                {!multiCard && (
                  <div className="grid gap-1.5">
                    <Label className="text-xs text-muted-foreground">Account no. (last 4)</Label>
                    <Input
                      value={acct.last4}
                      onChange={(e) => setAcct({ ...acct, last4: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                      inputMode="numeric"
                      placeholder="1380"
                    />
                  </div>
                )}
                <div className="grid gap-1.5">
                  <Label className="text-xs text-muted-foreground">Type</Label>
                  <Select value={acct.accountType} onValueChange={(v) => setAcct({ ...acct, accountType: (v as string) ?? "SAVINGS" })}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACCOUNT_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {!scanning && !multiCard && !acct.last4 && (
                <p className="text-xs text-amber-500">
                  No account number detected — enter the last 4 digits so these land in the right account.
                </p>
              )}
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Transactions" value={String(rows.length)} />
              <Stat
                label="Spending"
                value={summary ? formatINR(summary.spending) : "…"}
                icon={<ArrowDownRight className="size-4" />}
                color="#f43f5e"
              />
              <Stat
                label="Earning"
                value={summary ? formatINR(summary.earning) : "…"}
                icon={<ArrowUpRight className="size-4" />}
                color="#10b981"
              />
              <Stat
                label="Period"
                value={
                  summary?.fromDate && summary?.toDate
                    ? `${formatDate(summary.fromDate)} – ${formatDate(summary.toDate)}`
                    : "—"
                }
                icon={<CalendarRange className="size-4" />}
                color="#8b5cf6"
                small
              />
            </div>

            {/* Transaction table (rows stream in). Style the Table's own container as the scroll box
                (max height + always-visible horizontal scrollbar); long merchant names force width. */}
            <div className="rounded-lg border [&>div]:max-h-[360px] [&>div]:overflow-x-scroll [&>div]:overflow-y-auto">
              <Table className="min-w-[760px]">
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow>
                    <TableHead>Date</TableHead>
                    {multiCard && <TableHead>Card</TableHead>}
                    <TableHead>Merchant</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((t, i) => (
                    <TableRow key={i}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {t.occurredOn ? formatDate(t.occurredOn) : "—"}
                      </TableCell>
                      {multiCard && (
                        <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                          {t.last4 ? `•• ${t.last4}` : "—"}
                        </TableCell>
                      )}
                      <TableCell className="font-medium whitespace-nowrap">{t.merchant ?? "—"}</TableCell>
                      <TableCell>
                        <Select value={t.category ?? "Uncategorized"} onValueChange={(v) => setCategory(i, (v as string) ?? "Uncategorized")}>
                          <SelectTrigger size="sm" className="w-[160px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {categoryOptions(t.category).map((c) => (
                              <SelectItem key={c} value={c}>
                                {c}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell
                        className="text-right font-semibold tabular-nums"
                        style={{ color: t.direction === "DEBIT" ? "#f43f5e" : "#10b981" }}
                      >
                        {t.direction === "DEBIT" ? "−" : "+"}
                        {formatINR(t.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {scanning && (
                    <TableRow>
                      <TableCell colSpan={multiCard ? 5 : 4} className="text-center text-sm text-muted-foreground">
                        <Loader2 className="mr-2 inline size-4 animate-spin" /> Reading more transactions…
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex flex-wrap gap-3">
              <Button onClick={confirm} disabled={confirming || scanning || rows.length === 0} className="gap-2">
                {confirming ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Importing…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="size-4" /> Confirm &amp; import {rows.length} transactions
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={reset} disabled={confirming}>
                {scanning ? "Stop" : "Cancel"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Result */}
      {result && (
        <Card>
          <CardHeader className="flex flex-row items-center gap-3 space-y-0">
            <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-500">
              <CheckCircle2 className="size-5" />
            </div>
            <div>
              <CardTitle className="text-base">Imported {result.fileName}</CardTitle>
              <CardDescription>
                {result.accountName ? `Into ${result.accountName}` : "Account could not be detected"}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Found" value={String(result.total)} />
              <Stat label="Imported" value={String(result.imported)} color="#10b981" />
              <Stat label="Duplicates" value={String(result.duplicates)} color="#f59e0b" />
              <Stat label="Skipped" value={String(result.skipped)} color="#6b7280" />
            </div>
            <Button variant="outline" onClick={reset} className="gap-2">
              <Upload className="size-4" /> Import another
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
  color,
  small,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  color?: string;
  small?: boolean;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon && <span style={color ? { color } : undefined}>{icon}</span>}
        {label}
      </div>
      <div
        className={`${small ? "text-sm" : "text-2xl"} font-bold tracking-tight`}
        style={color && !small ? { color } : undefined}
      >
        {value}
      </div>
    </div>
  );
}
