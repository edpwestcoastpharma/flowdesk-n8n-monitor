import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  Bell,
  ChevronDown,
  CircleDot,
  Command,
  Gauge,
  GitBranch,
  LayoutDashboard,
  Moon,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  Users,
  Workflow,
  Zap
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import "./styles.css";

const navItems = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Workflows", icon: Workflow },
  { label: "Problems", icon: AlertTriangle },
  { label: "Clients", icon: Users },
  { label: "Reports", icon: ShieldCheck }
];

const fallbackActivity = [
  { name: "Mon", runs: 42, errors: 2 },
  { name: "Tue", runs: 56, errors: 1 },
  { name: "Wed", runs: 48, errors: 5 },
  { name: "Thu", runs: 78, errors: 2 },
  { name: "Fri", runs: 63, errors: 0 },
  { name: "Sat", runs: 34, errors: 1 },
  { name: "Sun", runs: 49, errors: 3 }
];

function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem("flowdesk-theme") || "dark");
  const [activeView, setActiveView] = useState("Overview");
  const [query, setQuery] = useState("");
  const [health, setHealth] = useState(null);
  const [workflows, setWorkflows] = useState([]);
  const [executions, setExecutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("flowdesk-theme", theme);
  }, [theme]);

  async function api(path) {
    const response = await fetch(path);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  async function refresh() {
    try {
      setLoading(true);
      setNotice("");
      const [nextHealth, workflowData, executionData] = await Promise.all([
        api("/api/health"),
        api("/api/workflows?limit=250"),
        api("/api/executions?limit=100")
      ]);
      setHealth({ ...nextHealth, checkedAt: new Date().toISOString() });
      setWorkflows(workflowData.data || []);
      setExecutions(executionData.data || []);
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

  const stats = useMemo(() => buildStats(workflows, executions, health), [workflows, executions, health]);
  const filteredWorkflows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return workflows.filter((workflow) => workflow.name.toLowerCase().includes(term));
  }, [workflows, query]);

  return (
    <div className="min-h-screen overflow-hidden bg-slate-50 text-slate-950 transition-colors duration-500 dark:bg-night dark:text-white">
      <BackgroundEffects />

      <div className="relative z-10 flex min-h-screen">
        <aside className="hidden w-[264px] shrink-0 border-r border-white/10 bg-white/55 px-4 py-5 backdrop-blur-2xl dark:bg-slate-950/35 lg:block">
          <Brand />
          <div className="mt-8 space-y-1">
            {navItems.map((item) => (
              <SidebarButton key={item.label} item={item} active={activeView === item.label} onClick={() => setActiveView(item.label)} />
            ))}
          </div>
          <div className="mt-8 rounded-3xl border border-cyan-400/20 bg-cyan-400/10 p-4 text-sm text-slate-600 shadow-glow dark:text-slate-300">
            <div className="flex items-center gap-2 font-semibold text-slate-950 dark:text-white">
              <Sparkles className="h-4 w-4 text-cyan-400" />
              Signal first
            </div>
            <p className="mt-2 leading-6">Failures, latency, and low health scores rise to the top automatically.</p>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <Topbar
            query={query}
            setQuery={setQuery}
            theme={theme}
            setTheme={setTheme}
            refresh={refresh}
            connected={!notice && Boolean(health)}
          />

          <div className="mx-auto w-full max-w-[1480px] px-4 py-5 sm:px-6 lg:px-8">
            {notice && <Notice message={notice} />}
            <Hero stats={stats} loading={loading} />

            <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
              <Metric title="Total Workflows" value={stats.total} detail="Synced from n8n" icon={Workflow} />
              <Metric title="Running" value={stats.active} detail="Active automations" icon={Zap} tone="cyan" />
              <Metric title="Failed" value={stats.failed} detail="Loaded executions" icon={AlertTriangle} tone="red" />
              <Metric title="Avg Response" value={`${stats.latency}ms`} detail="API latency" icon={Gauge} />
              <Metric title="Uptime" value={`${stats.uptime}%`} detail="Current reachability" icon={ShieldCheck} tone="green" />
              <Metric title="Alerts" value={stats.alerts} detail="Needs attention" icon={Bell} tone="violet" />
            </section>

            <section className="mt-6 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
              <PremiumPanel title="Workflow Activity" subtitle="Executions and errors over time" icon={Activity}>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={fallbackActivity}>
                      <defs>
                        <linearGradient id="runs" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="#00C2FF" stopOpacity={0.65} />
                          <stop offset="100%" stopColor="#00C2FF" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#94A3B8", fontSize: 12 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: "#94A3B8", fontSize: 12 }} />
                      <Tooltip contentStyle={{ borderRadius: 16, border: "1px solid rgba(148,163,184,.24)" }} />
                      <Area type="monotone" dataKey="runs" stroke="#00C2FF" strokeWidth={3} fill="url(#runs)" />
                      <Area type="monotone" dataKey="errors" stroke="#F43F5E" strokeWidth={2} fill="transparent" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </PremiumPanel>

              <PremiumPanel title="Automation Health" subtitle="Overall status distribution" icon={CircleDot}>
                <div className="grid min-h-[280px] grid-cols-1 items-center gap-5 sm:grid-cols-[180px_1fr]">
                  <ResponsiveContainer width="100%" height={190}>
                    <PieChart>
                      <Pie data={stats.healthPie} dataKey="value" innerRadius={58} outerRadius={82} paddingAngle={4}>
                        {stats.healthPie.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-3">
                    {stats.healthPie.map((item) => (
                      <div key={item.name} className="flex items-center justify-between rounded-2xl bg-slate-900/[0.03] px-4 py-3 dark:bg-white/[0.04]">
                        <span className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
                          {item.name}
                        </span>
                        <strong>{item.value}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </PremiumPanel>
            </section>

            <section className="mt-6 grid gap-5 xl:grid-cols-[1fr_380px]">
              <WorkflowTable workflows={filteredWorkflows} executions={executions} loading={loading} />
              <ProblemPanel executions={executions} workflows={workflows} loading={loading} />
            </section>

            <section className="mt-6 grid gap-5 lg:grid-cols-3">
              <FeatureCard icon={Bell} title="Instant Alerts" text="See failed executions before clients notice broken automations." />
              <FeatureCard icon={GitBranch} title="Execution History" text="Review latest runs, failure signals, and response health from one place." />
              <FeatureCard icon={Sparkles} title="AI Insights Ready" text="The UI is prepared for error explanations, summaries, and next-step recommendations." />
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

function BackgroundEffects() {
  return (
    <div className="pointer-events-none fixed inset-0">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,.10)_1px,transparent_1px)] bg-[size:56px_56px] opacity-35" />
      <div className="absolute -left-32 top-10 h-80 w-80 rounded-full bg-cyan-400/20 blur-3xl" />
      <div className="absolute right-0 top-24 h-96 w-96 rounded-full bg-violet-500/20 blur-3xl" />
      <div className="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />
    </div>
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

function SidebarButton({ item, active, onClick }) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      className={`group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-all ${
        active
          ? "bg-cyan-400/12 text-cyan-500 shadow-[inset_0_0_0_1px_rgba(34,211,238,.22)] dark:text-cyan-300"
          : "text-slate-500 hover:bg-slate-900/[0.04] hover:text-slate-950 dark:text-slate-400 dark:hover:bg-white/[0.05] dark:hover:text-white"
      }`}
    >
      <Icon className="h-4 w-4" />
      <span>{item.label}</span>
    </button>
  );
}

function Topbar({ query, setQuery, theme, setTheme, refresh, connected }) {
  return (
    <div className="sticky top-0 z-30 border-b border-white/10 bg-white/65 px-4 py-3 backdrop-blur-2xl dark:bg-night/60 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1480px] items-center gap-3">
        <div className="lg:hidden"><Brand /></div>
        <div className="hidden items-center gap-2 rounded-2xl border border-slate-200 bg-white/75 px-3 py-2 text-sm shadow-sm dark:border-white/10 dark:bg-white/[0.04] md:flex">
          <span className="h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_18px_rgba(34,211,238,.8)]" />
          Westcoast workspace
          <ChevronDown className="h-4 w-4 text-slate-400" />
        </div>
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search workflows, failures, clients..." className="h-11 w-full rounded-2xl border border-slate-200 bg-white/75 pl-10 pr-4 text-sm outline-none transition focus:border-cyan-400 dark:border-white/10 dark:bg-white/[0.04]" />
        </div>
        <StatusBadge connected={connected} />
        <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="grid h-11 w-11 place-items-center rounded-2xl border border-slate-200 bg-white/75 text-slate-700 transition hover:border-cyan-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-white">
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <button onClick={refresh} className="hidden h-11 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-semibold text-white shadow-premium transition hover:-translate-y-0.5 hover:shadow-glow dark:bg-white dark:text-slate-950 sm:flex">
          <RefreshCw className="h-4 w-4" />
          Sync
        </button>
        <div className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-cyan-400 to-violet-600 text-sm font-bold text-white">B</div>
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

function Notice({ message }) {
  return <div className="mb-5 rounded-3xl border border-rose-400/30 bg-rose-500/10 px-5 py-4 text-sm font-medium text-rose-500">{message}</div>;
}

function Hero({ stats, loading }) {
  return (
    <section className="relative overflow-hidden rounded-[32px] border border-white/20 bg-white/70 p-6 shadow-premium backdrop-blur-2xl dark:border-white/10 dark:bg-white/[0.045] lg:p-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(0,194,255,.18),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(124,58,237,.22),transparent_32%)]" />
      <div className="relative grid gap-8 lg:grid-cols-[1fr_520px] lg:items-center">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }}>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1.5 text-sm font-semibold text-cyan-500 dark:text-cyan-300">
            <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
            Live workflow command center
          </div>
          <h1 className="max-w-4xl text-4xl font-semibold leading-[1.02] tracking-tight sm:text-6xl">
            Monitor Every n8n Workflow in <span className="gradient-text">Real Time</span>
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-8 text-slate-600 dark:text-slate-300 sm:text-lg">
            Track executions, failures, uptime, latency, and automation health from one elegant command center.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <button className="rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 shadow-glow transition hover:-translate-y-0.5">Start Monitoring</button>
            <button className="rounded-2xl border border-slate-200 bg-white/70 px-5 py-3 text-sm font-semibold text-slate-800 transition hover:border-cyan-400 dark:border-white/10 dark:bg-white/[0.05] dark:text-white">View Problems</button>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, delay: 0.1 }} className="relative">
          <div className="rounded-[28px] border border-white/25 bg-slate-950/90 p-4 shadow-glow">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex gap-2"><span className="h-3 w-3 rounded-full bg-rose-400" /><span className="h-3 w-3 rounded-full bg-amber-300" /><span className="h-3 w-3 rounded-full bg-emerald-400" /></div>
              <span className="text-xs text-slate-400">flowdesk.live</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <PreviewTile label="Active flows" value={stats.active} />
              <PreviewTile label="Latency" value={`${stats.latency}ms`} />
              <PreviewTile label="Failed runs" value={stats.failed} danger />
              <PreviewTile label="Uptime" value={`${stats.uptime}%`} />
            </div>
            <div className="mt-4 h-28 rounded-3xl bg-gradient-to-br from-cyan-400/20 to-violet-500/20 p-3">
              {loading ? <Skeleton /> : <TinyBars />}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function PreviewTile({ label, value, danger }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-4">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${danger ? "text-rose-300" : "text-white"}`}>{value}</div>
    </div>
  );
}

function TinyBars() {
  return <ResponsiveContainer width="100%" height="100%"><BarChart data={fallbackActivity}><Bar dataKey="runs" radius={[8, 8, 8, 8]} fill="#22D3EE" /></BarChart></ResponsiveContainer>;
}

function Skeleton() {
  return <div className="h-full animate-pulse rounded-2xl bg-white/10" />;
}

function Metric({ title, value, detail, icon: Icon, tone = "blue" }) {
  const toneMap = {
    cyan: "from-cyan-400/18 to-cyan-400/5 text-cyan-500",
    red: "from-rose-400/18 to-rose-400/5 text-rose-500",
    green: "from-emerald-400/18 to-emerald-400/5 text-emerald-500",
    violet: "from-violet-500/18 to-violet-500/5 text-violet-500",
    blue: "from-blue-500/14 to-cyan-400/5 text-cyan-500"
  };
  return (
    <motion.article whileHover={{ y: -4 }} className="rounded-[24px] border border-slate-200/70 bg-white/70 p-4 shadow-premium backdrop-blur-xl transition dark:border-white/10 dark:bg-white/[0.045] xl:col-span-1">
      <div className={`mb-5 grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br ${toneMap[tone]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="text-sm text-slate-500 dark:text-slate-400">{title}</div>
      <div className="mt-2 text-3xl font-semibold tracking-tight">{value}</div>
      <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">{detail}</div>
    </motion.article>
  );
}

function PremiumPanel({ title, subtitle, icon: Icon, children }) {
  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-[28px] border border-slate-200/70 bg-white/72 p-5 shadow-premium backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.045]">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-lg font-semibold"><Icon className="h-5 w-5 text-cyan-400" />{title}</div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>
      </div>
      {children}
    </motion.section>
  );
}

function WorkflowTable({ workflows, executions, loading }) {
  return (
    <PremiumPanel title="Workflow Status" subtitle="Clean rows, health scoring, and last-run signals" icon={Workflow}>
      <div className="space-y-2">
        {loading && [1, 2, 3, 4].map((item) => <div key={item} className="h-16 animate-pulse rounded-3xl bg-slate-900/[0.04] dark:bg-white/[0.05]" />)}
        {!loading && workflows.slice(0, 10).map((workflow) => {
          const runs = executions.filter((execution) => String(execution.workflowId) === String(workflow.id));
          const last = runs[0];
          const failed = runs.some((execution) => executionStatus(execution) === "failed");
          const score = scoreWorkflow(workflow, runs);
          return (
            <div key={workflow.id} className="grid items-center gap-3 rounded-3xl bg-slate-900/[0.025] px-4 py-3 transition hover:bg-cyan-400/[0.08] dark:bg-white/[0.035] md:grid-cols-[1.4fr_110px_110px_120px_80px]">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-cyan-400/20 to-violet-500/20 text-cyan-500"><Workflow className="h-4 w-4" /></div>
                <div className="min-w-0">
                  <div className="truncate font-medium">{workflow.name}</div>
                  <div className="truncate text-xs text-slate-500 dark:text-slate-400">ID {workflow.id}</div>
                </div>
              </div>
              <Pill tone={workflow.active ? "green" : "slate"}>{workflow.active ? "Running" : "Paused"}</Pill>
              <Pill tone={failed ? "red" : "green"}>{failed ? "Problem" : "Healthy"}</Pill>
              <div className="text-sm text-slate-500 dark:text-slate-400">{last ? formatDate(last.startedAt || last.createdAt) : "No loaded run"}</div>
              <div className="text-sm font-semibold text-cyan-500">{score}%</div>
            </div>
          );
        })}
      </div>
    </PremiumPanel>
  );
}

function ProblemPanel({ executions, workflows, loading }) {
  const failed = executions.filter((execution) => executionStatus(execution) === "failed").slice(0, 6);
  return (
    <PremiumPanel title="Problems" subtitle="Latest failures and suggested next checks" icon={AlertTriangle}>
      <div className="space-y-3">
        {loading && <Skeleton />}
        {!loading && failed.length === 0 && <div className="rounded-3xl bg-emerald-500/10 p-5 text-sm text-emerald-500">No failed executions in the loaded data. Your automation desk is calm.</div>}
        {!loading && failed.map((execution) => (
          <div key={execution.id} className="rounded-3xl border border-rose-400/15 bg-rose-500/[0.07] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold">{workflowNameById(workflows, execution.workflowId)}</div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{formatDate(execution.startedAt || execution.createdAt)}</div>
              </div>
              <Pill tone="red">Open</Pill>
            </div>
            <p className="mt-3 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{execution.error?.message || "Execution failed. Open n8n for node-level details."}</p>
          </div>
        ))}
      </div>
    </PremiumPanel>
  );
}

function FeatureCard({ icon: Icon, title, text }) {
  return (
    <motion.div whileHover={{ y: -4 }} className="rounded-[28px] border border-slate-200/70 bg-white/65 p-5 shadow-premium backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.045]">
      <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-cyan-400/10 text-cyan-500"><Icon className="h-5 w-5" /></div>
      <div className="text-lg font-semibold">{title}</div>
      <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{text}</p>
    </motion.div>
  );
}

function Pill({ tone, children }) {
  const tones = {
    green: "bg-emerald-500/10 text-emerald-500",
    red: "bg-rose-500/10 text-rose-500",
    slate: "bg-slate-500/10 text-slate-500"
  };
  return <span className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold ${tones[tone] || tones.slate}`}>{children}</span>;
}

function buildStats(workflows, executions, health) {
  const active = workflows.filter((workflow) => workflow.active).length;
  const failed = executions.filter((execution) => executionStatus(execution) === "failed").length;
  const paused = Math.max(0, workflows.length - active);
  return {
    total: workflows.length,
    active,
    failed,
    latency: health?.latencyMs || 0,
    uptime: health?.ok ? 99.9 : 0,
    alerts: failed + paused,
    healthPie: [
      { name: "Healthy", value: Math.max(0, active - failed), color: "#22D3EE" },
      { name: "Paused", value: paused, color: "#7C3AED" },
      { name: "Failed", value: failed, color: "#F43F5E" }
    ]
  };
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

function workflowNameById(workflows, id) {
  return workflows.find((workflow) => String(workflow.id) === String(id))?.name || `Workflow ${id || "-"}`;
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

createRoot(document.getElementById("root")).render(<App />);
