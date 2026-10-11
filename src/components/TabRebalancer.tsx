import React, { useState, useEffect, useMemo } from 'react';
import { PlotlyChart } from './PlotlyChart';
import { Play, Pause, RotateCcw, RefreshCw } from 'lucide-react';
import dataset from '../data/dataset.json';
import { runDynamicRebalance, RebalanceParameters } from '../services/rebalanceService';
import { RiskSignal } from '../services/nlpEngine';

const CONSTITUENT_COLORS: Record<string, string> = {
  AAPL: '#0F7C8A',
  MSFT: '#3C6E91',
  NVDA: '#1E9E78',
  GOOGL: '#534D7E',
  META: '#2563EB',
  AMZN: '#E4572E',
  TSLA: '#B5382A',
  JPM: '#0B2B33',
  BAC: '#1E40AF',
  GS: '#4338CA',
  XOM: '#D97706',
  CVX: '#B45309',
  JNJ: '#059669',
  PFE: '#10B981',
  UNH: '#0D9488',
  WMT: '#E9A23B',
  KO: '#DC2626',
  PG: '#6B7B84',
  BA: '#475569',
  DIS: '#7C3AED',
};

interface TabRebalancerProps {
  tiltLambda: number;
  halfLifeMinutes: number;
  maxWeight: number;
  deadbandBp: number;
  maxTurnover: number;
  appMode?: 'replay' | 'live';
  signals?: RiskSignal[];
  onSyncLiveFeed?: () => void;
  isSyncingLive?: boolean;
}

export const TabRebalancer: React.FC<TabRebalancerProps> = ({
  tiltLambda,
  halfLifeMinutes,
  maxWeight,
  deadbandBp,
  maxTurnover,
  appMode = 'replay',
  signals,
  onSyncLiveFeed,
  isSyncingLive
}) => {
  const universe = dataset.universe as Array<{
    ticker: string;
    name: string;
    sector: string;
    base_weight: number;
  }>;

  // Run dynamic rebalance algorithm whenever parameters or signals change
  const rebalanceRes = useMemo(() => {
    return runDynamicRebalance({
      tiltLambda,
      halfLifeMinutes,
      maxWeight,
      deadbandBp,
      maxTurnover,
      customSignals: appMode === 'live' && signals && signals.length > 0 ? signals : undefined,
    });
  }, [tiltLambda, halfLifeMinutes, maxWeight, deadbandBp, maxTurnover, appMode, signals]);

  const timestamps = rebalanceRes.timestamps;
  const [stepIndex, setStepIndex] = useState<number>(() => Math.max(0, timestamps.length - 1));
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [selectedStock, setSelectedStock] = useState<string>('NVDA');

  // Keep stepIndex at the latest step when timestamps array updates, unless user is playing
  useEffect(() => {
    if (!isPlaying) {
      setStepIndex(Math.max(0, timestamps.length - 1));
    }
  }, [timestamps.length, isPlaying]);

  // Responsive state for chart layouts
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    return typeof window !== 'undefined' ? window.innerWidth < 768 : false;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Format step timestamp in Eastern Time (market hours)
  const formatTimeLabel = (ts: string) => {
    try {
      const d = new Date(ts);
      if (isNaN(d.getTime())) return ts;
      if (appMode === 'live') {
        return d.toLocaleDateString('en-US', {
          timeZone: 'America/New_York',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        });
      }
      return d.toLocaleDateString('en-US', {
        timeZone: 'America/New_York',
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    } catch {
      return ts;
    }
  };

  // Format display time for clock headers
  const formatDisplayTime = (ts: string) => {
    try {
      const d = new Date(ts);
      if (isNaN(d.getTime())) return ts;
      if (appMode === 'live') {
        return d.toLocaleDateString('en-US', {
          timeZone: 'America/New_York',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        }) + ' ET';
      }
      return d.toLocaleDateString('en-US', {
        timeZone: 'America/New_York',
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }) + ' ET';
    } catch {
      return ts;
    }
  };

  // Generate cleanly aligned x-axis trading day ticks
  const { tickVals, tickText } = useMemo(() => {
    const times = timestamps.map(formatTimeLabel);
    if (!times.length) return { tickVals: [], tickText: [] };

    // In live mode: pick 4 to 6 evenly spaced timestamps across live stream
    if (appMode === 'live') {
      const numTicks = isMobile ? 3 : 5;
      if (times.length <= numTicks) {
        return {
          tickVals: times,
          tickText: timestamps.map(ts => {
            const d = new Date(ts);
            return isNaN(d.getTime())
              ? ts
              : d.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false });
          })
        };
      }
      const step = Math.floor((times.length - 1) / (numTicks - 1));
      const idxs: number[] = [];
      for (let i = 0; i < times.length - 1; i += step) {
        idxs.push(i);
      }
      if (!idxs.includes(times.length - 1)) {
        idxs.push(times.length - 1);
      }
      const vals = idxs.map(i => times[i]);
      const text = idxs.map(i => {
        const d = new Date(timestamps[i]);
        if (isNaN(d.getTime())) return times[i];
        return d.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false });
      });
      return { tickVals: vals, tickText: text };
    }

    // In replay mode: standard 70-step trading week
    if (times.length >= 70) {
      const idxs = [0, 14, 28, 42, 56, Math.min(69, times.length - 1)];
      const vals = idxs.map(i => times[i]).filter(Boolean);
      const text = isMobile
        ? ['Mon 21', 'Tue 22', 'Wed 23', 'Thu 24', 'Fri 25', 'Close']
        : ['Mon Sep 21', 'Tue Sep 22', 'Wed Sep 23', 'Thu Sep 24', 'Fri Sep 25', 'Fri Close'];
      return { tickVals: vals, tickText: text };
    }
    const step = Math.max(1, Math.floor(times.length / 5));
    const vals: string[] = [];
    const text: string[] = [];
    for (let i = 0; i < times.length; i += step) {
      vals.push(times[i]);
      text.push(times[i]);
    }
    if (vals[vals.length - 1] !== times[times.length - 1]) {
      vals.push(times[times.length - 1]);
      text.push(times[times.length - 1]);
    }
    return { tickVals: vals, tickText: text };
  }, [timestamps, isMobile, appMode]);

  // Animation player
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isPlaying) {
      timer = setInterval(() => {
        setStepIndex(prev => {
          if (prev >= timestamps.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 150);
    }
    return () => clearInterval(timer);
  }, [isPlaying, timestamps.length]);

  const safeStepIndex = Math.min(stepIndex, Math.max(0, timestamps.length - 1));
  const currentTimestamp = timestamps[safeStepIndex] || timestamps[timestamps.length - 1] || new Date().toISOString();
  const currentStep = rebalanceRes.steps[safeStepIndex] || rebalanceRes.steps[rebalanceRes.steps.length - 1] || { weights: {} };
  const summary = rebalanceRes.summary;

  // Current weight deviation bar chart
  const deviationBarData = useMemo(() => {
    const tickers = universe.map(u => u.ticker);
    const devs = tickers.map((t, i) => {
      const w = currentStep.weights?.[t] ?? 0.05;
      const base = universe[i]?.base_weight || 0.05;
      return (w - base) * 100;
    });
    const colors = devs.map(d => d >= 0 ? '#1E9E78' : '#E4572E');

    return [{
      type: 'bar',
      x: tickers,
      y: devs,
      marker: { color: colors },
      hovertemplate: '<b>%{x}</b>: %{y:+.2f} pp vs base<extra></extra>'
    }];
  }, [universe, currentStep]);

  // Weights area chart (cumulative over time)
  const weightsAreaData = useMemo(() => {
    const tickers = universe.map(u => u.ticker);
    const traces: any[] = [];
    const times = timestamps.map(formatTimeLabel);

    for (const t of tickers) {
      const yVals = rebalanceRes.steps.map(step => (step.weights?.[t] ?? 0.05) * 100);
      const color = CONSTITUENT_COLORS[t];

      traces.push({
        name: t,
        x: times,
        y: yVals,
        type: 'scatter',
        mode: 'lines',
        stackgroup: 'one',
        line: color ? { color, width: 1 } : undefined,
        fillcolor: color,
        hovertemplate: `<b>%{x}</b><br><b>${t}</b>: %{y:.2f}%<extra></extra>`
      });
    }

    return traces;
  }, [universe, timestamps, rebalanceRes.steps, appMode]);

  // Weights Area Chart Layout with responsive, right-aligned legend and cleanly aligned x-axis
  const weightsAreaLayout = useMemo(() => {
    if (isMobile) {
      return {
        height: 440,
        xaxis: {
          title: {
            text: appMode === 'live'
              ? "Live Market Signals Stream Timeline (Eastern Time ET)"
              : "Trading Week Timeline (Mon Sep 21 – Fri Sep 25)",
            font: { size: 10, color: '#0B2B33' },
            standoff: 8
          },
          tickmode: 'array',
          tickvals: tickVals,
          ticktext: tickText,
          tickfont: { size: 9, color: '#4A5E66' },
          tickangle: 0,
          showgrid: true,
          gridcolor: '#F3F6F6',
          automargin: true
        },
        yaxis: { title: { text: "Weight (%)" }, range: [0, 100] },
        showlegend: true,
        legend: {
          orientation: 'h',
          x: 0.5,
          xanchor: 'center',
          y: -0.26,
          yanchor: 'top',
          font: { size: 8, color: '#4A5E66' },
          itemsizing: 'constant'
        },
        margin: { l: 45, r: 15, t: 15, b: 95 }
      };
    }

    return {
      height: 380,
      xaxis: {
        title: {
          text: appMode === 'live'
            ? "Live Market Signals Stream Timeline (Chronological Market Signals · Eastern Time ET)"
            : "Trading Week Timeline (Mon Sep 21 – Fri Sep 25, 2026 · US Market Hours ET)",
          font: { size: 11, color: '#0B2B33' },
          standoff: 10
        },
        tickmode: 'array',
        tickvals: tickVals,
        ticktext: tickText,
        tickfont: { size: 10, color: '#4A5E66' },
        tickangle: 0,
        showgrid: true,
        gridcolor: '#F3F6F6',
        automargin: true
      },
      yaxis: { title: { text: "Weight (%)" }, range: [0, 100] },
      showlegend: true,
      legend: {
        orientation: 'v',
        x: 1.02,
        xanchor: 'left',
        y: 1,
        yanchor: 'top',
        title: { text: '<b>Constituents</b>', font: { size: 11, color: '#0B2B33' } },
        font: { size: 9, color: '#4A5E66' },
        itemsizing: 'constant',
        tracegroupgap: 1
      },
      margin: { l: 45, r: 110, t: 15, b: 55 }
    };
  }, [isMobile, tickVals, tickText, appMode]);

  // Cumulative turnover comparison
  const turnoverComparisonData = useMemo(() => {
    const times = timestamps.map(formatTimeLabel);
    let cumEngine = 0;
    let cumNaive = 0;
    const yEngine: number[] = [];
    const yNaive: number[] = [];

    for (const step of rebalanceRes.steps) {
      cumEngine += step.turnover * 100;
      cumNaive += step.naiveTurnover * 100;
      yEngine.push(cumEngine);
      yNaive.push(cumNaive);
    }

    return [
      {
        name: 'Foreshock Disciplined Engine',
        x: times,
        y: yEngine,
        type: 'scatter',
        mode: 'lines',
        line: { color: '#0B2B33', width: 2.5 },
        hovertemplate: '<b>%{x}</b><br>Foreshock Engine: %{y:.1f}%<extra></extra>'
      },
      {
        name: 'Unconstrained Sentiment Tilt',
        x: times,
        y: yNaive,
        type: 'scatter',
        mode: 'lines',
        line: { color: '#E4572E', width: 1.5, dash: 'dot' },
        hovertemplate: '<b>%{x}</b><br>Unconstrained: %{y:.1f}%<extra></extra>'
      }
    ];
  }, [timestamps, rebalanceRes.steps, appMode]);

  // Why did a weight move? Explainability
  const stockExplainRows = useMemo(() => {
    const activeSignalsList = (appMode === 'live' && signals && signals.length > 0)
      ? signals
      : (dataset.signals as any[]);
    const relevant = activeSignalsList.filter((s: any) => {
      if (s.primary_entity === selectedStock) return true;
      return s.entities && s.entities.some((e: any) => (e.ticker || e) === selectedStock);
    });

    return relevant.slice(0, 8).map((s: any) => ({
      time: new Date(s.timestamp).toLocaleDateString('en-US', {
        timeZone: 'America/New_York',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }),
      source: s.source_name,
      headline: s.headline,
      sentiment: s.sentiment_score,
      impact: s.impact_score,
      contribution: s.sentiment_score * (s.reliability || 0.7) * (s.impact_score / 10),
    }));
  }, [selectedStock, appMode, signals]);

  const selectedStockBase = universe.find(u => u.ticker === selectedStock)?.base_weight || 0.05;
  const currentStockWeight = (currentStep.weights[selectedStock] ?? selectedStockBase) * 100;
  const stockDev = currentStockWeight - (selectedStockBase * 100);

  return (
    <div className="space-y-6">
      {/* Story / Mode Card */}
      {appMode === 'live' ? (
        <div className="bg-white border border-[#DCE3E5] border-l-4 border-l-[#1E9E78] p-4 rounded-lg text-sm text-[#0B2B33] leading-relaxed space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#1E9E78]/10 text-[#1E9E78] font-bold text-xs rounded border border-[#1E9E78]/30">
                <span className="w-2 h-2 rounded-full bg-[#1E9E78] animate-pulse"></span>
                LIVE REBALANCING STREAM ACTIVE
              </span>
              <span className="text-xs text-[#4A5E66]">
                {signals?.length || 0} live market wire bulletins driving real-time tilts
              </span>
            </div>

            {onSyncLiveFeed && (
              <button
                onClick={onSyncLiveFeed}
                disabled={isSyncingLive}
                className="flex items-center gap-1.5 px-3 py-1 bg-[#0B2B33] text-white rounded text-xs font-semibold hover:bg-[#1E9E78] transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
                title="Fetch latest news headlines into the live rebalancer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingLive ? 'animate-spin' : ''}`} />
                <span>{isSyncingLive ? 'Syncing Feeds...' : 'Sync Live Feeds'}</span>
              </button>
            )}
          </div>
          <div className="text-xs sm:text-sm text-[#0B2B33]">
            <strong>Live Market Execution.</strong> As live market wires (CNBC RSS, financial wire, custom bulletins) stream into the engine,
            credibility- and impact-weighted sentiment is dynamically attributed to mentioned constituents and the macro aggregate.
            Target weights adapt continuously in real time while enforcing concentration caps (1.5%–{(maxWeight * 100).toFixed(0)}%),
            the {deadbandBp} bp noise deadband, and the {(maxTurnover * 100).toFixed(0)}% turnover ceiling.
          </div>
        </div>
      ) : (
        <div className="bg-white border border-[#DCE3E5] border-l-4 border-l-[#0B2B33] p-4 rounded-lg text-sm text-[#0B2B33] leading-relaxed">
          <strong>Execution Mechanics (Weekly Replay Mode).</strong> Ingested signals contribute credibility- and impact-weighted sentiment into referenced constituents.
          Evidence decays exponentially toward neutral and dynamically tilts target weights (<code>w_base × exp(λ·S)</code>) within hard
          concentration bounds (1.5%–{(maxWeight * 100).toFixed(0)}%), a {deadbandBp} bp dead-band filter, and a {(maxTurnover * 100).toFixed(0)}% turnover ceiling.
          Negative market-wide headlines automatically de-risk high-beta holdings.
        </div>
      )}

      {/* Replay Controls & KPIs */}
      <div className="bg-white border border-[#DCE3E5] rounded-lg p-4 space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#0B2B33]">
              {appMode === 'live' ? 'Live Signal Timeline:' : 'Simulation Clock:'}
            </span>
            <span className="font-mono text-sm font-bold text-[#0B2B33] bg-[#F3F6F6] px-2.5 py-1 rounded border border-[#DCE3E5]">
              {formatDisplayTime(currentTimestamp)}
            </span>
            {appMode === 'live' && (
              <span className="text-xs text-[#4A5E66] font-mono">
                Step {safeStepIndex + 1}/{timestamps.length} {safeStepIndex === timestamps.length - 1 ? '(Latest)' : ''}
              </span>
            )}
            {appMode === 'live' && safeStepIndex !== timestamps.length - 1 && (
              <button
                onClick={() => setStepIndex(timestamps.length - 1)}
                className="px-2 py-0.5 text-[11px] font-semibold bg-[#1E9E78] text-white rounded hover:bg-[#0B2B33] transition-colors cursor-pointer"
                title="Snap to the current latest live market portfolio state"
              >
                Snap to Latest
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0B2B33] text-white rounded text-xs font-semibold hover:bg-[#1E9E78] transition-colors cursor-pointer"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>
                {isPlaying
                  ? (appMode === 'live' ? 'Pause Stream' : 'Pause Simulation')
                  : (appMode === 'live' ? 'Play Stream (Live Sequence)' : 'Play Simulation (Weekly Replay)')}
              </span>
            </button>
            <button
              onClick={() => { setStepIndex(0); setIsPlaying(false); }}
              className="p-1.5 text-[#4A5E66] hover:text-[#0B2B33] rounded border border-[#DCE3E5] hover:bg-[#F3F6F6] cursor-pointer"
              title="Reset timeline to start"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Timeline Slider */}
        <input
          type="range"
          min="0"
          max={Math.max(0, timestamps.length - 1)}
          value={safeStepIndex}
          onChange={(e) => { setStepIndex(parseInt(e.target.value)); setIsPlaying(false); }}
          className="w-full accent-[#0B2B33] cursor-pointer"
        />

        {/* Dynamic KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2">
          <div className="bg-[#F3F6F6] border border-[#DCE3E5] rounded p-3">
            <div className="text-[11px] text-[#4A5E66]">Engine Turnover / Step</div>
            <div className="text-xl font-bold font-mono text-[#0B2B33] mt-0.5">
              {summary.avgTurnoverEnginePct.toFixed(2)}%
            </div>
          </div>
          <div className="bg-[#F3F6F6] border border-[#DCE3E5] rounded p-3">
            <div className="text-[11px] text-[#4A5E66]">Unconstrained Turnover / Step</div>
            <div className="text-xl font-bold font-mono text-[#4A5E66] mt-0.5">
              {summary.avgTurnoverNaivePct.toFixed(2)}%
            </div>
          </div>
          <div className="bg-[#F3F6F6] border border-[#DCE3E5] rounded p-3">
            <div className="text-[11px] text-[#4A5E66]">Turnover Reduction</div>
            <div className="text-xl font-bold font-mono text-[#1E9E78] mt-0.5">
              {summary.turnoverReductionPct.toFixed(0)}%
            </div>
          </div>
          <div className="bg-[#F3F6F6] border border-[#DCE3E5] rounded p-3">
            <div className="text-[11px] text-[#4A5E66]">Peak Overweight Tilt</div>
            <div className="text-base font-bold font-mono text-[#1E9E78] mt-0.5">
              {summary.largestOverweight}
            </div>
          </div>
          <div className="bg-[#F3F6F6] border border-[#DCE3E5] rounded p-3">
            <div className="text-[11px] text-[#4A5E66]">Peak Underweight Tilt</div>
            <div className="text-base font-bold font-mono text-[#E4572E] mt-0.5">
              {summary.largestUnderweight}
            </div>
          </div>
        </div>
      </div>

      {/* Visualizations: Area & Deviation Bar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Weights Area Chart */}
        <div className="lg:col-span-7 bg-white border border-[#DCE3E5] rounded-lg p-4">
          <div className="flex justify-between items-center mb-1">
            <h3 className="font-bold text-[#0B2B33] text-base">
              Constituent Portfolio Weights {appMode === 'live' ? 'Across Live Stream' : 'Over Time'}
            </h3>
            <span className="text-xs text-[#4A5E66]">
              {appMode === 'live'
                ? `20 S&P-100 Large-Cap Constituents (${timestamps.length} stream intervals · Bounds: 1.5%–${(maxWeight * 100).toFixed(0)}%)`
                : `20 S&P-100 Large-Cap Constituents (Bounds: 1.5%–${(maxWeight * 100).toFixed(0)}%)`}
            </span>
          </div>
          <div className={isMobile ? "h-[440px]" : "h-[380px]"}>
            <PlotlyChart
              data={weightsAreaData}
              layout={weightsAreaLayout}
            />
          </div>
        </div>

        {/* Weight Deviation as of selected time */}
        <div className="lg:col-span-5 bg-white border border-[#DCE3E5] rounded-lg p-4">
          <div className="flex justify-between items-center mb-1">
            <h3 className="font-bold text-[#0B2B33] text-base">Active Allocation Tilt vs. Benchmark (5.0% Base)</h3>
            <span className="text-xs font-mono text-[#4A5E66]">{formatDisplayTime(currentTimestamp)}</span>
          </div>
          <div className={isMobile ? "h-[360px]" : "h-[380px]"}>
            <PlotlyChart
              data={deviationBarData}
              layout={{
                height: isMobile ? 360 : 380,
                xaxis: { tickangle: -45, automargin: true },
                yaxis: { title: { text: "Active Tilt (percentage points)" }, range: [-3.5, 3.5], zeroline: true, zerolinecolor: '#0B2B33' },
                margin: { l: 45, r: 15, t: 10, b: 60 }
              }}
            />
          </div>
        </div>
      </div>

      {/* Cumulative Turnover Chart */}
      <div className="bg-white border border-[#DCE3E5] rounded-lg p-4">
        <h3 className="font-bold text-[#0B2B33] text-base mb-1">
          Cumulative Portfolio Turnover: Disciplined Engine vs. Unconstrained Rule {appMode === 'live' ? '(Live Stream)' : ''}
        </h3>
        <p className="text-xs text-[#4A5E66] mb-3">
          Execution dead-bands ({deadbandBp} bp) and turnover capping ({(maxTurnover * 100).toFixed(0)}% per interval) suppress high-frequency noise while capturing genuine structural reallocations.
        </p>
        <div className="h-[280px]">
          <PlotlyChart
            data={turnoverComparisonData}
            layout={{
              height: 280,
              xaxis: {
                title: {
                  text: appMode === 'live'
                    ? "Live Market Signals Stream Timeline (Eastern Time ET)"
                    : "Trading Week Timeline (Mon Sep 21 – Fri Sep 25, 2026 · US Market Hours ET)",
                  font: { size: 11, color: '#0B2B33' },
                  standoff: 10
                },
                tickmode: 'array',
                tickvals: tickVals,
                ticktext: tickText,
                tickfont: { size: 10, color: '#4A5E66' },
                tickangle: 0,
                showgrid: true,
                gridcolor: '#F3F6F6',
                automargin: true
              },
              yaxis: { title: { text: "Cumulative Turnover (%)" }, gridcolor: '#F3F6F6' },
              legend: { orientation: 'h', y: 1.15, x: 1, xanchor: 'right', font: { size: 10 } },
              margin: { l: 50, r: 20, t: 35, b: 50 }
            }}
          />
        </div>
      </div>

      {/* Why did a weight move? Explorer */}
      <div className="bg-white border border-[#DCE3E5] rounded-lg p-5">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-2">
          <h3 className="font-bold text-[#0B2B33] text-lg">Position Tilt Attribution Explorer</h3>
          {appMode === 'live' && (
            <span className="text-xs font-semibold px-2 py-0.5 bg-[#1E9E78]/10 text-[#1E9E78] rounded border border-[#1E9E78]/30">
              Scoring Live Stream Headlines
            </span>
          )}
        </div>
        <p className="text-xs text-[#4A5E66] mb-4">
          Select any constituent from the universe to inspect the time-decayed evidence and headline catalysts driving its portfolio allocation.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Stock selector & Metric */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-[#0B2B33] mb-1">Select Constituent</label>
              <select
                value={selectedStock}
                onChange={(e) => setSelectedStock(e.target.value)}
                className="w-full bg-[#F3F6F6] border border-[#DCE3E5] rounded p-2 text-sm font-semibold text-[#0B2B33]"
              >
                {universe.map(u => (
                  <option key={u.ticker} value={u.ticker}>
                    {u.ticker} — {u.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="bg-[#F3F6F6] border border-[#DCE3E5] rounded p-3">
              <div className="text-xs text-[#4A5E66]">Effective Portfolio Weight</div>
              <div className="text-2xl font-bold font-mono text-[#0B2B33] mt-1">
                {currentStockWeight.toFixed(2)}%
              </div>
              <div className={`text-xs font-mono font-bold mt-1 ${stockDev >= 0 ? 'text-[#1E9E78]' : 'text-[#E4572E]'}`}>
                {stockDev >= 0 ? '+' : ''}{stockDev.toFixed(2)} pp vs base
              </div>
            </div>
          </div>

          {/* Contributing items table */}
          <div className="md:col-span-3 border border-[#DCE3E5] rounded overflow-hidden">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-[#F3F6F6] text-[#4A5E66] border-b border-[#DCE3E5]">
                <tr>
                  <th className="p-2.5 font-semibold">Timestamp (ET)</th>
                  <th className="p-2.5 font-semibold">Source Channel</th>
                  <th className="p-2.5 font-semibold">Headline / Commentary</th>
                  <th className="p-2.5 font-semibold text-right">Sentiment</th>
                  <th className="p-2.5 font-semibold text-right">Impact</th>
                  <th className="p-2.5 font-semibold text-right">Net Signal Impact (ΔS)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DCE3E5]">
                {stockExplainRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-[#4A5E66]">
                      No headline or commentary events recorded for this security in the current rebalancing window.
                    </td>
                  </tr>
                ) : (
                  stockExplainRows.map((r, i) => (
                    <tr key={i} className="hover:bg-[#F3F6F6]/50">
                      <td className="p-2.5 whitespace-nowrap font-mono text-[#4A5E66]">{r.time}</td>
                      <td className="p-2.5 whitespace-nowrap font-medium text-[#0B2B33]">{r.source}</td>
                      <td className="p-2.5 max-w-sm text-[#0B2B33]">{r.headline}</td>
                      <td className={`p-2.5 text-right font-mono font-semibold ${r.sentiment >= 0 ? 'text-[#1E9E78]' : 'text-[#E4572E]'}`}>
                        {r.sentiment >= 0 ? '+' : ''}{r.sentiment.toFixed(2)}
                      </td>
                      <td className="p-2.5 text-right font-mono text-[#0B2B33]">{r.impact.toFixed(1)}</td>
                      <td className={`p-2.5 text-right font-mono font-bold ${r.contribution >= 0 ? 'text-[#1E9E78]' : 'text-[#E4572E]'}`}>
                        {r.contribution >= 0 ? '+' : ''}{r.contribution.toFixed(3)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
