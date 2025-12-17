import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart3, GitCompare, Info, Moon, Play, Plus, RefreshCw, Shuffle, Sun, Trash2 } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend
} from 'recharts';

type Proc = { id: number; at: number; bt: number };
type RRResult = {
  resultData: Array<Proc & { ct: number; tat: number; wt: number; rt: number }>;
  gantt: Array<{ pid: string; start: number; end: number }>;
  cs: number;
  avgTat: number;
  avgWt: number;
  cpuUtil: string;
  throughput: string;
  totalTime: number;
};

const DEFAULT_PROCESSES: Proc[] = [
  { id: 1, at: 0, bt: 5 },
  { id: 2, at: 1, bt: 3 },
  { id: 3, at: 2, bt: 8 },
  { id: 4, at: 3, bt: 6 }
];

const colorPalette = ['#FF6F61', '#6B5B95', '#88B04B', '#F7CAC9', '#92A8D1', '#955251', '#F4A460', '#20B2AA'];
const pidColor = (pid: string) => {
  const hash = pid.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return colorPalette[hash % colorPalette.length];
};

function roundRobin(procs: Proc[], q: number): RRResult {
  const sorted = [...procs].sort((a, b) => a.at - b.at);
  const n = sorted.length;
  const remaining = sorted.map(p => p.bt);
  const completion = Array(n).fill(0);
  const firstResponse = Array(n).fill(-1);
  let time = sorted[0]?.at ?? 0;
  const queue: number[] = [];
  const visited = Array(n).fill(false);
  const gantt: Array<{ pid: string; start: number; end: number }> = [];

  for (let i = 0; i < n; i++) {
    if (sorted[i].at <= time && !visited[i]) {
      queue.push(i);
      visited[i] = true;
    }
  }

  while (queue.length > 0) {
    const i = queue.shift()!;
    if (firstResponse[i] === -1) firstResponse[i] = time - sorted[i].at;
    const runTime = Math.min(remaining[i], q);
    const start = time;
    const end = time + runTime;
    gantt.push({ pid: `P${sorted[i].id}`, start, end });
    time = end;
    remaining[i] -= runTime;

    for (let j = 0; j < n; j++) {
      if (sorted[j].at <= time && !visited[j] && remaining[j] > 0) {
        queue.push(j);
        visited[j] = true;
      }
    }

    if (remaining[i] > 0) queue.push(i); else completion[i] = time;

    if (queue.length === 0) {
      for (let k = 0; k < n; k++) {
        if (remaining[k] > 0 && !visited[k]) {
          time = Math.max(time, sorted[k].at);
          queue.push(k);
          visited[k] = true;
          break;
        }
      }
    }
  }

  const tat = completion.map((c, i) => c - sorted[i].at);
  const wt = tat.map((t, i) => t - sorted[i].bt);
  const rt = firstResponse;

  const resultData = sorted
    .map((p, i) => ({ ...p, ct: completion[i], tat: tat[i], wt: wt[i], rt: rt[i] }))
    .sort((a, b) => a.id - b.id);

  const cs = gantt.reduce((acc, _, idx) => (idx > 0 && gantt[idx].pid !== gantt[idx - 1].pid ? acc + 1 : acc), 0);
  const avgTat = tat.reduce((a, b) => a + b, 0) / n;
  const avgWt = wt.reduce((a, b) => a + b, 0) / n;
  const totalBurst = sorted.reduce((a, p) => a + p.bt, 0);
  const totalTime = gantt[gantt.length - 1]?.end || 0;
  const cpuUtil = totalTime ? ((totalBurst / totalTime) * 100).toFixed(2) : '0.00';
  const throughput = totalTime ? (n / totalTime).toFixed(3) : '0.000';

  return { resultData, gantt, cs, avgTat, avgWt, cpuUtil, throughput, totalTime };
}

function fcfsScheduler(procs: Proc[]) {
  const sorted = [...procs].sort((a, b) => a.at - b.at);
  const n = sorted.length;
  const gantt: Array<{ pid: string; start: number; end: number }> = [];
  let time = 0;
  sorted.forEach(p => {
    if (time < p.at) time = p.at;
    gantt.push({ pid: `P${p.id}`, start: time, end: time + p.bt });
    time += p.bt;
  });
  const resultData = sorted
    .map((p, i) => {
      const ct = gantt[i].end;
      const tat = ct - p.at;
      const wt = tat - p.bt;
      return { ...p, ct, tat, wt, rt: wt };
    })
    .sort((a, b) => a.id - b.id);
  const cs = gantt.reduce((acc, _, idx) => (idx > 0 && gantt[idx].pid !== gantt[idx - 1].pid ? acc + 1 : acc), 0);
  const avgTat = resultData.reduce((a, p) => a + p.tat, 0) / n;
  const avgWt = resultData.reduce((a, p) => a + p.wt, 0) / n;
  const totalBurst = procs.reduce((a, p) => a + p.bt, 0);
  const totalTime = gantt[gantt.length - 1]?.end || 0;
  const cpuUtil = totalTime ? ((totalBurst / totalTime) * 100).toFixed(2) : '0.00';
  const throughput = totalTime ? (n / totalTime).toFixed(3) : '0.000';
  return { resultData, gantt, cs, avgTat, avgWt, cpuUtil, throughput, totalTime };
}

const useLocalState = <T,>(key: string, initial: T) => {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }, [key, value]);
  return [value, setValue] as const;
};

const StatCard: React.FC<{ label: string; value: React.ReactNode; color: string }> = ({ label, value, color }) => (
  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`p-4 rounded-lg shadow border ${color}`}>
    <div className="text-sm text-gray-600 dark:text-gray-300">{label}</div>
    <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">{value}</div>
  </motion.div>
);

const Tabs: React.FC<{ value: string; onChange: (v: string) => void; tabs: Array<{ key: string; label: string; icon: React.ReactNode }> }> = ({ value, onChange, tabs }) => (
  <div className="flex gap-3 flex-wrap">
    {tabs.map(t => (
      <button
        key={t.key}
        onClick={() => onChange(t.key)}
        className={`${value === t.key ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100'} px-4 py-2 rounded-lg font-semibold transition-colors flex items-center gap-2`}
      >
        {t.icon}
        {t.label}
      </button>
    ))}
  </div>
);

const Presets: React.FC<{ onApply: (procs: Proc[]) => void }> = ({ onApply }) => {
  const make = (arr: Array<[number, number]>) => arr.map((a, i) => ({ id: i + 1, at: a[0], bt: a[1] }));
  const presets = [
    { name: 'Small Mix', data: make([[0, 3], [1, 5], [2, 2], [3, 4]]) },
    { name: 'CPU-bound', data: make([[0, 9], [1, 7], [2, 8], [4, 10]]) },
    { name: 'IO-bound', data: make([[0, 2], [1, 1], [2, 3], [3, 2], [5, 1]]) },
    { name: 'Random 5', data: make(Array.from({ length: 5 }, (_, i) => [Math.floor(Math.random() * 6), Math.floor(Math.random() * 9) + 1])) }
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {presets.map(p => (
        <button key={p.name} onClick={() => onApply(p.data)} className="px-3 py-2 bg-white dark:bg-gray-800 border rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700">
          {p.name}
        </button>
      ))}
    </div>
  );
};

const GanttChart: React.FC<{
  gantt: RRResult['gantt'];
  currentTime?: number;
  animated?: boolean;
  onTimeChange?: (t: number) => void;
}> = ({ gantt, currentTime = 0, animated = false, onTimeChange }) => {
  const maxTime = gantt[gantt.length - 1]?.end || 0;
  const displayTime = animated ? Math.min(currentTime, maxTime) : maxTime;
  const containerRef = useRef<HTMLDivElement | null>(null);

  return (
    <div className="bg-white dark:bg-gray-900 p-4 rounded-lg shadow border">
      <div className="relative" style={{ height: '96px' }} ref={containerRef}>
        <div className="absolute inset-0 flex items-center">
          {gantt.map((g, idx) => {
            const width = maxTime ? ((g.end - g.start) / maxTime) * 100 : 0;
            const left = maxTime ? (g.start / maxTime) * 100 : 0;
            const visibleWidth = animated ? Math.max(0, Math.min(width, ((displayTime - g.start) / maxTime) * 100)) : width;
            const isVisible = animated ? g.start < displayTime : true;
            return isVisible ? (
              <motion.div
                key={`${g.pid}-${idx}`}
                className="absolute h-14 flex items-center justify-center text-white font-bold text-sm border-2 border-gray-800 dark:border-gray-700 rounded"
                initial={{ width: 0 }}
                animate={{ width: `${visibleWidth}%` }}
                transition={{ duration: 0.25 }}
                style={{ left: `${left}%`, backgroundColor: pidColor(g.pid) }}
                title={`${g.pid}: ${g.start} → ${g.end}`}
              >
                {visibleWidth > 3 && g.pid}
              </motion.div>
            ) : null;
          })}
        </div>
      </div>
      <div className="relative mt-3 h-6 flex">
        {Array.from({ length: maxTime + 1 }, (_, i) => (
          <div key={i} className="flex-1 text-center text-xs text-gray-600 dark:text-gray-300 border-l border-gray-300 dark:border-gray-700">
            {i}
          </div>
        ))}
      </div>
      {animated && maxTime > 0 && (
        <div className="mt-4 flex items-center gap-3">
          <input type="range" min={0} max={maxTime} step={0.5} value={displayTime} onChange={e => onTimeChange?.(parseFloat(e.target.value))} className="w-full" />
          <div className="text-xs text-gray-700 dark:text-gray-200 w-16 text-right">t={displayTime.toFixed(1)}</div>
        </div>
      )}
    </div>
  );
};

const RoundRobinScheduler: React.FC = () => {
  const [dark, setDark] = useLocalState<boolean>('rr-dark', false);
  const [processes, setProcesses] = useLocalState<Proc[]>('rr-procs', DEFAULT_PROCESSES);
  const [quantum, setQuantum] = useLocalState<number>('rr-q', 4);
  const [activeView, setActiveView] = useLocalState<string>('rr-tab', 'scheduler');
  const [results, setResults] = useState<RRResult | null>(null);
  const [animating, setAnimating] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [compareQ1, setCompareQ1] = useLocalState<number>('rr-cq1', 2);
  const [compareQ2, setCompareQ2] = useLocalState<number>('rr-cq2', 6);
  const [errors, setErrors] = useState<Record<number, { at?: string; bt?: string }>>({});

  const rr = useMemo(() => roundRobin(processes, quantum), [processes, quantum]);

  useEffect(() => {
    if (animating && results) {
      const id = setInterval(() => {
        setCurrentTime(prev => {
          if (prev >= results.totalTime) {
            setAnimating(false);
            return results.totalTime;
          }
          return +(prev + 0.5).toFixed(1);
        });
      }, 120);
      return () => clearInterval(id);
    }
  }, [animating, results]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  const run = () => {
    const res = roundRobin(processes, Math.max(1, quantum));
    setResults(res);
    setCurrentTime(0);
  };

  const randomize = () => {
    setProcesses(ps => ps.map(p => ({ ...p, at: Math.floor(Math.random() * 6), bt: Math.floor(Math.random() * 9) + 1 })));
  };

  const add = () => setProcesses(ps => [...ps, { id: ps.length + 1, at: 0, bt: 1 }]);
  const remove = (id: number) => setProcesses(ps => (ps.length > 1 ? ps.filter(p => p.id !== id).map((p, idx) => ({ ...p, id: idx + 1 })) : ps));

  const update = (id: number, field: 'at' | 'bt', raw: string) => {
    const value = parseInt(raw, 10);
    setProcesses(ps => ps.map(p => (p.id === id ? { ...p, [field]: isNaN(value) ? 0 : Math.max(field === 'bt' ? 1 : 0, value) } as Proc : p)));
    setErrors(prev => ({ ...prev, [id]: { ...prev[id], [field]: isNaN(value) ? 'Invalid number' : undefined } }));
  };

  const ComparisonView = () => {
    const r1 = roundRobin(processes, Math.max(1, compareQ1));
    const r2 = roundRobin(processes, Math.max(1, compareQ2));
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-lg border">
            <h3 className="text-lg font-bold mb-3">Quantum = {compareQ1}</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-sm">
              <StatCard label="Avg TAT" value={r1.avgTat.toFixed(2)} color="border-blue-200" />
              <StatCard label="Avg WT" value={r1.avgWt.toFixed(2)} color="border-green-200" />
              <StatCard label="Context Switches" value={r1.cs} color="border-orange-200" />
              <StatCard label="CPU Util" value={`${r1.cpuUtil}%`} color="border-purple-200" />
            </div>
            <GanttChart gantt={r1.gantt} />
          </div>
          <div className="bg-green-50 dark:bg-emerald-900/30 p-4 rounded-lg border">
            <h3 className="text-lg font-bold mb-3">Quantum = {compareQ2}</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-sm">
              <StatCard label="Avg TAT" value={r2.avgTat.toFixed(2)} color="border-blue-200" />
              <StatCard label="Avg WT" value={r2.avgWt.toFixed(2)} color="border-green-200" />
              <StatCard label="Context Switches" value={r2.cs} color="border-orange-200" />
              <StatCard label="CPU Util" value={`${r2.cpuUtil}%`} color="border-purple-200" />
            </div>
            <GanttChart gantt={r2.gantt} />
          </div>
        </div>
      </div>
    );
  };

  const RRvsFCFSView = () => {
    const rrRes = rr;
    const fcfs = fcfsScheduler(processes);
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-lg border">
            <h3 className="text-lg font-bold mb-3">Round Robin (Q={quantum})</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-sm">
              <StatCard label="Avg TAT" value={rrRes.avgTat.toFixed(2)} color="border-blue-200" />
              <StatCard label="Avg WT" value={rrRes.avgWt.toFixed(2)} color="border-green-200" />
              <StatCard label="Context Switches" value={rrRes.cs} color="border-orange-200" />
              <StatCard label="CPU Util" value={`${rrRes.cpuUtil}%`} color="border-purple-200" />
            </div>
            <GanttChart gantt={rrRes.gantt} />
          </div>
          <div className="bg-amber-50 dark:bg-amber-900/30 p-4 rounded-lg border">
            <h3 className="text-lg font-bold mb-3">First-Come First-Served (FCFS)</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-sm">
              <StatCard label="Avg TAT" value={fcfs.avgTat.toFixed(2)} color="border-blue-200" />
              <StatCard label="Avg WT" value={fcfs.avgWt.toFixed(2)} color="border-green-200" />
              <StatCard label="Context Switches" value={fcfs.cs} color="border-orange-200" />
              <StatCard label="CPU Util" value={`${fcfs.cpuUtil}%`} color="border-purple-200" />
            </div>
            <GanttChart gantt={fcfs.gantt} />
          </div>
        </div>
      </div>
    );
  };

  const AnalyzeView = () => {
    const [qRange, setQRange] = useState<[number, number] | null>(null);
    const [sortKey, setSortKey] = useState<'q' | 'awt' | 'atat' | 'cs'>('q');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
    const [showWT, setShowWT] = useState(true);
    const [showTAT, setShowTAT] = useState(true);
    const [showCS, setShowCS] = useState(true);
    const [targetQ, setTargetQ] = useState<number | ''>('');
    const [selectedQ, setSelectedQ] = useState<number | null>(null);
    const maxBt = Math.max(...processes.map(p => p.bt));
    const maxQ = Math.max(2, maxBt + 3);
    const qValues = Array.from({ length: maxQ - 1 }, (_, i) => i + 1);
    const points = qValues.map(q => {
      const r = roundRobin(processes, q);
      return { q, awt: r.avgWt, atat: r.avgTat, cs: r.cs };
    });
    const minAwtPoint = points.reduce((m, p) => (p.awt < m.awt ? p : m), points[0]);
    const burst = [...processes.map(p => p.bt)].sort((a, b) => a - b);
    const median = burst.length % 2 === 0 ? (burst[burst.length / 2 - 1] + burst[burst.length / 2]) / 2 : burst[Math.floor(burst.length / 2)];
    const adaptiveQ = Math.max(1, Math.floor(median * 0.8));

    const filtered = (qRange ? points.filter(p => p.q >= qRange[0] && p.q <= qRange[1]) : points).slice();
    filtered.sort((a, b) => {
      const vA = a[sortKey];
      const vB = b[sortKey];
      const cmp = vA === vB ? 0 : vA > vB ? 1 : -1;
      return sortDir === 'asc' ? cmp : -cmp;
    });

    const exportCsv = () => {
      const rows = [['Quantum', 'Avg WT', 'Avg TAT', 'Context Switches'], ...filtered.map(p => [p.q, p.awt.toFixed(2), p.atat.toFixed(2), p.cs])];
      const csv = rows.map(r => r.join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'quantum-analysis.csv';
      a.click();
      URL.revokeObjectURL(url);
    };

    const selectedResult = selectedQ ? roundRobin(processes, selectedQ) : null;

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Sort By</label>
            <div className="flex gap-2">
              <select value={sortKey} onChange={e => setSortKey(e.target.value as any)} className="px-3 py-2 border rounded bg-white dark:bg-gray-800">
                <option value="q">Quantum</option>
                <option value="awt">Avg WT</option>
                <option value="atat">Avg TAT</option>
                <option value="cs">Context Switches</option>
              </select>
              <button onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))} className="px-3 py-2 border rounded bg-white dark:bg-gray-800">
                {sortDir === 'asc' ? 'Asc' : 'Desc'}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Q Range</label>
            <div className="flex items-center gap-2">
              <input type="number" min={1} max={qValues[qValues.length - 1]} placeholder="min" className="w-20 px-2 py-2 border rounded bg-white dark:bg-gray-800" value={qRange?.[0] ?? ''} onChange={e => {
                const v = e.target.value === '' ? null : Math.max(1, parseInt(e.target.value, 10));
                setQRange(r => v == null ? (r ? [r[0], r[1]] : null) : [v, (r?.[1] ?? qValues[qValues.length - 1])]);
              }} />
              <span className="text-gray-600 dark:text-gray-300">to</span>
              <input type="number" min={1} max={qValues[qValues.length - 1]} placeholder="max" className="w-20 px-2 py-2 border rounded bg-white dark:bg-gray-800" value={qRange?.[1] ?? ''} onChange={e => {
                const v = e.target.value === '' ? null : Math.max(1, parseInt(e.target.value, 10));
                setQRange(r => v == null ? (r ? [r[0], r[1]] : null) : [(r?.[0] ?? 1), v]);
              }} />
              <button className="px-3 py-2 border rounded bg-gray-100 dark:bg-gray-800" onClick={() => setQRange(null)}>Clear</button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showWT} onChange={e => setShowWT(e.target.checked)} /> WT</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showTAT} onChange={e => setShowTAT(e.target.checked)} /> TAT</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showCS} onChange={e => setShowCS(e.target.checked)} /> CS</label>
          </div>

          <div className="ml-auto flex items-end gap-2">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Target Q</label>
              <input type="number" min={1} max={qValues[qValues.length - 1]} value={targetQ} onChange={e => setTargetQ(e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value, 10)))} className="w-24 px-3 py-2 border rounded bg-white dark:bg-gray-800" />
            </div>
            <button onClick={() => setSelectedQ(typeof targetQ === 'number' ? targetQ : null)} className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded">Pin</button>
            <button onClick={exportCsv} className="px-3 py-2 bg-gray-200 dark:bg-gray-700 rounded">Export CSV</button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-emerald-900/30 dark:to-emerald-900/10 p-5 rounded-lg border">
            <div className="text-sm text-gray-600 dark:text-gray-300">Optimal Quantum (Min AWT)</div>
            <div className="text-5xl font-bold text-green-600 dark:text-green-400">{minAwtPoint.q}</div>
            <div className="text-sm text-gray-600 dark:text-gray-300 mt-1">Average Waiting Time: {minAwtPoint.awt.toFixed(2)}</div>
          </div>
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-violet-900/30 dark:to-violet-900/10 p-5 rounded-lg border">
            <div className="text-sm text-gray-600 dark:text-gray-300">Adaptive Quantum (80% Median BT)</div>
            <div className="text-5xl font-bold text-purple-600 dark:text-purple-400">{adaptiveQ}</div>
            <div className="text-sm text-gray-600 dark:text-gray-300 mt-1">Median Burst Time: {median.toFixed(2)}</div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 p-5 rounded-lg shadow border">
          <h3 className="text-lg font-bold mb-4">Average Waiting Time vs Quantum</h3>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="q" tick={{ fontSize: 12 }} label={{ value: 'Quantum', position: 'insideBottom', offset: -2 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                {showWT && <Line type="monotone" dataKey="awt" name="Avg WT" stroke="#10B981" strokeWidth={3} dot={false} />}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 p-5 rounded-lg shadow border">
          <h3 className="text-lg font-bold mb-4">Average Turnaround Time vs Quantum</h3>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="q" tick={{ fontSize: 12 }} label={{ value: 'Quantum', position: 'insideBottom', offset: -2 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                {showTAT && <Line type="monotone" dataKey="atat" name="Avg TAT" stroke="#3B82F6" strokeWidth={3} dot={false} />}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 p-5 rounded-lg shadow border">
          <h3 className="text-lg font-bold mb-4">Context Switches vs Quantum</h3>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="q" tick={{ fontSize: 12 }} label={{ value: 'Quantum', position: 'insideBottom', offset: -2 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                {showCS && <Line type="monotone" dataKey="cs" name="Context Switches" stroke="#F97316" strokeWidth={3} dot={false} />}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-lg shadow border overflow-hidden">
          <h3 className="text-lg font-bold p-4 bg-gray-50 dark:bg-gray-800 border-b">Detailed Quantum Analysis</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 text-center">Quantum</th>
                  {showWT && <th className="px-4 py-3 text-center">Avg WT</th>}
                  {showTAT && <th className="px-4 py-3 text-center">Avg TAT</th>}
                  {showCS && <th className="px-4 py-3 text-center">Context Switches</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => (
                  <tr
                    key={p.q}
                    onClick={() => setSelectedQ(p.q)}
                    className={`${i % 2 === 0 ? 'bg-gray-50 dark:bg-gray-800/40' : 'bg-white dark:bg-gray-900'} ${p.q === minAwtPoint.q ? 'bg-green-100/70 dark:bg-emerald-900/30 font-semibold' : ''} ${typeof targetQ === 'number' && p.q === targetQ ? 'ring-2 ring-indigo-400' : ''} cursor-pointer`}
                  >
                    <td className="px-4 py-3 text-center">
                      {p.q}
                      {p.q === minAwtPoint.q && <span className="text-green-600 dark:text-green-400 text-xs ml-1">★ Optimal</span>}
                      {p.q === adaptiveQ && <span className="text-purple-600 dark:text-purple-400 text-xs ml-2">◆ Adaptive</span>}
                      {typeof targetQ === 'number' && p.q === targetQ && <span className="text-indigo-600 dark:text-indigo-400 text-xs ml-2">● Target</span>}
                    </td>
                    {showWT && <td className="px-4 py-3 text-center text-green-600 dark:text-green-400">{p.awt.toFixed(2)}</td>}
                    {showTAT && <td className="px-4 py-3 text-center text-blue-600 dark:text-blue-400">{p.atat.toFixed(2)}</td>}
                    {showCS && <td className="px-4 py-3 text-center text-orange-600 dark:text-orange-400">{p.cs}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 dark:border-blue-600 p-6 rounded-lg">
          <h4 className="font-bold text-lg mb-2 text-blue-900 dark:text-blue-200">Analysis Insights</h4>
          <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>• <strong>Optimal Quantum (Q={minAwtPoint.q}):</strong> Minimizes average waiting time</li>
            <li>• <strong>Adaptive Quantum (Q={adaptiveQ}):</strong> ≈ 80% of median burst time for balance</li>
            <li>• <strong>Small quantum:</strong> Higher responsiveness but more context-switch overhead</li>
            <li>• <strong>Large quantum:</strong> Lower overhead but potentially higher waiting times</li>
            <li>• <strong>Trade-off:</strong> Tune Q based on workload characteristics (CPU vs IO bound)</li>
          </ul>
        </div>

        {selectedResult && (
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow border p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold">Per-Process Metrics (Q={selectedQ})</h3>
              <button className="px-3 py-2 bg-gray-200 dark:bg-gray-700 rounded" onClick={() => setSelectedQ(null)}>Close</button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="overflow-x-auto">
                <table className="w-full border rounded">
                  <thead className="bg-gray-100 dark:bg-gray-800">
                    <tr>
                      <th className="px-3 py-2 text-left">Process</th>
                      <th className="px-3 py-2 text-center">AT</th>
                      <th className="px-3 py-2 text-center">BT</th>
                      <th className="px-3 py-2 text-center">CT</th>
                      <th className="px-3 py-2 text-center">TAT</th>
                      <th className="px-3 py-2 text-center">WT</th>
                      <th className="px-3 py-2 text-center">RT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedResult.resultData.map((p, i) => (
                      <tr key={p.id} className={i % 2 === 0 ? 'bg-gray-50 dark:bg-gray-800/30' : ''}>
                        <td className="px-3 py-2 font-semibold">P{p.id}</td>
                        <td className="px-3 py-2 text-center">{p.at}</td>
                        <td className="px-3 py-2 text-center">{p.bt}</td>
                        <td className="px-3 py-2 text-center">{p.ct}</td>
                        <td className="px-3 py-2 text-center">{p.tat}</td>
                        <td className="px-3 py-2 text-center">{p.wt}</td>
                        <td className="px-3 py-2 text-center">{p.rt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <GanttChart gantt={selectedResult.gantt} />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-950 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl p-6 md:p-8 mb-6 border">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center shadow-lg">
                <BarChart3 className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-gray-100">Round Robin Scheduler</h1>
                <p className="text-gray-600 dark:text-gray-300">Interactive CPU Scheduling Visualizer</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setDark(d => !d)} className="p-2 rounded-lg border bg-gray-50 dark:bg-gray-800">
                {dark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
              <button
                onClick={() => window.open('https://en.wikipedia.org/wiki/Round-robin_scheduling', '_blank')}
                className="p-2 bg-blue-100 hover:bg-blue-200 rounded-lg transition-colors"
                title="What is Round Robin?"
              >
                <Info className="w-5 h-5 text-blue-700" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 mb-6">
            <Tabs
              value={activeView}
              onChange={setActiveView}
              tabs={[
                { key: 'scheduler', label: 'Scheduler', icon: <Play className="w-5 h-5" /> },
                { key: 'compare', label: 'Compare Quanta', icon: <GitCompare className="w-5 h-5" /> },
                { key: 'rrfcfs', label: 'RR vs FCFS', icon: <BarChart3 className="w-5 h-5" /> },
                { key: 'analyze', label: 'Analyze Quantum', icon: <BarChart3 className="w-5 h-5" /> }
              ]}
            />
          </div>

          {activeView === 'scheduler' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="md:col-span-1">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Time Quantum</label>
                  <input
                    type="number"
                    value={quantum}
                    min={1}
                    onChange={e => setQuantum(Math.max(1, parseInt(e.target.value || '1', 10)))}
                    className="w-full px-4 py-2 border-2 border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                  <input
                    type="range"
                    min={1}
                    max={20}
                    value={quantum}
                    onChange={e => setQuantum(parseInt(e.target.value, 10))}
                    className="w-full mt-2"
                  />
                </div>
                <div className="md:col-span-3 flex flex-wrap gap-3 items-end">
                  <button onClick={add} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold flex items-center gap-2">
                    <Plus className="w-5 h-5" /> Add Process
                  </button>
                  <button onClick={randomize} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold flex items-center gap-2">
                    <Shuffle className="w-5 h-5" /> Random Data
                  </button>
                  <button onClick={() => setProcesses(DEFAULT_PROCESSES)} className="px-4 py-2 bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg font-semibold flex items-center gap-2">
                    <RefreshCw className="w-5 h-5" /> Reset
                  </button>
                  <button onClick={run} className="ml-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold flex items-center gap-2">
                    <Play className="w-5 h-5" /> Run Scheduler
                  </button>
                </div>
              </div>

              <div className="mb-4">
                <div className="mb-2 text-sm text-gray-700 dark:text-gray-200 font-semibold">Presets</div>
                <Presets onApply={setProcesses} />
              </div>

              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-6 border">
                <div className="grid grid-cols-4 gap-4 font-semibold text-sm text-gray-700 dark:text-gray-300 mb-2 px-2">
                  <div>Process</div>
                  <div>Arrival Time</div>
                  <div>Burst Time</div>
                  <div>Actions</div>
                </div>
                {processes.map(p => (
                  <div key={p.id} className="grid grid-cols-4 gap-4 items-center mb-2 bg-white dark:bg-gray-900 p-2 rounded shadow-sm border">
                    <div className="font-bold text-blue-600 dark:text-blue-400">P{p.id}</div>
                    <div>
                      <input type="number" value={p.at} min={0} onChange={e => update(p.id, 'at', e.target.value)} className="w-full px-3 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
                      {errors[p.id]?.at && <div className="text-xs text-red-500 mt-1">{errors[p.id]?.at}</div>}
                    </div>
                    <div>
                      <input type="number" value={p.bt} min={1} onChange={e => update(p.id, 'bt', e.target.value)} className="w-full px-3 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
                      {errors[p.id]?.bt && <div className="text-xs text-red-500 mt-1">{errors[p.id]?.bt}</div>}
                    </div>
                    <div>
                      <button onClick={() => remove(p.id)} disabled={processes.length === 1} className="px-3 py-1 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded flex items-center gap-1">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {results && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                    <StatCard label="Avg TAT" value={results.avgTat.toFixed(2)} color="border-blue-200" />
                    <StatCard label="Avg WT" value={results.avgWt.toFixed(2)} color="border-green-200" />
                    <StatCard label="Context Switches" value={results.cs} color="border-orange-200" />
                    <StatCard label="CPU Util" value={`${results.cpuUtil}%`} color="border-purple-200" />
                    <StatCard label="Throughput" value={results.throughput} color="border-pink-200" />
                  </div>

                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xl font-bold">Gantt Chart Visualization</h3>
                      <button
                        onClick={() => {
                          setAnimating(a => !a);
                          setCurrentTime(0);
                        }}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold"
                      >
                        {animating ? 'Stop' : 'Animate'}
                      </button>
                    </div>
                    <GanttChart gantt={results.gantt} currentTime={currentTime} animated={animating} onTimeChange={setCurrentTime} />
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full bg-white dark:bg-gray-900 rounded-lg shadow overflow-hidden border">
                      <thead className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
                        <tr>
                          <th className="px-4 py-3 text-left">Process</th>
                          <th className="px-4 py-3 text-center">AT</th>
                          <th className="px-4 py-3 text-center">BT</th>
                          <th className="px-4 py-3 text-center">CT</th>
                          <th className="px-4 py-3 text-center">TAT</th>
                          <th className="px-4 py-3 text-center">WT</th>
                          <th className="px-4 py-3 text-center">RT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.resultData.map((p, idx) => (
                          <tr key={p.id} className={idx % 2 === 0 ? 'bg-gray-50 dark:bg-gray-800/40' : 'bg-white dark:bg-gray-900'}>
                            <td className="px-4 py-3 font-bold text-blue-600 dark:text-blue-400">P{p.id}</td>
                            <td className="px-4 py-3 text-center">{p.at}</td>
                            <td className="px-4 py-3 text-center">{p.bt}</td>
                            <td className="px-4 py-3 text-center">{p.ct}</td>
                            <td className="px-4 py-3 text-center font-semibold text-blue-600">{p.tat}</td>
                            <td className="px-4 py-3 text-center font-semibold text-green-600">{p.wt}</td>
                            <td className="px-4 py-3 text-center font-semibold text-orange-600">{p.rt}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}

          {activeView === 'compare' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Quantum 1</label>
                  <input type="number" value={compareQ1} min={1} onChange={e => setCompareQ1(Math.max(1, parseInt(e.target.value || '1', 10)))} className="w-full px-4 py-2 border-2 border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Quantum 2</label>
                  <input type="number" value={compareQ2} min={1} onChange={e => setCompareQ2(Math.max(1, parseInt(e.target.value || '1', 10)))} className="w-full px-4 py-2 border-2 border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
                </div>
              </div>
              {<ComparisonView />}
            </div>
          )}

          {activeView === 'rrfcfs' && <RRvsFCFSView />}
          {activeView === 'analyze' && <AnalyzeView />}
        </div>
      </div>
    </div>
  );
};

export default RoundRobinScheduler;


