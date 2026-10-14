"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowsClockwise, Trash, UploadSimple } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect } from "@/components/ui/field";
import { addSource, fetchJobStatus, removeSource, syncSource } from "@/app/(app)/import/actions";

export function FileImport() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [path, setPath] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const structured = !!file && /\.(xml|json)$/i.test(file.name);
  const submit = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      if (path) fd.set("recordPath", path);
      const res = await fetch("/api/import/upload", { method: "POST", body: fd });
      const body = (await res.json().catch(() => ({}))) as { batchId?: string; error?: string };
      if (!res.ok || !body.batchId) throw new Error(body.error ?? "Nie udało się wczytać pliku.");
      router.push(`/import/${body.batchId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się wczytać pliku.");
      setBusy(false);
    }
  };
  return (
    <div className="mt-4 flex flex-col gap-3">
      <Field label="Plik" htmlFor="import-file">
        <Input id="import-file" type="file" accept=".csv,.txt,.xml,.json,text/csv,application/xml,text/xml,application/json" className="h-auto py-1.5" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </Field>
      {structured && (
        <Field label="Ścieżka do listy ofert" htmlFor="import-path" optional hint="Np. oferty.oferta. Bez ścieżki aplikacja znajdzie najdłuższą listę rekordów.">
          <Input id="import-path" value={path} onChange={(e) => setPath(e.target.value)} maxLength={200} />
        </Field>
      )}
      <Button onClick={submit} loading={busy} disabled={!file} className="self-start"><UploadSimple /> Wczytaj i pokaż podgląd</Button>
    </div>
  );
}

interface AdapterInfo {
  kind: "asari" | "esticrm";
  label: string;
  accountLabel: string;
  tokenLabel: string;
  docsUrl: string;
}

export function SourceForm({ adapters }: { adapters: AdapterInfo[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [kind, setKind] = useState<"feed_xml" | "feed_json" | "asari" | "esticrm">("feed_xml");
  const [f, setF] = useState({ name: "", url: "", recordPath: "", authType: "none" as "none" | "basic" | "bearer", authValue: "", account: "", token: "", defaultTransaction: "sale" as "sale" | "rent" });
  const adapter = adapters.find((a) => a.kind === kind);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const submit = () =>
    start(async () => {
      const input = adapter ? { kind: adapter.kind, name: f.name, account: f.account, token: f.token } : { kind: kind as "feed_xml" | "feed_json", name: f.name, url: f.url, recordPath: f.recordPath, authType: f.authType, authValue: f.authValue, defaultTransaction: f.defaultTransaction };
      const r = await addSource(input);
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message ?? "Dodano źródło.");
      setF((s) => ({ ...s, name: "", url: "", authValue: "", token: "", account: "" }));
      router.refresh();
    });
  return (
    <div className="mt-4 flex flex-col gap-3">
      <Field label="Rodzaj źródła" htmlFor="src-kind">
        <NativeSelect id="src-kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          <option value="feed_xml">Feed XML (adres URL)</option>
          <option value="feed_json">Feed JSON (adres URL)</option>
          {adapters.map((a) => <option key={a.kind} value={a.kind}>{a.label} (oficjalne API)</option>)}
        </NativeSelect>
      </Field>
      <Field label="Nazwa źródła" htmlFor="src-name"><Input id="src-name" value={f.name} onChange={set("name")} maxLength={120} placeholder={adapter ? adapter.label : "Eksport ofert z CRM"} /></Field>
      {adapter ? (
        <>
          <Field label={adapter.accountLabel} htmlFor="src-account"><Input id="src-account" value={f.account} onChange={set("account")} autoComplete="off" /></Field>
          <Field label={adapter.tokenLabel} htmlFor="src-token" hint={<>Dokumentacja: <a href={adapter.docsUrl} target="_blank" rel="noreferrer noopener" className="text-accent-ink hover:underline">{adapter.label}</a>. Token zapisujemy zaszyfrowany.</>}>
            <Input id="src-token" type="password" value={f.token} onChange={set("token")} autoComplete="off" />
          </Field>
        </>
      ) : (
        <>
          <Field label="Adres feedu" htmlFor="src-url" hint="Tylko publiczne adresy http(s). Adresy lokalne i sieci prywatne są blokowane."><Input id="src-url" type="url" value={f.url} onChange={set("url")} placeholder="https://crm.example.pl/eksport/oferty.xml" /></Field>
          <Field label="Ścieżka do listy ofert" htmlFor="src-path" optional><Input id="src-path" value={f.recordPath} onChange={set("recordPath")} placeholder="oferty.oferta" /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Autoryzacja" htmlFor="src-auth">
              <NativeSelect id="src-auth" value={f.authType} onChange={set("authType")}>
                <option value="none">Brak</option>
                <option value="basic">Login i hasło (Basic)</option>
                <option value="bearer">Token (Bearer)</option>
              </NativeSelect>
            </Field>
            <Field label="Domyślna transakcja" htmlFor="src-tx">
              <NativeSelect id="src-tx" value={f.defaultTransaction} onChange={set("defaultTransaction")}>
                <option value="sale">Sprzedaż</option>
                <option value="rent">Wynajem</option>
              </NativeSelect>
            </Field>
          </div>
          {f.authType !== "none" && <Field label={f.authType === "basic" ? "login:hasło" : "Token"} htmlFor="src-secret"><Input id="src-secret" type="password" value={f.authValue} onChange={set("authValue")} autoComplete="off" /></Field>}
        </>
      )}
      <Button onClick={submit} loading={pending} className="self-start">Dodaj źródło</Button>
    </div>
  );
}

export function SourceActions({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [job, setJob] = useState<{ id: string; progress: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const poll = (jobId: string) => {
    timer.current = setTimeout(async () => {
      const r = await fetchJobStatus(jobId);
      if (!r.ok) {
        setJob(null);
        return void toast.error(r.error);
      }
      if (r.data.status === "succeeded" && r.data.batchId) return router.push(`/import/${r.data.batchId}`);
      if (r.data.status === "failed" || r.data.status === "canceled") {
        setJob(null);
        toast.error(r.data.error ?? "Nie udało się pobrać ofert.");
        return router.refresh();
      }
      setJob({ id: jobId, progress: r.data.progress });
      poll(jobId);
    }, 1500);
  };
  return (
    <div className="flex items-center gap-1.5">
      <Button size="sm" variant="secondary" loading={pending || !!job} onClick={() => start(async () => {
        const r = await syncSource(id);
        if (!r.ok) return void toast.error(r.error);
        setJob({ id: r.data.jobId, progress: 0 });
        poll(r.data.jobId);
      })}><ArrowsClockwise /> {job ? `Pobieranie ${job.progress}%` : "Synchronizuj"}</Button>
      <Button size="sm" variant="danger-ghost" aria-label={`Usuń źródło ${name}`} onClick={() => {
        if (!confirm(`Usunąć źródło „${name}”? Zaimportowane oferty zostaną w aplikacji.`)) return;
        start(async () => {
          const r = await removeSource(id);
          if (r.ok) toast.success(r.message ?? "Usunięto.");
          else toast.error(r.error);
          router.refresh();
        });
      }}><Trash /></Button>
    </div>
  );
}
