"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Activity,
  ArchiveX,
  BookOpenText,
  Brain,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronRight,
  CircleSlash2,
  Clock3,
  ExternalLink,
  Eye,
  Heart,
  LibraryBig,
  Link2,
  LoaderCircle,
  LogOut,
  Newspaper,
  RadioTower,
  RefreshCw,
  Search,
  Sparkles,
  Undo2,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type {
  ContentExpansion,
  ContentLead,
  DailyEditorialBoard,
  DashboardState,
  LeadFeedbackValue,
  ProcessingRun
} from "@/lib/types";

type Tab = "daily" | "processing" | "leads" | "rejected" | "sources" | "memory" | "reference";

type CollectionResult = {
  provider: string;
  status: "fetched" | "skipped" | "failed";
  fetched: number;
  created?: number;
  rejected?: number;
  duplicates?: number;
  error?: string;
};

type CollectionRunResponse = {
  results: CollectionResult[];
  totals: {
    fetched: number;
    created: number;
    rejected: number;
    duplicates: number;
  };
  boardJob: {
    status: "pending" | "ready";
    expectedCount: number;
  };
  processingRun: { id: string; stage: ProcessingRun["stage"]; status: "running" };
};

type RunSummary = CollectionRunResponse["totals"] & {
  completedAt: string;
  failures: string[];
};

const tabMeta: Record<Tab, { label: string; title: string; Icon: LucideIcon }> = {
  daily: { label: "สรุปวันนี้", title: "สรุปข่าวน่าสนใจวันนี้", Icon: CalendarDays },
  processing: { label: "การประมวลผล", title: "Processing Runs", Icon: Activity },
  leads: { label: "ข่าวที่คัดแล้ว", title: "ข่าวที่คัดแล้ว", Icon: Newspaper },
  rejected: { label: "ไม่ผ่าน", title: "รายการที่ไม่ผ่าน", Icon: ArchiveX },
  sources: { label: "แหล่งข่าว", title: "แหล่งข่าว", Icon: RadioTower },
  memory: { label: "ความสนใจ", title: "Editorial Memory", Icon: Brain },
  reference: { label: "คลังอ้างอิง", title: "Reference Library", Icon: LibraryBig }
};

const feedbackMeta: Record<LeadFeedbackValue, { label: string; Icon: LucideIcon }> = {
  interested: { label: "สนใจ", Icon: Heart },
  not_relevant: { label: "ไม่เกี่ยว", Icon: CircleSlash2 },
  too_weak: { label: "ประเด็นอ่อน", Icon: X },
  already_known: { label: "ทราบแล้ว", Icon: CheckCheck }
};

const LAST_RUN_KEY = "ai-news-curation:last-run";

export function DashboardClient({ initialState }: { initialState: DashboardState }) {
  const [state, setState] = useState(initialState);
  const [activeTab, setActiveTab] = useState<Tab>("daily");
  const [selectedBoardDate, setSelectedBoardDate] = useState(initialState.dailyBoards[0]?.boardDate ?? "");
  const [selectedLeadId, setSelectedLeadId] = useState(initialState.leads[0]?.id ?? "");
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState<"neutral" | "success" | "error">("neutral");
  const [busy, setBusy] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [lastRun, setLastRun] = useState<RunSummary | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(LAST_RUN_KEY);
    if (!stored) return;

    try {
      setLastRun(JSON.parse(stored) as RunSummary);
    } catch {
      window.localStorage.removeItem(LAST_RUN_KEY);
    }
  }, []);

  const selectedLead = useMemo(
    () => state.leads.find((lead) => lead.id === selectedLeadId) ?? state.leads[0],
    [selectedLeadId, state.leads]
  );

  const selectedBoard = useMemo(
    () => state.dailyBoards.find((board) => board.boardDate === selectedBoardDate) ?? state.dailyBoards[0],
    [selectedBoardDate, state.dailyBoards]
  );

  useEffect(() => {
    const hasActiveRun = state.processingRuns.some((run) => run.status === "running");
    const boardPending = Boolean(selectedBoard && selectedBoard.status !== "ready");
    if (!hasActiveRun && !boardPending) return;

    const timer = window.setInterval(async () => {
      try {
        const response = await fetch("/api/leads", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as DashboardState;
        setState(payload);
        setSelectedBoardDate((current) => current || payload.dailyBoards[0]?.boardDate || "");
      } catch {
        // The visible board status remains authoritative while polling is unavailable.
      }
    }, 15_000);

    return () => window.clearInterval(timer);
  }, [selectedBoard, state.processingRuns]);

  async function refreshDashboard() {
    const response = await fetch("/api/leads", { cache: "no-store" });
    if (!response.ok) throw new Error("โหลดข้อมูล dashboard ไม่สำเร็จ");

    const payload = (await response.json()) as DashboardState;
    setState(payload);
    setSelectedLeadId((current) => current || payload.leads[0]?.id || "");
    setSelectedBoardDate((current) => current || payload.dailyBoards[0]?.boardDate || "");
    return payload;
  }

  async function collectNews() {
    setBusy(true);
    setCollecting(true);
    setStatusTone("neutral");
    setStatus("กำลังเรียกข่าวจากทุกแหล่งที่เปิดใช้งาน");

    try {
      const response = await fetch("/api/intake/apis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      const payload = (await response.json()) as CollectionRunResponse | { error?: string };

      if (!response.ok || !("totals" in payload)) {
        throw new Error("error" in payload ? payload.error || "เรียกข่าวไม่สำเร็จ" : "เรียกข่าวไม่สำเร็จ");
      }

      const nextState = await refreshDashboard();
      const summary: RunSummary = {
        ...payload.totals,
        completedAt: new Date().toISOString(),
        failures: payload.results
          .filter((result) => result.status !== "fetched")
          .map((result) => result.provider)
      };
      setLastRun(summary);
      window.localStorage.setItem(LAST_RUN_KEY, JSON.stringify(summary));
      setActiveTab("processing");
      setSelectedBoardDate(nextState.dailyBoards[0]?.boardDate ?? "");
      setSelectedLeadId(nextState.leads[0]?.id ?? "");
      setStatusTone(summary.failures.length > 0 ? "neutral" : "success");
      setStatus(
        `รับข่าวจาก API แล้ว · ดึง ${summary.fetched} · ใหม่ ${summary.created} · ซ้ำ ${summary.duplicates} · local worker จะอ่าน Gmail และต้นทางก่อนคัดข่าว`
      );
    } catch (error) {
      setStatusTone("error");
      setStatus(error instanceof Error ? error.message : "เรียกข่าวไม่สำเร็จ");
    } finally {
      setCollecting(false);
      setBusy(false);
    }
  }

  async function submitManualUrl(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatusTone("neutral");
    setStatus("กำลังเพิ่ม URL เข้า pipeline");

    try {
      const response = await fetch("/api/intake/manual-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });
      const payload = await response.json();

      if (!response.ok) throw new Error(payload.error ?? "เพิ่ม URL ไม่สำเร็จ");

      await refreshDashboard();
      setActiveTab("processing");
      setUrl("");
      setStatusTone("success");
      setStatus(payload.status === "duplicate" ? "URL นี้มีอยู่ในระบบแล้ว" : "เพิ่ม URL แล้ว · รอ local worker อ่านต้นทางและคัดข่าว");
    } catch (error) {
      setStatusTone("error");
      setStatus(error instanceof Error ? error.message : "เกิดข้อผิดพลาด");
    } finally {
      setBusy(false);
    }
  }

  async function giveFeedback(leadId: string, feedback: LeadFeedbackValue) {
    setBusy(true);
    setStatusTone("neutral");
    setStatus(`กำลังบันทึก: ${feedbackMeta[feedback].label}`);

    try {
      const response = await fetch(`/api/leads/${leadId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback })
      });

      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error ?? "บันทึก feedback ไม่สำเร็จ");
      }

      await refreshDashboard();
      setStatusTone("success");
      setStatus("บันทึก feedback แล้ว");
    } catch (error) {
      setStatusTone("error");
      setStatus(error instanceof Error ? error.message : "เกิดข้อผิดพลาด");
    } finally {
      setBusy(false);
    }
  }

  async function expandLead(leadId: string) {
    setBusy(true);
    setStatusTone("neutral");
    setStatus("กำลังสร้าง Content Expansion");

    try {
      const response = await fetch(`/api/leads/${leadId}/expand`, { method: "POST" });
      const payload = (await response.json()) as ContentExpansion | { error?: string };

      if (!response.ok || "error" in payload) {
        throw new Error("error" in payload ? payload.error : "สร้าง Expansion ไม่สำเร็จ");
      }

      await refreshDashboard();
      setStatusTone("success");
      setStatus("สร้าง Content Expansion แล้ว");
    } catch (error) {
      setStatusTone("error");
      setStatus(error instanceof Error ? error.message : "เกิดข้อผิดพลาด");
    } finally {
      setBusy(false);
    }
  }

  async function restoreRejected(id: string) {
    setBusy(true);
    setStatusTone("neutral");
    setStatus("กำลังกู้รายการกลับ");

    try {
      const response = await fetch(`/api/rejected/${id}/restore`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "กู้รายการไม่สำเร็จ");

      await refreshDashboard();
      setActiveTab("processing");
      setStatusTone("success");
      setStatus("กู้รายการกลับแล้ว · รอ Codex คัดใหม่");
    } catch (error) {
      setStatusTone("error");
      setStatus(error instanceof Error ? error.message : "เกิดข้อผิดพลาด");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (response.ok) window.location.assign("/login");
  }

  async function retryRun(runId: string) {
    setBusy(true);
    setStatusTone("neutral");
    setStatus("กำลังนำ Processing Run กลับเข้าคิว");
    try {
      const response = await fetch(`/api/processing-runs/${runId}/retry`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "retry ไม่สำเร็จ");
      await refreshDashboard();
      setStatusTone("success");
      setStatus("นำ Processing Run กลับเข้าคิวแล้ว");
    } catch (error) {
      setStatusTone("error");
      setStatus(error instanceof Error ? error.message : "retry ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const ActiveIcon = tabMeta[activeTab].Icon;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true"><Sparkles size={16} /></span>
          <div>
            <strong>AI News</strong>
            <span>Editorial workspace</span>
          </div>
        </div>

        <nav className="nav" aria-label="ส่วนของ Dashboard">
          {(Object.keys(tabMeta) as Tab[]).map((tab) => {
            const { Icon, label } = tabMeta[tab];
            return (
              <button
                className={activeTab === tab ? "active" : ""}
                key={tab}
                onClick={() => setActiveTab(tab)}
                type="button"
              >
                <Icon size={16} aria-hidden="true" />
                <span>{label}</span>
                {tab === "daily" && selectedBoard ? <span className="nav-count">{selectedBoard.items.length}</span> : null}
                {tab === "processing" ? <span className="nav-count">{state.processingRuns.filter((run) => run.status === "running").length}</span> : null}
                {tab === "leads" ? <span className="nav-count">{state.leads.length}</span> : null}
              </button>
            );
          })}
        </nav>

        <div className="run-summary">
          <div className="run-summary-title">
            <Clock3 size={15} aria-hidden="true" />
            <span>รอบล่าสุด</span>
          </div>
          {lastRun ? (
            <>
              <time dateTime={lastRun.completedAt}>
                {new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(lastRun.completedAt))}
              </time>
              <div className="run-summary-grid">
                <span>ดึง <strong>{lastRun.fetched}</strong></span>
                <span>ใหม่ <strong>{lastRun.created}</strong></span>
                <span>ซ้ำ <strong>{lastRun.duplicates}</strong></span>
                <span>ไม่ผ่าน <strong>{lastRun.rejected}</strong></span>
              </div>
              {lastRun.failures.length > 0 ? (
                <p className="run-warning">มีปัญหา: {lastRun.failures.join(", ")}</p>
              ) : (
                <p className="run-success"><Check size={13} /> ทุก source ตอบกลับ</p>
              )}
            </>
          ) : (
            <p>ยังไม่มี Collection Run ใน browser นี้</p>
          )}
        </div>
      </aside>

      <main className="main">
        <header className="workspace-header">
          <div className="breadcrumb" aria-label="ตำแหน่งปัจจุบัน">
            <span>Workspace</span>
            <ChevronRight size={14} aria-hidden="true" />
            <strong>{tabMeta[activeTab].label}</strong>
          </div>
          <div className="header-actions">
            <button className="collect-button" disabled={busy} onClick={collectNews} type="button">
              {collecting ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}
              {collecting ? "กำลังเรียกข่าว" : "เรียกข่าว"}
            </button>
            <button aria-label="ออกจากระบบ" className="icon-button" onClick={logout} title="ออกจากระบบ" type="button">
              <LogOut size={16} />
            </button>
          </div>
        </header>

        <div className="workspace-body">
          <div className="page-heading">
            <div className="page-icon" aria-hidden="true"><ActiveIcon size={20} /></div>
            <div>
              <h1>{tabMeta[activeTab].title}</h1>
              <span className="page-count">
                {activeTab === "daily" ? `${selectedBoard?.items.length ?? 0} เรื่อง` : null}
                {activeTab === "processing" ? `${state.processingRuns.length} runs` : null}
                {activeTab === "leads" ? `${state.leads.length} รายการ` : null}
                {activeTab === "rejected" ? `${state.rejected.length} รายการ` : null}
                {activeTab === "sources" ? `${state.sources.length} sources` : null}
                {activeTab === "memory" ? `${state.editorialPreferences.length} preferences` : null}
                {activeTab === "reference" ? `${state.referenceLibrary.length} references` : null}
              </span>
            </div>
          </div>

          {status ? (
            <div className={`status-banner ${statusTone}`} role="status">
              {statusTone === "error" ? <AlertCircle size={16} /> : statusTone === "success" ? <Check size={16} /> : <LoaderCircle className={busy ? "spin" : ""} size={16} />}
              <span>{status}</span>
            </div>
          ) : null}

          {activeTab === "daily" ? (
            <DailyBoardView
              board={selectedBoard}
              boards={state.dailyBoards}
              onDateChange={setSelectedBoardDate}
              selectedDate={selectedBoardDate}
            />
          ) : null}

          {activeTab === "processing" ? (
            <ProcessingRunsView busy={busy} onRetry={retryRun} runs={state.processingRuns} workerHeartbeat={state.workerHeartbeat} />
          ) : null}

          {activeTab === "leads" ? (
            <>
              <form className="url-form" onSubmit={submitManualUrl}>
                <Link2 size={17} aria-hidden="true" />
                <input
                  aria-label="URL ที่ต้องการเพิ่ม"
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="เพิ่ม URL ที่ต้องการให้ระบบตรวจ"
                  required
                  type="url"
                  value={url}
                />
                <button className="secondary-button" disabled={busy} type="submit">
                  <Search size={15} /> ตรวจ URL
                </button>
              </form>

              <div className="overview-strip" aria-label="สรุปรายการ">
                <div><span>พร้อมอ่าน</span><strong>{state.leads.length}</strong></div>
                <div><span>สนใจแล้ว</span><strong>{state.leads.filter((lead) => lead.feedback === "interested").length}</strong></div>
                <div><span>ความมั่นใจสูง</span><strong>{state.leads.filter((lead) => lead.confidenceLabel === "high").length}</strong></div>
              </div>

              <div className="grid">
                <section className="section" aria-label="รายการ Content Leads">
                  <div className="lead-list">
                    {state.leads.length > 0 ? state.leads.map((lead) => (
                      <LeadCard
                        busy={busy}
                        key={lead.id}
                        lead={lead}
                        onExpand={() => expandLead(lead.id)}
                        onFeedback={(feedback) => giveFeedback(lead.id, feedback)}
                        onSelect={() => setSelectedLeadId(lead.id)}
                        selected={lead.id === selectedLead?.id}
                      />
                    )) : <EmptyState text="ยังไม่มีข่าวที่ผ่านการคัด" />}
                  </div>
                </section>
                <LeadDetail busy={busy} lead={selectedLead} onExpand={() => selectedLead && expandLead(selectedLead.id)} />
              </div>
            </>
          ) : null}

          {activeTab === "rejected" ? (
            <section className="section">
              <div className="side-list">
                {state.rejected.length > 0 ? state.rejected.map((item) => (
                  <article className="side-card" key={item.id}>
                    <div>
                      <h3>{item.title}</h3>
                      <p>{item.rejectionReason}</p>
                    </div>
                    <a className="source-link" href={item.sourceUrl} target="_blank" rel="noreferrer">
                      <ExternalLink size={14} /> เปิดต้นทาง
                    </a>
                    <button className="secondary-button align-start" disabled={busy} onClick={() => restoreRejected(item.id)} type="button">
                      <Undo2 size={15} /> กู้กลับ
                    </button>
                  </article>
                )) : <EmptyState text="ยังไม่มีรายการที่ไม่ผ่าน" />}
              </div>
            </section>
          ) : null}

          {activeTab === "sources" ? (
            <section className="section">
              <div className="source-list">
                {state.sources.map((source) => (
                  <article className="source-row" key={source.id}>
                    <span className="source-icon"><RadioTower size={16} /></span>
                    <div>
                      <h3>{source.name}</h3>
                      <p>{source.type} · trust {source.trustLevel}</p>
                    </div>
                    <span className={`badge ${source.status === "needs_key" ? "low" : "ready"}`}>
                      {source.enabled ? source.status ?? "enabled" : "disabled"}
                    </span>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {activeTab === "memory" ? (
            <section className="section">
              <div className="side-list">
                {state.editorialPreferences.map((preference) => (
                  <article className="side-card compact" key={preference.id}>
                    <span className="eyebrow">{preference.preferenceType}</span>
                    <h3>{preference.description}</h3>
                    <span className="meta-line">evidence {preference.evidenceCount}</span>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {activeTab === "reference" ? (
            <section className="section">
              <div className="playbook-grid">
                {state.editorialPlaybooks.map((playbook) => (
                  <article className="side-card" key={playbook.id}>
                    <span className="eyebrow">Editorial Playbook · {playbook.sampleCount} samples</span>
                    <h3>{playbook.sourceName}</h3>
                    <div className="reference-columns">
                      <div><h4>Selection signals</h4><ul>{playbook.selectionSignals.map((item) => <li key={item}>{item}</li>)}</ul></div>
                      <div><h4>Guardrails</h4><ul>{playbook.guardrails.map((item) => <li key={item}>{item}</li>)}</ul></div>
                    </div>
                  </article>
                ))}
              </div>
              <div className="side-list">
                {state.referenceLibrary.map((item) => (
                  <article className="side-card" key={item.id}>
                    <div className="badge-row">
                      <span className="badge">{item.kind}</span>
                      <span className="badge muted-badge">public snapshot</span>
                    </div>
                    <h3>{item.title}</h3>
                    <p>{item.summaryTh}</p>
                    <div className="reference-columns">
                      <div>
                        <h4>Observed signals</h4>
                        <ul>{item.observedSignals.map((signal) => <li key={signal}>{signal}</li>)}</ul>
                      </div>
                      <div>
                        <h4>Usage guidance</h4>
                        <ul>{item.usageGuidanceTh.map((guidance) => <li key={guidance}>{guidance}</li>)}</ul>
                      </div>
                    </div>
                    <a className="source-link" href={item.sourceUrl} target="_blank" rel="noreferrer">
                      <ExternalLink size={14} /> เปิด source page
                    </a>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </main>
    </div>
  );
}

const stageLabels: Record<ProcessingRun["stage"], string> = {
  api_collection: "ดึงข่าวจาก API",
  gmail_sync: "อ่าน Gmail",
  newsletter_segmentation: "แยกเรื่องจาก Newsletter",
  source_enrichment: "อ่านต้นทาง",
  codex_curation: "Codex คัดข่าว",
  editorial_generation: "สร้างสรุปรายวัน",
  complete: "เสร็จแล้ว"
};

function ProcessingRunsView({
  runs,
  workerHeartbeat,
  busy,
  onRetry
}: {
  runs: ProcessingRun[];
  workerHeartbeat: DashboardState["workerHeartbeat"];
  busy: boolean;
  onRetry: (runId: string) => void;
}) {
  const workerOnline = workerHeartbeat
    ? Date.now() - new Date(workerHeartbeat.lastSeenAt).getTime() < 2 * 60 * 1000
    : false;
  return (
    <section className="processing-view">
      <div className="worker-strip">
        <span className={`worker-dot ${workerOnline ? "online" : "offline"}`} aria-hidden="true" />
        <div>
          <strong>{workerOnline ? "Local worker online" : "Local worker offline"}</strong>
          <span>{workerHeartbeat ? `ล่าสุด ${new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(workerHeartbeat.lastSeenAt))}` : "ยังไม่เคยเชื่อมต่อ"}</span>
        </div>
      </div>
      <div className="run-list">
        {runs.length > 0 ? runs.map((run) => (
          <article className="processing-run" key={run.id}>
            <div className="processing-run-head">
              <div>
                <span className="eyebrow">{run.trigger === "scheduled" ? "08:00 schedule" : "manual"}</span>
                <h3>{stageLabels[run.stage]}</h3>
              </div>
              <span className={`badge ${run.status === "succeeded" ? "ready" : run.status === "failed" || run.partial ? "low" : "medium"}`}>
                {run.partial && run.status === "succeeded" ? "partial" : run.status}
              </span>
            </div>
            <div className="run-progress">
              {Object.entries(run.progress).length > 0 ? Object.entries(run.progress).map(([label, value]) => (
                <span key={label}>{label}<strong>{value}</strong></span>
              )) : <span>รอ worker รับงาน</span>}
            </div>
            <div className="processing-run-foot">
              <time dateTime={run.updatedAt}>อัปเดต {new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(run.updatedAt))}</time>
              {(run.status === "failed" || run.partial) ? (
                <button className="secondary-button" disabled={busy} onClick={() => onRetry(run.id)} type="button">
                  <RefreshCw size={14} /> Retry
                </button>
              ) : null}
            </div>
          </article>
        )) : <EmptyState text="ยังไม่มี Processing Run" />}
      </div>
    </section>
  );
}

function DailyBoardView({
  board,
  boards,
  selectedDate,
  onDateChange
}: {
  board?: DailyEditorialBoard;
  boards: DailyEditorialBoard[];
  selectedDate: string;
  onDateChange: (date: string) => void;
}) {
  if (!board) {
    return <EmptyState text="ยังไม่มีสรุปรายวัน กดเรียกข่าวเพื่อสร้างรอบแรก" />;
  }

  const statusText = board.status === "ready"
    ? `สรุปพร้อมอ่าน ${board.generatedCount} เรื่อง`
    : board.status === "partial"
      ? `สรุปแล้ว ${board.generatedCount} จาก ${board.expectedCount} เรื่อง · กำลังรอ retry`
      : `กำลังรอ Codex สรุป ${board.expectedCount} เรื่อง`;

  return (
    <section className="daily-board" aria-label="Daily Editorial Board">
      <div className="daily-board-toolbar">
        <div className={`board-state ${board.status}`} role="status">
          {board.status === "ready" ? <Check size={15} /> : <LoaderCircle className="spin" size={15} />}
          <span>{statusText}</span>
        </div>
        <label className="date-picker">
          <CalendarDays size={15} aria-hidden="true" />
          <select
            aria-label="เลือกวันที่สรุป"
            onChange={(event) => onDateChange(event.target.value)}
            value={selectedDate || board.boardDate}
          >
            {boards.map((item) => (
              <option key={item.id} value={item.boardDate}>
                {new Intl.DateTimeFormat("th-TH", {
                  dateStyle: "long",
                  timeZone: "Asia/Bangkok"
                }).format(new Date(`${item.boardDate}T00:00:00+07:00`))}
              </option>
            ))}
          </select>
        </label>
      </div>

      {board.items.length > 0 ? (
        <div className="daily-board-list">
          {board.items.map((item) => (
            <article className="daily-board-item" key={item.id}>
              <div className="daily-board-number" aria-hidden="true">{item.position}</div>
              <div className="daily-board-content">
                <div className="daily-board-title-row">
                  <h2>{item.title}</h2>
                  <span className={`badge ${item.confidenceLabel}`}>{item.confidenceLabel}</span>
                </div>
                <div className="daily-board-summary">
                  {item.summaryTh.split(/\n\s*\n/).filter(Boolean).map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
                <div className="daily-board-source">
                  <span>{item.sourceName}</span>
                  {item.publishedAt ? (
                    <time dateTime={item.publishedAt}>
                      {new Intl.DateTimeFormat("th-TH", {
                        dateStyle: "medium",
                        timeZone: "Asia/Bangkok"
                      }).format(new Date(item.publishedAt))}
                    </time>
                  ) : null}
                  <a className="source-link" href={item.sourceUrl} target="_blank" rel="noreferrer">
                    <ExternalLink size={14} /> อ่านต้นทาง
                  </a>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState text={board.status === "ready" ? "วันนี้ยังไม่มีเรื่องที่ผ่านเกณฑ์" : "บอร์ดกำลังประมวลผล"} />
      )}
    </section>
  );
}

function LeadCard({
  lead,
  selected,
  busy,
  onSelect,
  onFeedback,
  onExpand
}: {
  lead: ContentLead;
  selected: boolean;
  busy: boolean;
  onSelect: () => void;
  onFeedback: (feedback: LeadFeedbackValue) => void;
  onExpand: () => void;
}) {
  return (
    <article className="lead-card" aria-current={selected ? "true" : undefined}>
      <div className="lead-title-row">
        <div>
          <span className="eyebrow">Content Lead</span>
          <h3>{lead.title}</h3>
        </div>
        <span className={`badge ${lead.confidenceLabel}`}>{lead.confidenceLabel}</span>
      </div>
      <p>{lead.leadBriefTh}</p>
      <a className="source-link" href={lead.sourceUrl} target="_blank" rel="noreferrer">
        <ExternalLink size={14} /> เปิดต้นทาง
      </a>
      <ScoreRow lead={lead} />
      <div className="action-row">
        <button className="secondary-button" onClick={onSelect} type="button">
          <Eye size={15} /> ตรวจรายละเอียด
        </button>
        {(Object.keys(feedbackMeta) as LeadFeedbackValue[]).map((feedback) => {
          const { Icon, label } = feedbackMeta[feedback];
          return (
            <button className="ghost-button" disabled={busy} key={feedback} onClick={() => onFeedback(feedback)} type="button">
              <Icon size={14} /> {label}
            </button>
          );
        })}
        <button className="secondary-button" disabled={busy} onClick={onExpand} type="button">
          <BookOpenText size={15} /> ขยายเนื้อหา
        </button>
      </div>
      {lead.feedback ? <span className="feedback-note">เลือกแล้ว: {feedbackMeta[lead.feedback].label}</span> : null}
    </article>
  );
}

function ScoreRow({ lead }: { lead: ContentLead }) {
  const scores = [
    ["Audience", lead.scores.audienceFit],
    ["Potential", lead.scores.contentPotential],
    ["Novelty", lead.scores.novelty],
    ["Practical", lead.scores.practicalValue],
    ["Confidence", lead.scores.confidence],
    ["Ranking", lead.scores.ranking]
  ] as const;

  return (
    <div className="score-row">
      {scores.map(([label, score]) => (
        <div className="score" key={label}>
          <span>{label}</span>
          <strong>{score}</strong>
        </div>
      ))}
    </div>
  );
}

function LeadDetail({ lead, busy, onExpand }: { lead?: ContentLead; busy: boolean; onExpand: () => void }) {
  if (!lead) return <EmptyState text="เลือกข่าวเพื่อดูรายละเอียด" />;

  return (
    <aside className="detail-panel">
      <div className="badge-row">
        <span className={`badge ${lead.confidenceLabel}`}>confidence {lead.confidenceLabel}</span>
        <span className="badge muted-badge">ranking {lead.scores.ranking}</span>
      </div>
      <h2>{lead.title}</h2>
      <p>{lead.whyItMattersTh}</p>
      <div className="detail-section">
        <h3>ตรวจต่อ</h3>
        <p>{lead.verifyNextTh}</p>
      </div>
      <button className="secondary-button align-start" disabled={busy} onClick={onExpand} type="button">
        <BookOpenText size={15} /> สร้าง Content Expansion
      </button>
      {lead.expansion ? (
        <div className="expansion">
          <h3>Content Expansion</h3>
          <p>{lead.expansion.summaryTh}</p>
          <h3>Angles</h3>
          <ul>{lead.expansion.suggestedAnglesTh.map((angle) => <li key={angle}>{angle}</li>)}</ul>
          <h3>Hooks</h3>
          <ul>{lead.expansion.possibleHooksTh.map((hook) => <li key={hook}>{hook}</li>)}</ul>
        </div>
      ) : null}
    </aside>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="empty-state">
      <Newspaper size={20} aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
}
