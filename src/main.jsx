import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock3,
  Command,
  Gauge,
  LayoutDashboard,
  Moon,
  RefreshCw,
  Search,
  ExternalLink,
  ShieldCheck,
  Sun,
  Users,
  Workflow,
  XCircle,
  Zap
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import "./styles.css";

const navItems = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Workflows", icon: Workflow },
  { label: "Executions", icon: Activity },
  { label: "Problems", icon: AlertTriangle },
  { label: "Clients", icon: Users },
  { label: "Reports", icon: ShieldCheck }
];

function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem("flowdesk-theme") || "dark");
  const [activeView, setActiveView] = useState("Overview");
  const [query, setQuery] = useState("");
  const [health, setHealth] = useState(null);
  const [workflows, setWorkflows] = useState([]);
  const [executions, setExecutions] = useState([]);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("flowdesk-theme", theme);
  }, [theme]);

  async function api(path) {
    const response = await fetch(path);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || data.message || "Request failed");
    return data;
  }

  async function refresh() {
    try {
      setLoading(true);
      setNotice("");
      const [nextHealth, workflowData, executionData, configData] = await Promise.all([
        api("/api/health"),
        api("/api/workflows?limit=250"),
        api("/api/executions?limit=100"),
        api("/api/config")
      ]);
      setHealth({ ...nextHealth, checkedAt: new Date().toISOString() });
      setWorkflows(workflowData.data || []);
      setExecutions(executionData.data || []);
      setConfig(configData || null);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 30000);
    return () => clearInterval(timer);
  }, []);

  const filteredWorkflows = useMemo(() => filterByQuery(workflows, query, "name"), [workflows, query]);
  const filteredExecutions = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return executions;
    return executions.filter((execution) => workflowNameById(workflows, execution.workflowId).toLowerCase().includes(term) || String(execution.id).includes(term));
  }, [executions, workflows, query]);
  const stats = useMemo(() => buildStats(workflows, executions, health), [workflows, executions, health]);
  const activity = useMemo(() => buildActivity(executions), [executions]);

  return (
    <div className="app-root bg-slate-50 text-slate-950 transition-colors dark:bg-[#070B14] dark:text-white">
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_15%_10%,rgba(0,194,255,.13),transparent_28%),radial-gradient(circle_at_85%_0%,rgba(124,58,237,.16),transparent_28%)]" />
      <div className="app-shell relative z-10">
        <Sidebar activeView={activeView} setActiveView={setActiveView} stats={stats} />
        <main className="app-main">
          <Topbar
            query={query}
            setQuery={setQuery}
            theme={theme}
            setTheme={setTheme}
            refresh={refresh}
            connected={!notice && Boolean(health)}
            lastSync={health?.checkedAt}
          />
          <div className="app-container">
            {notice && <Notice message={notice} />}
            <PageHeader activeView={activeView} connected={!notice && Boolean(health)} />
            {activeView === "Overview" && <Overview stats={stats} activity={activity} workflows={workflows} executions={executions} loading={loading} baseUrl={config?.baseUrl} />}
            {activeView === "Workflows" && <WorkflowsPage workflows={filteredWorkflows} executions={executions} loading={loading} baseUrl={config?.baseUrl} />}
            {activeView === "Executions" && <ExecutionsPage executions={filteredExecutions} workflows={workflows} loading={loading} baseUrl={config?.baseUrl} />}
            {activeView === "Problems" && <ProblemsPage executions={executions} workflows={workflows} loading={loading} baseUrl={config?.baseUrl} />}
            {activeView === "Clients" && <ClientsPage workflows={workflows} />}
            {activeView === "Reports" && <ReportsPage stats={stats} workflows={workflows} executions={executions} />}
          </div>
        </main>
      </div>
      <MobileNav activeView={activeView} setActiveView={setActiveView} />
    </div>
  );
}

function Sidebar({ activeView, setActiveView, stats }) {
  return (
    <aside className="app-sidebar border-r border-slate-200/70 bg-white/65 backdrop-blur-2xl dark:border-white/10 dark:bg-slate-950/55">
      <Brand />
      <nav className="mt-8 space-y-1">
        {navItems.map((item) => <NavButton key={item.label} item={item} active={activeView === item.label} onClick={() => setActiveView(item.label)} />)}
      </nav>
      <div className="mt-8 rounded-3xl border border-cyan-400/20 bg-cyan-400/10 p-4">
        <div className="text-sm font-semibold text-cyan-500 dark:text-cyan-300">Operations snapshot</div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <SidebarStat label="Active" value={stats.active} />
          <SidebarStat label="Failed" value={stats.failed} />
          <SidebarStat label="Complete" value={stats.completed} />
          <SidebarStat label="Running" value={stats.runningExecutions} />
        </div>
      </div>
    </aside>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-cyan-400 to-violet-600 text-white shadow-glow">
        <Command className="h-5 w-5" />
      </div>
      <div>
        <div className="text-lg font-semibold tracking-tight">FlowDesk</div>
        <div className="text-xs text-slate-500 dark:text-slate-400">n8n monitoring made simple</div>
      </div>
    </div>
  );
}

function NavButton({ item, active, onClick }) {
  const Icon = item.icon;
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition ${active ? "bg-cyan-400/12 text-cyan-500 ring-1 ring-cyan-400/25 dark:text-cyan-300" : "text-slate-500 hover:bg-slate-900/[0.04] hover:text-slate-950 dark:text-slate-400 dark:hover:bg-white/[0.05] dark:hover:text-white"}`}>
      <Icon className="h-4 w-4" />
      {item.label}
    </button>
  );
}

function SidebarStat({ label, value }) {
  return (
    <div className="rounded-2xl bg-white/70 p-3 dark:bg-white/[0.05]">
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}

function Topbar({ query, setQuery, theme, setTheme, refresh, connected, lastSync }) {
  return (
    <div className="app-topbar border-b border-slate-200/70 bg-white/75 backdrop-blur-2xl dark:border-white/10 dark:bg-[#070B14]/75">
      <div className="app-topbar-inner">
      <div className="xl:hidden"><Brand /></div>
        <div className="topbar-search relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search workflows or executions..." className="h-11 w-full rounded-2xl border border-slate-200 bg-white/80 pl-10 pr-4 text-sm outline-none transition focus:border-cyan-400 dark:border-white/10 dark:bg-white/[0.04]" />
        </div>
        <StatusBadge connected={connected} />
        <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="grid h-11 w-11 place-items-center rounded-2xl border border-slate-200 bg-white/80 dark:border-white/10 dark:bg-white/[0.04]">
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <button onClick={refresh} className="flex h-11 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:-translate-y-0.5 dark:bg-white dark:text-slate-950">
          <RefreshCw className="h-4 w-4" />
          Sync
        </button>
        <div className="min-w-fit text-xs text-slate-500 dark:text-slate-400">Last sync {lastSync ? formatTime(lastSync) : "-"}</div>
      </div>
    </div>
  );
}

function StatusBadge({ connected }) {
  return (
    <div className={`hidden items-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold sm:flex ${connected ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"}`}>
      <span className={`h-2 w-2 rounded-full ${connected ? "animate-pulse bg-emerald-400" : "bg-rose-400"}`} />
      {connected ? "Connected" : "Offline"}
    </div>
  );
}

function MobileNav({ activeView, setActiveView }) {
  return (
    <div className="fixed bottom-3 left-3 right-3 z-40 grid grid-cols-6 rounded-3xl border border-white/10 bg-slate-950/90 p-2 backdrop-blur-2xl lg:hidden">
      {navItems.map((item) => {
        const Icon = item.icon;
        return <button key={item.label} onClick={() => setActiveView(item.label)} className={`grid place-items-center rounded-2xl py-2 ${activeView === item.label ? "text-cyan-300" : "text-slate-400"}`}><Icon className="h-5 w-5" /></button>;
      })}
    </div>
  );
}

function PageHeader({ activeView, connected }) {
  const copy = {
    Overview: ["Operations Overview", "Your live n8n health, executions, and problem signals in one place."],
    Workflows: ["Workflow Inventory", "Watch all active, paused, healthy, and risky workflows."],
    Executions: ["Execution History", "Review running, completed, and failed executions from n8n."],
    Problems: ["Problem Center", "Failures that need attention, sorted for fast troubleshooting."],
    Clients: ["Client Operations", "Group workflows by business or client context."],
    Reports: ["Management Report", "A simple operational summary for your team or clients."]
  };
  const [title, subtitle] = copy[activeView];
  return (
    <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
      <div>
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1.5 text-xs font-semibold text-cyan-500 dark:text-cyan-300">
          <span className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-400" : "bg-rose-400"}`} />
          {connected ? "Live data from n8n" : "Connection needs attention"}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">{subtitle}</p>
      </div>
    </div>
  );
}

function Overview({ stats, activity, workflows, executions, loading, baseUrl }) {
  const watchlist = [...workflows]
    .sort((a, b) => scoreWorkflow(a, executions.filter((execution) => String(execution.workflowId) === String(a.id))) - scoreWorkflow(b, executions.filter((execution) => String(execution.workflowId) === String(b.id))))
    .slice(0, 8);
  return (
    <div className="space-y-6">
      <MetricGrid stats={stats} />
      <SystemSummary stats={stats} workflows={workflows} executions={executions} />
      <div className="dashboard-split">
        <Panel title="Execution Activity" subtitle="Loaded executions grouped by day" icon={Activity}>
          <ChartArea data={activity} />
        </Panel>
        <Panel title="What Needs Attention" subtitle="Failures and paused workflows" icon={Bell}>
          <AttentionList workflows={workflows} executions={executions} loading={loading} />
        </Panel>
      </div>
      <div className="dashboard-split dashboard-split-narrow">
        <WorkflowTable workflows={watchlist} executions={executions} loading={loading} compact baseUrl={baseUrl} />
        <ExecutionsList executions={executions.slice(0, 8)} workflows={workflows} loading={loading} baseUrl={baseUrl} />
      </div>
    </div>
  );
}

function SystemSummary({ stats, workflows, executions }) {
  const paused = workflows.filter((workflow) => !workflow.active).length;
  const failed = executions.filter((execution) => executionStatus(execution) === "failed").length;
  const message = failed
    ? `${failed} failed execution${failed === 1 ? "" : "s"} need review.`
    : paused
      ? `${paused} workflow${paused === 1 ? "" : "s"} are paused. Check if intentional.`
      : "No failed executions in loaded data. Keep monitoring active.";
  return (
    <div className="auto-grid">
      <InsightCard title="Current Signal" value={message} tone={failed ? "red" : paused ? "amber" : "green"} />
      <InsightCard title="What To Watch" value="Review low health scores first. Paused workflows are not bad if they are intentionally disabled." tone="cyan" />
      <InsightCard title="How To Use This Page" value="Overview gives summary. Workflows shows all flows. Executions shows completed, running, and failed runs." tone="violet" />
    </div>
  );
}

function InsightCard({ title, value, tone }) {
  const tones = {
    red: "border-rose-400/25 bg-rose-500/10 text-rose-400",
    amber: "border-amber-400/25 bg-amber-500/10 text-amber-400",
    green: "border-emerald-400/25 bg-emerald-500/10 text-emerald-400",
    cyan: "border-cyan-400/25 bg-cyan-400/10 text-cyan-300",
    violet: "border-violet-400/25 bg-violet-500/10 text-violet-300"
  };
  return (
    <div className={`rounded-3xl border p-4 ${tones[tone]}`}>
      <div className="text-sm font-semibold">{title}</div>
      <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{value}</p>
    </div>
  );
}

function WorkflowsPage({ workflows, executions, loading, baseUrl }) {
  const active = workflows.filter((workflow) => workflow.active);
  const paused = workflows.filter((workflow) => !workflow.active);
  return (
    <div className="space-y-6">
      <div className="auto-grid">
        <SummaryCard title="Active Workflows" value={active.length} icon={Zap} tone="green" />
        <SummaryCard title="Paused Workflows" value={paused.length} icon={Clock3} tone="slate" />
        <SummaryCard title="Total Workflows" value={workflows.length} icon={Workflow} tone="cyan" />
      </div>
      <WorkflowTable workflows={workflows} executions={executions} loading={loading} baseUrl={baseUrl} />
    </div>
  );
}

function ExecutionsPage({ executions, workflows, loading, baseUrl }) {
  const running = executions.filter((execution) => ["running", "waiting"].includes(executionStatus(execution)));
  const completed = executions.filter((execution) => executionStatus(execution) === "success");
  const failed = executions.filter((execution) => executionStatus(execution) === "failed");
  return (
    <div className="space-y-6">
      <div className="auto-grid">
        <SummaryCard title="Running Now" value={running.length} icon={Activity} tone="cyan" />
        <SummaryCard title="Completed" value={completed.length} icon={CheckCircle2} tone="green" />
        <SummaryCard title="Failed" value={failed.length} icon={XCircle} tone="red" />
        <SummaryCard title="Loaded Executions" value={executions.length} icon={Clock3} tone="violet" />
      </div>
      <ExecutionsTable executions={executions} workflows={workflows} loading={loading} baseUrl={baseUrl} />
    </div>
  );
}

function ProblemsPage({ executions, workflows, loading, baseUrl }) {
  const failed = executions.filter((execution) => executionStatus(execution) === "failed");
  return (
    <div className="dashboard-split dashboard-split-narrow">
      <ExecutionsTable executions={failed} workflows={workflows} loading={loading} problemOnly baseUrl={baseUrl} />
      <Panel title="Fix Checklist" subtitle="Use this order when automation fails" icon={ShieldCheck}>
        <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
          {["Open the failed execution in n8n", "Check failed node input and output", "Confirm API key or OAuth token", "Add retry/error branch if repeated", "Record note for client maintenance"].map((item, index) => (
            <div key={item} className="flex gap-3 rounded-2xl bg-slate-900/[0.03] p-3 dark:bg-white/[0.04]"><span className="text-cyan-500">{index + 1}</span>{item}</div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function ClientsPage({ workflows }) {
  const groups = groupClients(workflows);
  return (
    <div className="auto-grid">
      {groups.map((group) => (
        <Panel key={group.name} title={group.name} subtitle={`${group.workflows.length} workflows`} icon={Users}>
          <div className="space-y-2">
            {group.workflows.slice(0, 8).map((workflow) => (
              <div key={workflow.id} className="flex items-center justify-between rounded-2xl bg-slate-900/[0.03] p-3 dark:bg-white/[0.04]">
                <span className="truncate text-sm">{workflow.name}</span>
                <Pill tone={workflow.active ? "green" : "slate"}>{workflow.active ? "Active" : "Paused"}</Pill>
              </div>
            ))}
          </div>
        </Panel>
      ))}
    </div>
  );
}

function ReportsPage({ stats, workflows, executions }) {
  return (
    <div className="dashboard-split">
      <Panel title="Executive Summary" subtitle="Current loaded data from n8n" icon={ShieldCheck}>
        <div className="space-y-3">
          <ReportLine label="Total workflows" value={stats.total} />
          <ReportLine label="Active workflows" value={stats.active} />
          <ReportLine label="Completed executions" value={stats.completed} />
          <ReportLine label="Failed executions" value={stats.failed} />
          <ReportLine label="API latency" value={`${stats.latency}ms`} />
          <ReportLine label="Estimated uptime" value={`${stats.uptime}%`} />
        </div>
      </Panel>
      <Panel title="Recommendations" subtitle="Professional maintenance actions" icon={Gauge}>
        <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
          <p>Review all failed executions before sending client reports.</p>
          <p>Assign client names to workflows using naming convention: Client - Process - Channel.</p>
          <p>Add retry and error handling to workflows with repeated failures.</p>
          <p>Use the Executions page daily to confirm completed and running automations.</p>
        </div>
      </Panel>
    </div>
  );
}

function MetricGrid({ stats }) {
  return (
    <div className="metric-grid">
      <SummaryCard title="Total Workflows" value={stats.total} icon={Workflow} tone="cyan" />
      <SummaryCard title="Active" value={stats.active} icon={Zap} tone="green" />
      <SummaryCard title="Running Exec." value={stats.runningExecutions} icon={Activity} tone="cyan" />
      <SummaryCard title="Completed" value={stats.completed} icon={CheckCircle2} tone="green" />
      <SummaryCard title="Failed" value={stats.failed} icon={XCircle} tone="red" />
      <SummaryCard title="Latency" value={`${stats.latency}ms`} icon={Gauge} tone="violet" />
    </div>
  );
}

function SummaryCard({ title, value, icon: Icon, tone = "cyan" }) {
  const tones = {
    cyan: "text-cyan-500 bg-cyan-400/10",
    green: "text-emerald-500 bg-emerald-400/10",
    red: "text-rose-500 bg-rose-400/10",
    violet: "text-violet-500 bg-violet-400/10",
    slate: "text-slate-500 bg-slate-400/10"
  };
  return (
    <motion.div whileHover={{ y: -3 }} className="fluid-card border border-slate-200/70 bg-white/75 shadow-premium backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.045]">
      <div className={`grid h-11 w-11 place-items-center rounded-2xl ${tones[tone]}`}><Icon className="h-5 w-5" /></div>
      <div className="mt-5 text-sm text-slate-500 dark:text-slate-400">{title}</div>
      <div className="metric-value mt-1 font-semibold tracking-tight">{value}</div>
    </motion.div>
  );
}

function Panel({ title, subtitle, icon: Icon, children }) {
  return (
    <section className="fluid-panel border border-slate-200/70 bg-white/75 shadow-premium backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.045]">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-lg font-semibold"><Icon className="h-5 w-5 text-cyan-400" />{title}</div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function ChartArea({ data }) {
  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="runs" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#22D3EE" stopOpacity={0.55} />
              <stop offset="100%" stopColor="#22D3EE" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,.16)" />
          <XAxis dataKey="name" tick={{ fill: "#94A3B8", fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "#94A3B8", fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={{ borderRadius: 16, border: "1px solid rgba(148,163,184,.24)" }} />
          <Area type="monotone" dataKey="success" stroke="#22D3EE" strokeWidth={3} fill="url(#runs)" />
          <Area type="monotone" dataKey="failed" stroke="#F43F5E" strokeWidth={2} fill="transparent" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function WorkflowTable({ workflows, executions, loading, compact = false, baseUrl }) {
  return (
    <Panel title={compact ? "Workflow Watchlist" : "All Workflows"} subtitle={compact ? "Lowest health and paused workflows appear first" : "Every workflow with status, latest run, and health score"} icon={Workflow}>
      <div className="responsive-table space-y-2">
        {loading && <SkeletonRows />}
        {!loading && workflows.length === 0 && <EmptyState text="No workflows found." />}
        {!loading && workflows.length > 0 && (
          <div className="workflow-header text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <span>Workflow</span>
            <span>Status</span>
            <span>Signal</span>
            <span>Latest Run</span>
            <span>Health</span>
            <span>Open</span>
          </div>
        )}
        {!loading && workflows.map((workflow) => {
          const runs = executions.filter((execution) => String(execution.workflowId) === String(workflow.id));
          const last = runs[0];
          const failedCount = runs.filter((execution) => executionStatus(execution) === "failed").length;
          const score = scoreWorkflow(workflow, runs);
          const signal = getWorkflowSignal(workflow, score, failedCount);
          return (
            <div key={workflow.id} className="workflow-row bg-slate-900/[0.025] transition hover:bg-cyan-400/[0.08] dark:bg-white/[0.035]">
              <div className="min-w-0">
                <div className="break-words font-medium leading-6">{workflow.name}</div>
                <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span>ID {workflow.id}</span>
                  <span>{runs.length} loaded run{runs.length === 1 ? "" : "s"}</span>
                  {failedCount > 0 && <span>{failedCount} failed</span>}
                </div>
              </div>
              <Field label="Status"><Pill tone={workflow.active ? "green" : "slate"}>{workflow.active ? "Active" : "Paused"}</Pill></Field>
              <Field label="Signal"><Pill tone={signal.tone}>{signal.label}</Pill></Field>
              <Field label="Latest Run"><div className="text-sm text-slate-500 dark:text-slate-400">{last ? formatDate(last.startedAt || last.createdAt) : "No execution loaded"}</div></Field>
              <Field label="Health"><HealthScore score={score} /></Field>
              <Field label="Open"><OpenButton href={workflowLink(baseUrl, workflow.id)} label="Open" /></Field>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function Field({ label, children }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-500 lg:hidden">{label}</div>
      {children}
    </div>
  );
}

function HealthScore({ score }) {
  const tone = score >= 85 ? "bg-emerald-400" : score >= 70 ? "bg-amber-400" : "bg-rose-400";
  return (
    <div className="min-w-[76px]">
      <div className="text-sm font-semibold">{score}%</div>
      <div className="mt-2 h-1.5 rounded-full bg-slate-200 dark:bg-white/10">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

function ExecutionsList({ executions, workflows, loading, baseUrl }) {
  return (
    <Panel title="Recent Executions" subtitle="Latest loaded n8n runs" icon={Activity}>
      <div className="responsive-table space-y-2">
        {loading && <SkeletonRows small />}
        {!loading && executions.map((execution) => <ExecutionRow key={execution.id} execution={execution} workflows={workflows} compact baseUrl={baseUrl} />)}
      </div>
    </Panel>
  );
}

function ExecutionsTable({ executions, workflows, loading, problemOnly = false, baseUrl }) {
  return (
    <Panel title={problemOnly ? "Failed Executions" : "All Executions"} subtitle="Running, completed, and failed runs" icon={Activity}>
      <div className="responsive-table space-y-2">
        {loading && <SkeletonRows />}
        {!loading && executions.length === 0 && <EmptyState text={problemOnly ? "No failed executions in loaded data." : "No executions found."} />}
        {!loading && executions.map((execution) => <ExecutionRow key={execution.id} execution={execution} workflows={workflows} baseUrl={baseUrl} />)}
      </div>
    </Panel>
  );
}

function ExecutionRow({ execution, workflows, compact = false, baseUrl }) {
  const status = executionStatus(execution);
  return (
    <div className={`${compact ? "execution-row compact" : "execution-row"} bg-slate-900/[0.025] dark:bg-white/[0.035]`}>
      <div className="min-w-0">
        <div className="break-words font-medium leading-6">{workflowNameById(workflows, execution.workflowId)}</div>
        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Execution #{execution.id}</div>
      </div>
      <Field label="Result"><Pill tone={status === "failed" ? "red" : status === "success" ? "green" : "cyan"}>{status}</Pill></Field>
      {!compact && <Field label="Started"><div className="text-sm text-slate-500 dark:text-slate-400">{formatDate(execution.startedAt || execution.createdAt)}</div></Field>}
      {!compact && <Field label="Duration"><div className="text-sm text-slate-500 dark:text-slate-400">{duration(execution)}</div></Field>}
      {!compact && <Field label="Open"><OpenButton href={executionLink(baseUrl, execution.id)} label="Open" /></Field>}
      {compact && execution.error?.message && <div className="text-sm text-rose-400">{execution.error.message}</div>}
      {compact && <OpenButton href={executionLink(baseUrl, execution.id)} label="Open execution" />}
    </div>
  );
}

function OpenButton({ href, label }) {
  if (!href) return <span className="text-xs text-slate-500 dark:text-slate-500">No URL</span>;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-1 rounded-xl bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-cyan-500 transition hover:bg-cyan-400/20">
      {label}
      <ExternalLink className="h-3.5 w-3.5" />
    </a>
  );
}

function AttentionList({ workflows, executions, loading }) {
  const failed = executions.filter((execution) => executionStatus(execution) === "failed").slice(0, 5);
  const paused = workflows.filter((workflow) => !workflow.active).slice(0, 5);
  if (loading) return <SkeletonRows />;
  if (!failed.length && !paused.length) return <EmptyState text="No urgent issues in loaded data." />;
  return (
    <div className="space-y-2">
      {failed.map((execution) => <ExecutionRow key={execution.id} execution={execution} workflows={workflows} compact />)}
      {paused.map((workflow) => (
        <div key={workflow.id} className="flex items-center justify-between rounded-3xl bg-slate-900/[0.025] px-4 py-3 dark:bg-white/[0.035]">
          <div className="truncate font-medium">{workflow.name}</div>
          <Pill tone="slate">Paused</Pill>
        </div>
      ))}
    </div>
  );
}

function ReportLine({ label, value }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-200/70 py-3 text-sm dark:border-white/10">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EmptyState({ text }) {
  return <div className="rounded-3xl bg-slate-900/[0.025] p-6 text-sm text-slate-500 dark:bg-white/[0.035] dark:text-slate-400">{text}</div>;
}

function SkeletonRows({ small = false }) {
  return <div className="space-y-2">{[1, 2, 3, 4].map((item) => <div key={item} className={`${small ? "h-14" : "h-16"} animate-pulse rounded-3xl bg-slate-900/[0.04] dark:bg-white/[0.05]`} />)}</div>;
}

function Notice({ message }) {
  return <div className="mb-5 rounded-3xl border border-rose-400/30 bg-rose-500/10 px-5 py-4 text-sm font-medium text-rose-500">{message}</div>;
}

function Pill({ tone, children }) {
  const tones = {
    green: "bg-emerald-500/10 text-emerald-500",
    red: "bg-rose-500/10 text-rose-500",
    cyan: "bg-cyan-400/10 text-cyan-500",
    amber: "bg-amber-400/10 text-amber-500",
    slate: "bg-slate-500/10 text-slate-500"
  };
  return <span className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold ${tones[tone] || tones.slate}`}>{children}</span>;
}

function buildStats(workflows, executions, health) {
  const active = workflows.filter((workflow) => workflow.active).length;
  const failed = executions.filter((execution) => executionStatus(execution) === "failed").length;
  const completed = executions.filter((execution) => executionStatus(execution) === "success").length;
  const runningExecutions = executions.filter((execution) => ["running", "waiting"].includes(executionStatus(execution))).length;
  return {
    total: workflows.length,
    active,
    paused: Math.max(0, workflows.length - active),
    failed,
    completed,
    runningExecutions,
    latency: health?.latencyMs || 0,
    uptime: health?.ok ? 99.9 : 0
  };
}

function buildActivity(executions) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const map = new Map(days.map((day) => [day, { name: day, success: 0, failed: 0 }]));
  for (const execution of executions) {
    const date = new Date(execution.startedAt || execution.createdAt || Date.now());
    const bucket = map.get(days[date.getDay()]);
    if (executionStatus(execution) === "failed") bucket.failed += 1;
    else bucket.success += 1;
  }
  return Array.from(map.values());
}

function groupClients(workflows) {
  const groups = new Map();
  for (const workflow of workflows) {
    const name = workflow.name.includes("-") ? workflow.name.split("-")[0].trim() : "Unassigned";
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(workflow);
  }
  return Array.from(groups.entries()).map(([name, items]) => ({ name, workflows: items }));
}

function executionStatus(execution) {
  if (execution.status) return execution.status;
  if (execution.error) return "failed";
  if (execution.finished === false) return "running";
  if (execution.stoppedAt) return "success";
  return "unknown";
}

function scoreWorkflow(workflow, runs) {
  const failed = runs.filter((run) => executionStatus(run) === "failed").length;
  let score = 100;
  if (!workflow.active) score -= 25;
  score -= Math.min(45, failed * 15);
  if (!runs.length) score -= 5;
  return Math.max(0, Math.min(100, score));
}

function getWorkflowSignal(workflow, score, failedCount) {
  if (failedCount > 0) return { label: "Failed", tone: "red" };
  if (!workflow.active) return { label: "Paused", tone: "slate" };
  if (score < 75) return { label: "Watch", tone: "amber" };
  return { label: "Healthy", tone: "green" };
}

function workflowNameById(workflows, id) {
  return workflows.find((workflow) => String(workflow.id) === String(id))?.name || `Workflow ${id || "-"}`;
}

function workflowLink(baseUrl, id) {
  if (!baseUrl || !id) return "";
  return `${baseUrl.replace(/\/+$/, "")}/workflow/${id}`;
}

function executionLink(baseUrl, id) {
  if (!baseUrl || !id) return "";
  return `${baseUrl.replace(/\/+$/, "")}/execution/${id}`;
}

function filterByQuery(items, query, key) {
  const term = query.trim().toLowerCase();
  if (!term) return items;
  return items.filter((item) => String(item[key] || "").toLowerCase().includes(term));
}

function duration(execution) {
  if (!execution.startedAt || !execution.stoppedAt) return "-";
  const ms = new Date(execution.stoppedAt) - new Date(execution.startedAt);
  if (!Number.isFinite(ms) || ms < 0) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${Math.round(ms / 1000)}s`;
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function formatTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString();
}

createRoot(document.getElementById("root")).render(<App />);
