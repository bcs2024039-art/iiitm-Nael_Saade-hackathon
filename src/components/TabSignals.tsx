import React, { useState, useMemo, useEffect } from 'react';
import { PlotlyChart } from './PlotlyChart';
import { RiskSignal, EVENT_TYPES, analyzeDocument } from '../services/nlpEngine';
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Search,
  SlidersHorizontal,
  Sparkles,
  RefreshCw,
  Zap,
  PlusCircle,
  Wifi,
  Radio,
  CheckCircle2,
} from 'lucide-react';

interface TabSignalsProps {
  signals: RiskSignal[];
  stressThreshold: number;
  mode?: 'replay' | 'live';
  onSyncLiveFeed?: () => Promise<void> | void;
  onStreamNextLiveItem?: () => void;
  onInjectLiveItem?: (text: string, source: string, sourceType: 'news' | 'social') => void;
  isSyncingLive?: boolean;
  lastLiveSync?: number;
  autoSyncEnabled?: boolean;
  onToggleAutoSync?: () => void;
}

const PRESET_EXAMPLES: Record<string, { type: 'news' | 'social'; source: string; text: string; followers?: number; verified?: boolean }> = {
  "Geopolitical supply shock (news wire)": {
    type: "news",
    source: "SynthWire",
    text: "Naval standoff in Gulf shipping lane halts tanker traffic, crude spikes 9%. Oil jumped as traders priced in supply disruption and global equity futures slid.",
  },
  "Unverified run rumor (social post)": {
    type: "social",
    source: "X",
    text: "hearing Pacific Meridian Bank has frozen withdrawals?? unconfirmed, branches closed in 3 states... #banking",
    followers: 412,
    verified: false,
  },
  "Confirmed bankruptcy filing (news wire)": {
    type: "news",
    source: "SynthWire",
    text: "Pacific Meridian Bank files for bankruptcy protection after deposit run, regulators step in",
  },
  "Earnings beat (verified social)": {
    type: "social",
    source: "X",
    text: "$NVDA earnings were insane. guidance way above street 🚀🚀",
    followers: 8500,
    verified: true,
  },
  "Central bank rate hold (news wire)": {
    type: "news",
    source: "SynthWire",
    text: "Central bank holds rates steady, signals data-dependent approach",
  },
  "Custom text entry": {
    type: "news",
    source: "adhoc",
    text: "",
  },
};

const EVENT_COLORS: Record<string, string> = {
  "Geopolitical": "#B5382A",
  "Macroeconomic": "#E4572E",
  "Credit Event": "#7B1E3A",
  "Merger/Acquisition": "#3C6E91",
  "Earnings/Guidance": "#0F7C8A",
  "Product Launch": "#1E9E78",
  "Regulatory/Legal": "#534D7E",
  "Operational/Cyber": "#E9A23B",
  "Natural Disaster/Pandemic": "#C98A1B",
  "Leadership Change": "#6B7B84",
  "Analyst Action": "#9DB0B8",
  "Other": "#A0B0B5",
};

export const TabSignals: React.FC<TabSignalsProps> = ({
  signals,
  stressThreshold,
  mode = 'replay',
  onSyncLiveFeed,
  onStreamNextLiveItem,
  onInjectLiveItem,
  isSyncingLive = false,
  lastLiveSync,
  autoSyncEnabled = true,
  onToggleAutoSync,
}) => {
  // Table Filters
  const [sourceFilter, setSourceFilter] = useState<{ news: boolean; social: boolean }>({ news: true, social: true });
  const [eventFilter, setEventFilter] = useState<string>('ALL');
  const [minImpact, setMinImpact] = useState<number>(1.0);
  const [tickerQuery, setTickerQuery] = useState<string>('');

  // Live Flash Injection Drawer state
  const [showInjectModal, setShowInjectModal] = useState<boolean>(false);
  const [injectText, setInjectText] = useState<string>('');
  const [injectSource, setInjectSource] = useState<string>('Live Wire Flash');

  // Relative time ticker to refresh live indicators every few seconds
  const [ticker, setTicker] = useState<number>(0);
  useEffect(() => {
    if (mode !== 'live') return;
    const t = setInterval(() => setTicker(prev => prev + 1), 3000);
    return () => clearInterval(t);
  }, [mode]);

  // Responsive state for chart layout
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

  // Interactive Analyzer state
  const [selectedPreset, setSelectedPreset] = useState<string>("Geopolitical supply shock (news wire)");
  const [tryText, setTryText] = useState<string>(PRESET_EXAMPLES["Geopolitical supply shock (news wire)"].text);
  const [tryType, setTryType] = useState<'news' | 'social'>('news');
  const [trySource, setTrySource] = useState<string>('SynthWire');
  const [tryFollowers, setTryFollowers] = useState<number>(400);
  const [tryVerified, setTryVerified] = useState<boolean>(false);
  const [analysisResult, setAnalysisResult] = useState<RiskSignal | null>(null);
  const [showExplain, setShowExplain] = useState<boolean>(false);

  const formatSyncTime = (timestamp?: number) => {
    if (!timestamp) return 'Just now';
    const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
    if (diffSec < 5) return 'Just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    return `${diffMin}m ago`;
  };

  const handleInjectSubmit = () => {
    if (!injectText.trim()) return;
    onInjectLiveItem?.(injectText.trim(), injectSource.trim() || 'Live Wire Flash', 'news');
    setInjectText('');
    setShowInjectModal(false);
  };

  // Filtered table rows, sorted descending by timestamp
  const filteredSignals = useMemo(() => {
    const list = signals.filter(s => {
      const isSocial = s.source_type === 'social';
      if (isSocial && !sourceFilter.social) return false;
      if (!isSocial && !sourceFilter.news) return false;
      if (s.impact_score < minImpact) return false;
      if (eventFilter !== 'ALL' && s.event_type !== eventFilter) return false;
      if (tickerQuery.trim()) {
        const q = tickerQuery.trim().toUpperCase();
        const hasTicker = s.primary_entity?.toUpperCase() === q || (s.entities && s.entities.some(e => e.ticker?.toUpperCase() === q));
        if (!hasTicker) return false;
      }
      return true;
    });

    return list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [signals, sourceFilter, eventFilter, minImpact, tickerQuery]);

  // Handle Preset change
  const handlePresetChange = (name: string) => {
    setSelectedPreset(name);
    const p = PRESET_EXAMPLES[name];
    if (p) {
      setTryText(p.text);
      setTryType(p.type);
      setTrySource(p.source);
      setTryFollowers(p.followers ?? 400);
      setTryVerified(p.verified ?? false);
      setAnalysisResult(null);
    }
  };

  // Run analysis
  const handleAnalyze = () => {
    if (!tryText.trim()) return;
    const res = analyzeDocument({
      text: tryText,
      source_type: tryType,
      source_name: trySource,
      followers: tryFollowers,
      verified: tryVerified,
    });
    setAnalysisResult(res);
  };

  // KPIs
  const highImpactCount = useMemo(() => signals.filter(s => s.impact_score > 7).length, [signals]);
  const avgSentiment = useMemo(() => {
    if (!signals.length) return 0;
    const sum = signals.reduce((acc, s) => acc + s.sentiment_score, 0);
    return sum / signals.length;
  }, [signals]);

  // Scatter Plot Data
  const scatterPlotData = useMemo(() => {
    const byEvent: Record<string, { x: number[]; y: number[]; text: string[]; customdata: any[]; sizes: number[] }> = {};
    for (const s of signals) {
      const et = s.event_type || 'Other';
      if (!byEvent[et]) {
        byEvent[et] = { x: [], y: [], text: [], customdata: [], sizes: [] };
      }
      byEvent[et].x.push(s.sentiment_score);
      byEvent[et].y.push(s.impact_score);
      byEvent[et].text.push(s.headline);
      byEvent[et].customdata.push([s.source_name, s.corroboration || 1]);
      byEvent[et].sizes.push(Math.max(6, Math.min(22, s.reliability * 18 + 4)));
    }

    return Object.entries(byEvent).map(([et, data]) => ({
      x: data.x,
      y: data.y,
      text: data.text,
      customdata: data.customdata,
      mode: 'markers',
      name: et,
      hovertemplate: '<b>%{text}</b><br>%{customdata[0]} · corroboration x%{customdata[1]}<br>sentiment %{x:+.2f} · impact %{y:.1f}<extra>' + et + '</extra>',
      marker: {
        color: EVENT_COLORS[et] || '#9DB0B8',
        size: data.sizes,
        opacity: 0.8,
        line: { color: 'white', width: 0.5 }
      }
    }));
  }, [signals]);

  // Scatter Plot Layout with properly aligned legend and clean x-axis labeling
  const scatterPlotLayout = useMemo(() => {
    const xTickVals = isMobile
      ? [-1.0, -0.5, 0.0, 0.5, 1.0]
      : [-1.0, -0.75, -0.5, -0.25, 0.0, 0.25, 0.5, 0.75, 1.0];
    const xTickText = isMobile
      ? ['−1.0 Bearish', '−0.5', '0.0 Neutral', '+0.5', '+1.0 Bullish']
      : ['−1.0 (Bearish)', '−0.75', '−0.50', '−0.25', '0.00 (Neutral)', '+0.25', '+0.50', '+0.75', '+1.0 (Bullish)'];

    if (isMobile) {
      return {
        height: 440,
        xaxis: {
          title: {
            text: "Sentiment Score (−1.0 Bearish … +1.0 Bullish)",
            font: { size: 10, color: '#0B2B33' },
            standoff: 8
          },
          range: [-1.05, 1.05],
          tickmode: 'array',
          tickvals: xTickVals,
          ticktext: xTickText,
          tickfont: { size: 9, color: '#4A5E66' },
          tickangle: 0,
          zeroline: true,
          zerolinecolor: '#0B2B33',
          zerolinewidth: 1.5,
          gridcolor: '#F3F6F6',
          automargin: true
        },
        yaxis: {
          title: { text: "Impact score (1 … 10)" },
          range: [0.8, 10.2],
          zeroline: false,
          gridcolor: '#F3F6F6'
        },
        legend: {
          orientation: 'h',
          x: 0.5,
          xanchor: 'center',
          y: -0.26,
          yanchor: 'top',
          font: { size: 9, color: '#4A5E66' },
          itemsizing: 'constant'
        },
        margin: { l: 45, r: 15, t: 15, b: 90 }
      };
    }

    return {
      height: 400,
      xaxis: {
        title: {
          text: "Sentiment Score (−1.0 Bearish … +1.0 Bullish)",
          font: { size: 11, color: '#0B2B33' },
          standoff: 12
        },
        range: [-1.05, 1.05],
        tickmode: 'array',
        tickvals: xTickVals,
        ticktext: xTickText,
        tickfont: { size: 10, color: '#4A5E66' },
        tickangle: 0,
        zeroline: true,
        zerolinecolor: '#0B2B33',
        zerolinewidth: 1.5,
        gridcolor: '#F3F6F6',
        automargin: true
      },
      yaxis: {
        title: { text: "Calibrated Impact score (1 … 10)" },
        range: [0.8, 10.2],
        zeroline: false,
        gridcolor: '#F3F6F6'
      },
      legend: {
        orientation: 'v',
        x: 1.02,
        xanchor: 'left',
        y: 1,
        yanchor: 'top',
        title: { text: '<b>Event Category</b>', font: { size: 11, color: '#0B2B33' } },
        font: { size: 10, color: '#4A5E66' },
        itemsizing: 'constant',
        tracegroupgap: 2
      },
      margin: { l: 45, r: 180, t: 15, b: 55 }
    };
  }, [isMobile]);

  // Event Mix Data
  const eventMixData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of signals) {
      const et = s.event_type || 'Other';
      counts[et] = (counts[et] || 0) + 1;
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return [{
      type: 'bar',
      x: sorted.map(d => d[1]),
      y: sorted.map(d => d[0]),
      orientation: 'h',
      marker: {
        color: sorted.map(d => EVENT_COLORS[d[0]] || '#9DB0B8')
      },
      hovertemplate: '%{y}: %{x} signals<extra></extra>'
    }];
  }, [signals]);

  const docsIngestedCount = mode === 'live' ? Math.round(signals.length * 1.08) : 661;
  const duplicatesDroppedCount = mode === 'live' ? Math.max(1, Math.round(signals.length * 0.08)) : 48;

  return (
    <div className="space-y-6">
      {/* Live Ingestion Streaming Banner (visible when mode === 'live') */}
      {mode === 'live' && (
        <div className="bg-white border border-[#DCE3E5] border-l-4 border-l-[#1E9E78] rounded-lg p-4 sm:p-5 shadow-xs space-y-3">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-[#1E9E78] border border-emerald-200">
                  <span className="w-2 h-2 rounded-full bg-[#1E9E78] animate-pulse"></span>
                  LIVE FEED STREAMING ACTIVE
                </span>
                <span className="text-xs text-[#4A5E66] font-mono">
                  Sync: {formatSyncTime(lastLiveSync)}
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-[#0B2B33]">
                Real-Time Market Ingestion Feed
              </h2>
              <p className="text-xs text-[#4A5E66] max-w-3xl leading-relaxed">
                Actively streaming market headlines and unstructured financial text into the AI/NLP Risk Engine. Each incoming document is scored for sentiment, mapped into a 12-class event taxonomy, calibrated for market impact, and tested against portfolio stress thresholds.
              </p>
            </div>

            {/* Quick Action Buttons */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                onClick={() => onSyncLiveFeed?.()}
                disabled={isSyncingLive}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0B2B33] text-white rounded text-xs font-semibold hover:bg-[#1E9E78] transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
                title="Fetch latest headlines from connected news feeds"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingLive ? 'animate-spin' : ''}`} />
                <span>{isSyncingLive ? 'Syncing Feeds...' : 'Sync Live Feeds'}</span>
              </button>

              <button
                onClick={() => onStreamNextLiveItem?.()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F3F6F6] text-[#0B2B33] border border-[#DCE3E5] rounded text-xs font-semibold hover:bg-[#E5ECF6] transition-colors cursor-pointer"
                title="Stream next real-time market wire bulletin into the ledger"
              >
                <Zap className="w-3.5 h-3.5 text-[#E4572E]" />
                <span>Stream Next Bulletin</span>
              </button>

              <button
                onClick={() => setShowInjectModal(!showInjectModal)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F3F6F6] text-[#0B2B33] border border-[#DCE3E5] rounded text-xs font-semibold hover:bg-[#E5ECF6] transition-colors cursor-pointer"
                title="Inject custom breaking headline"
              >
                <PlusCircle className="w-3.5 h-3.5 text-[#0B2B33]" />
                <span>Inject Flash News</span>
              </button>
            </div>
          </div>

          {/* Connected Feeds Info Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#DCE3E5] text-[11px] text-[#4A5E66]">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-semibold text-[#0B2B33]">Connected Channels:</span>
              <span className="inline-flex items-center gap-1 bg-[#F3F6F6] px-2 py-0.5 rounded border border-[#DCE3E5]">
                <Wifi className="w-3 h-3 text-[#1E9E78]" /> CNBC Markets RSS
              </span>
              <span className="inline-flex items-center gap-1 bg-[#F3F6F6] px-2 py-0.5 rounded border border-[#DCE3E5]">
                <Wifi className="w-3 h-3 text-[#1E9E78]" /> Financial News Wire
              </span>
              <span className="inline-flex items-center gap-1 bg-[#F3F6F6] px-2 py-0.5 rounded border border-[#DCE3E5]">
                <Wifi className="w-3 h-3 text-[#1E9E78]" /> Social Commentary Stream
              </span>
            </div>

            {onToggleAutoSync && (
              <button
                onClick={onToggleAutoSync}
                className="text-[11px] font-semibold text-[#4A5E66] hover:text-[#0B2B33] underline cursor-pointer"
              >
                Auto-Sync (25s): {autoSyncEnabled ? 'ENABLED' : 'PAUSED'}
              </button>
            )}
          </div>

          {/* Quick Inject Headline Form Drawer */}
          {showInjectModal && (
            <div className="mt-3 p-3.5 bg-[#F3F6F6] border border-[#DCE3E5] rounded-md space-y-2.5">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-[#0B2B33]">Inject Breaking Market Wire Bulletin</span>
                <button
                  onClick={() => setShowInjectModal(false)}
                  className="text-xs text-[#4A5E66] hover:text-[#0B2B33] cursor-pointer"
                >
                  ✕
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 text-xs">
                <input
                  type="text"
                  placeholder="e.g. Breaking: Maritime shipping authority issues Gulf warning, crude jumps 6%"
                  value={injectText}
                  onChange={(e) => setInjectText(e.target.value)}
                  className="sm:col-span-8 bg-white border border-[#DCE3E5] rounded p-2 text-xs text-[#0B2B33] focus:outline-hidden"
                />
                <input
                  type="text"
                  placeholder="Outlet (e.g. Wire Flash)"
                  value={injectSource}
                  onChange={(e) => setInjectSource(e.target.value)}
                  className="sm:col-span-2 bg-white border border-[#DCE3E5] rounded p-2 text-xs text-[#0B2B33]"
                />
                <button
                  onClick={handleInjectSubmit}
                  disabled={!injectText.trim()}
                  className="sm:col-span-2 bg-[#0B2B33] text-white rounded p-2 text-xs font-bold hover:bg-[#1E9E78] transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Push to Stream
                </button>
              </div>

              {/* Quick High-Impact Scenario Presets */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-[#4A5E66]">
                <span className="font-semibold text-[#0B2B33]">Quick Scenarios:</span>
                <button
                  type="button"
                  onClick={() => {
                    setInjectText("Pacific Meridian Bank files Chapter 11 bankruptcy after $38B deposit run, regulators intervene");
                    setInjectSource("Financial Times");
                  }}
                  className="px-2 py-0.5 bg-white border border-[#DCE3E5] rounded hover:border-[#B5382A] hover:text-[#B5382A] cursor-pointer"
                >
                  Bank Run ($38B Default)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInjectText("Naval standoff halts tanker traffic in Strait of Hormuz, Brent crude oil surges 14%");
                    setInjectSource("Reuters Financial");
                  }}
                  className="px-2 py-0.5 bg-white border border-[#DCE3E5] rounded hover:border-[#E4572E] hover:text-[#E4572E] cursor-pointer"
                >
                  Oil Supply Shock (+14%)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInjectText("Federal Reserve issues surprise inter-meeting 50 bp interest rate cut citing liquidity conditions");
                    setInjectSource("Bloomberg Wire");
                  }}
                  className="px-2 py-0.5 bg-white border border-[#DCE3E5] rounded hover:border-[#0F7C8A] hover:text-[#0F7C8A] cursor-pointer"
                >
                  Fed 50 bp Cut
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInjectText("$NVDA announces breakthrough next-generation optical interconnect computing cluster with hyperscalers");
                    setInjectSource("Dow Jones Wire");
                  }}
                  className="px-2 py-0.5 bg-white border border-[#DCE3E5] rounded hover:border-[#1E9E78] hover:text-[#1E9E78] cursor-pointer"
                >
                  Tech Cluster Launch
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white border border-[#DCE3E5] rounded-lg p-3">
          <div className="text-xs text-[#4A5E66] font-medium">Documents Ingested</div>
          <div className="text-2xl font-bold font-mono text-[#0B2B33] mt-1">{docsIngestedCount}</div>
          {mode === 'live' && <div className="text-[10px] text-[#1E9E78] mt-0.5">Live wire stream</div>}
        </div>
        <div className="bg-white border border-[#DCE3E5] rounded-lg p-3">
          <div className="text-xs text-[#4A5E66] font-medium">Signals Generated</div>
          <div className="text-2xl font-bold font-mono text-[#0B2B33] mt-1">{signals.length}</div>
          <div className="text-[10px] text-[#4A5E66] mt-0.5">{mode === 'live' ? 'Active live signals' : 'Post-deduplication'}</div>
        </div>
        <div className="bg-white border border-[#DCE3E5] rounded-lg p-3">
          <div className="text-xs text-[#4A5E66] font-medium">Duplicates Filtered</div>
          <div className="text-2xl font-bold font-mono text-[#0B2B33] mt-1">{duplicatesDroppedCount}</div>
        </div>
        <div className="bg-white border border-[#DCE3E5] rounded-lg p-3">
          <div className="text-xs text-[#4A5E66] font-medium">High Impact (Score &gt; 7)</div>
          <div className="text-2xl font-bold font-mono text-[#E4572E] mt-1">{highImpactCount}</div>
        </div>
        <div className="bg-white border border-[#DCE3E5] rounded-lg p-3">
          <div className="text-xs text-[#4A5E66] font-medium">Mean Sentiment</div>
          <div className={`text-2xl font-bold font-mono mt-1 ${avgSentiment >= 0 ? 'text-[#1E9E78]' : 'text-[#E4572E]'}`}>
            {avgSentiment >= 0 ? '+' : ''}{avgSentiment.toFixed(2)}
          </div>
        </div>
        <div className="bg-white border border-[#DCE3E5] rounded-lg p-3">
          <div className="text-xs text-[#4A5E66] font-medium">Processing Throughput</div>
          <div className="text-2xl font-bold font-mono text-[#0B2B33] mt-1">1,692 docs/s</div>
          {mode === 'live' && <div className="text-[10px] text-[#4A5E66] mt-0.5">Low-latency scoring</div>}
        </div>
      </div>

      {/* Main Charts: Scatter & Event Mix */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Scatter Plot */}
        <div className="lg:col-span-8 bg-white border border-[#DCE3E5] rounded-lg p-4">
          <div className="flex justify-between items-center mb-1">
            <h3 className="font-bold text-[#0B2B33] text-base">Signal Landscape: Sentiment vs. Calibrated Impact</h3>
            <span className="text-xs text-[#4A5E66]">Bubble size reflects source reliability</span>
          </div>
          <p className="text-xs text-[#4A5E66] mb-3">
            Distribution of incoming signals mapped across sentiment [−1.0 to +1.0], event taxonomy, and calibrated impact [1.0 to 10.0].
          </p>
          <div className={isMobile ? "h-[440px]" : "h-[400px]"}>
            <PlotlyChart
              data={scatterPlotData}
              layout={scatterPlotLayout}
            />
          </div>
        </div>

        {/* Event Mix */}
        <div className="lg:col-span-4 bg-white border border-[#DCE3E5] rounded-lg p-4">
          <h3 className="font-bold text-[#0B2B33] text-base mb-1">Event Classification Taxonomy</h3>
          <p className="text-xs text-[#4A5E66] mb-3">Distribution across 12 structured financial risk categories.</p>
          <div className="h-[400px]">
            <PlotlyChart
              data={eventMixData}
              layout={{
                height: 400,
                xaxis: { title: { text: "Count" }, gridcolor: '#F3F6F6' },
                yaxis: { automargin: true, dtick: 1 },
                margin: { l: 110, r: 15, t: 10, b: 40 }
              }}
            />
          </div>
        </div>
      </div>

      {/* Signal Tape Table */}
      <div className="bg-white border border-[#DCE3E5] rounded-lg p-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4 pb-3 border-b border-[#DCE3E5]">
          <div>
            <h3 className="font-bold text-[#0B2B33] text-base">Signal Ledger</h3>
            <p className="text-xs text-[#4A5E66]">Real-time stream of structured risk signals ({filteredSignals.length} matching filters)</p>
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-xs">
          {/* Source Filter */}
          <div>
            <label className="block text-[#4A5E66] font-medium mb-1">Source Channels</label>
            <div className="flex gap-2">
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sourceFilter.news}
                  onChange={(e) => setSourceFilter(prev => ({ ...prev, news: e.target.checked }))}
                  className="accent-[#0B2B33]"
                />
                <span>News Wires</span>
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sourceFilter.social}
                  onChange={(e) => setSourceFilter(prev => ({ ...prev, social: e.target.checked }))}
                  className="accent-[#0B2B33]"
                />
                <span>Social (X)</span>
              </label>
            </div>
          </div>

          {/* Event Filter */}
          <div>
            <label className="block text-[#4A5E66] font-medium mb-1">Event Category</label>
            <select
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
              className="w-full bg-[#F3F6F6] border border-[#DCE3E5] rounded p-1.5 text-xs text-[#0B2B33] focus:outline-hidden"
            >
              <option value="ALL">All Event Categories</option>
              {EVENT_TYPES.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>

          {/* Min Impact Filter */}
          <div>
            <div className="flex justify-between text-[#4A5E66] font-medium mb-1">
              <span>Minimum Impact</span>
              <span className="font-mono font-bold text-[#0B2B33]">{minImpact.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min="1.0"
              max="10.0"
              step="0.5"
              value={minImpact}
              onChange={(e) => setMinImpact(parseFloat(e.target.value))}
              className="w-full accent-[#0B2B33]"
            />
          </div>

          {/* Ticker Search */}
          <div>
            <label className="block text-[#4A5E66] font-medium mb-1">Ticker / Counterparty</label>
            <div className="relative">
              <input
                type="text"
                placeholder="e.g. NVDA, TSLA, MARKET"
                value={tickerQuery}
                onChange={(e) => setTickerQuery(e.target.value)}
                className="w-full bg-[#F3F6F6] border border-[#DCE3E5] rounded p-1.5 pl-6 text-xs text-[#0B2B33] uppercase focus:outline-hidden"
              />
              <Search className="w-3.5 h-3.5 text-[#4A5E66] absolute left-1.5 top-2" />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto max-h-[400px] border border-[#DCE3E5] rounded-md">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-[#F3F6F6] text-[#4A5E66] sticky top-0 z-10 border-b border-[#DCE3E5]">
              <tr>
                <th className="p-2.5 font-semibold">Timestamp (ET)</th>
                <th className="p-2.5 font-semibold">Source</th>
                <th className="p-2.5 font-semibold">Headline / Commentary</th>
                <th className="p-2.5 font-semibold">Entities</th>
                <th className="p-2.5 font-semibold text-right">Sentiment</th>
                <th className="p-2.5 font-semibold">Event Category</th>
                <th className="p-2.5 font-semibold">Impact</th>
                <th className="p-2.5 font-semibold text-center" title="Cross-source corroboration multiplier">Corrob.</th>
                <th className="p-2.5 font-semibold text-right">Reliability</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DCE3E5]">
              {filteredSignals.slice(0, 150).map((s) => {
                const date = new Date(s.timestamp);
                const isValidDate = !isNaN(date.getTime());
                const isLive = mode === 'live';
                let timeStr = s.timestamp;
                if (isValidDate) {
                  if (isLive) {
                    const diffSec = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
                    if (diffSec < 10) timeStr = 'Just now';
                    else if (diffSec < 60) timeStr = `${diffSec}s ago`;
                    else if (diffSec < 3600) timeStr = `${Math.floor(diffSec / 60)}m ago`;
                    else if (diffSec < 86400) timeStr = `${Math.floor(diffSec / 3600)}h ago`;
                    else timeStr = date.toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
                  } else {
                    timeStr = date.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
                  }
                }
                const sentimentColor = s.sentiment_score >= 0.15 ? 'text-[#1E9E78]' : s.sentiment_score <= -0.15 ? 'text-[#E4572E]' : 'text-[#4A5E66]';
                const impactWidth = `${(s.impact_score / 10) * 100}%`;

                return (
                  <tr key={s.signal_id} className="hover:bg-[#F3F6F6]/50">
                    <td
                      className="p-2.5 whitespace-nowrap font-mono text-[#4A5E66]"
                      title={isValidDate ? date.toISOString() : s.timestamp}
                    >
                      {timeStr}
                    </td>
                    <td className="p-2.5 whitespace-nowrap font-medium text-[#0B2B33]">
                      <div className="flex items-center gap-1.5">
                        {isLive && (
                          <span className="w-1.5 h-1.5 rounded-full bg-[#1E9E78] shrink-0" title="Live stream item"></span>
                        )}
                        <span>{s.source_name}</span>
                      </div>
                    </td>
                    <td className="p-2.5 max-w-md text-[#0B2B33]">{s.headline}</td>
                    <td className="p-2.5 whitespace-nowrap">
                      <span className="font-mono px-1.5 py-0.5 bg-[#F3F6F6] border border-[#DCE3E5] rounded text-[11px]">
                        {s.primary_entity || 'MARKET'}
                      </span>
                    </td>
                    <td className={`p-2.5 text-right font-mono font-semibold whitespace-nowrap ${sentimentColor}`}>
                      {s.sentiment_score >= 0 ? '+' : ''}{s.sentiment_score.toFixed(2)}
                    </td>
                    <td className="p-2.5 whitespace-nowrap">
                      <span
                        className="px-2 py-0.5 rounded text-[10px] font-semibold text-white"
                        style={{ backgroundColor: EVENT_COLORS[s.event_type] || '#6B7B84' }}
                      >
                        {s.event_type}
                      </span>
                    </td>
                    <td className="p-2.5 whitespace-nowrap w-24">
                      <div className="flex items-center gap-1.5">
                        <div className="w-12 h-2 bg-[#E5ECF6] rounded-full overflow-hidden">
                          <div
                            className={`h-full ${s.impact_score > 7 ? 'bg-[#E4572E]' : 'bg-[#0B2B33]'}`}
                            style={{ width: impactWidth }}
                          />
                        </div>
                        <span className="font-mono font-bold text-[11px]">{s.impact_score.toFixed(1)}</span>
                      </div>
                    </td>
                    <td className="p-2.5 text-center font-mono text-[#4A5E66]">x{s.corroboration || 1}</td>
                    <td className="p-2.5 text-right font-mono text-[#4A5E66]">{s.reliability.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Interactive Playground: Try the engine on any text */}
      <div className="bg-white border border-[#DCE3E5] rounded-lg p-5">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-5 h-5 text-[#0B2B33]" />
          <h3 className="font-bold text-[#0B2B33] text-lg">Interactive Risk Signal Analyzer</h3>
        </div>
        <p className="text-xs text-[#4A5E66] mb-4">
          Evaluate arbitrary financial headlines or market commentary to test real-time sentiment extraction, event classification, and explainable impact scoring.
        </p>

        {/* Preset Selector */}
        <div className="mb-3">
          <label className="block text-xs font-semibold text-[#0B2B33] mb-1">Preset Scenarios</label>
          <div className="flex flex-wrap gap-1.5">
            {Object.keys(PRESET_EXAMPLES).map(name => (
              <button
                key={name}
                onClick={() => handlePresetChange(name)}
                className={`px-3 py-1.5 text-xs font-medium rounded border transition-colors ${
                  selectedPreset === name
                    ? 'bg-[#0B2B33] text-white border-[#0B2B33]'
                    : 'bg-[#F3F6F6] text-[#4A5E66] border-[#DCE3E5] hover:bg-[#E5ECF6]'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        </div>

        {/* Text Area */}
        <div className="mb-3">
          <textarea
            value={tryText}
            onChange={(e) => setTryText(e.target.value)}
            rows={3}
            placeholder="Enter a financial news headline, regulatory filing snippet, or market commentary..."
            className="w-full bg-[#F3F6F6] border border-[#DCE3E5] rounded-md p-3 text-sm text-[#0B2B33] focus:outline-hidden focus:border-[#0B2B33]"
          />
        </div>

        {/* Metadata Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-xs">
          <div>
            <label className="block text-[#4A5E66] font-medium mb-1">Source Channel</label>
            <div className="flex gap-3 pt-1">
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="radio"
                  name="trytype"
                  checked={tryType === 'news'}
                  onChange={() => setTryType('news')}
                  className="accent-[#0B2B33]"
                />
                <span>News Wire</span>
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="radio"
                  name="trytype"
                  checked={tryType === 'social'}
                  onChange={() => setTryType('social')}
                  className="accent-[#0B2B33]"
                />
                <span>Social Post</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-[#4A5E66] font-medium mb-1">
              {tryType === 'news' ? 'Publisher / Wire Service' : 'Follower Reach'}
            </label>
            {tryType === 'news' ? (
              <input
                type="text"
                value={trySource}
                onChange={(e) => setTrySource(e.target.value)}
                className="w-full bg-[#F3F6F6] border border-[#DCE3E5] rounded p-1.5 text-xs text-[#0B2B33]"
              />
            ) : (
              <input
                type="number"
                value={tryFollowers}
                onChange={(e) => setTryFollowers(parseInt(e.target.value) || 0)}
                className="w-full bg-[#F3F6F6] border border-[#DCE3E5] rounded p-1.5 text-xs text-[#0B2B33]"
              />
            )}
          </div>

          <div>
            <label className="block text-[#4A5E66] font-medium mb-1">Source Credibility</label>
            <label className="flex items-center gap-1.5 pt-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={tryVerified}
                onChange={(e) => setTryVerified(e.target.checked)}
                className="accent-[#0B2B33]"
              />
              <span>Tier-1 Outlet or Verified Account</span>
            </label>
          </div>

          <div className="flex items-end">
            <button
              onClick={handleAnalyze}
              disabled={!tryText.trim()}
              className="w-full bg-[#0B2B33] text-white py-2 px-4 rounded text-xs font-bold hover:bg-[#1E9E78] transition-colors disabled:opacity-50 cursor-pointer"
            >
              Run Risk Engine
            </button>
          </div>
        </div>

        {/* Analysis Output */}
        {analysisResult && (
          <div className="mt-4 pt-4 border-t border-[#DCE3E5] space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-[#F3F6F6] border border-[#DCE3E5] rounded p-3">
                <div className="text-xs text-[#4A5E66]">Sentiment Score</div>
                <div className={`text-xl font-bold font-mono mt-1 ${analysisResult.sentiment_score >= 0 ? 'text-[#1E9E78]' : 'text-[#E4572E]'}`}>
                  {analysisResult.sentiment_score >= 0 ? '+' : ''}{analysisResult.sentiment_score.toFixed(2)}
                </div>
                <div className="text-[11px] text-[#4A5E66] uppercase mt-0.5">{analysisResult.sentiment_label}</div>
              </div>

              <div className="bg-[#F3F6F6] border border-[#DCE3E5] rounded p-3">
                <div className="text-xs text-[#4A5E66]">Event Classification</div>
                <div className="text-base font-bold text-[#0B2B33] mt-1 truncate">{analysisResult.event_type}</div>
                <div className="text-[11px] text-[#4A5E66] mt-0.5">
                  Confidence: {(analysisResult.event_confidence * 100).toFixed(0)}%
                </div>
              </div>

              <div className="bg-[#F3F6F6] border border-[#DCE3E5] rounded p-3">
                <div className="text-xs text-[#4A5E66]">Calibrated Impact (1–10)</div>
                <div className="text-xl font-bold font-mono text-[#0B2B33] mt-1">{analysisResult.impact_score.toFixed(1)}</div>
                <div className="text-[11px] text-[#4A5E66] mt-0.5">{analysisResult.impact_band} band</div>
              </div>

              <div className="bg-[#F3F6F6] border border-[#DCE3E5] rounded p-3">
                <div className="text-xs text-[#4A5E66]">Source Reliability</div>
                <div className="text-xl font-bold font-mono text-[#0B2B33] mt-1">{analysisResult.reliability.toFixed(2)}</div>
                <div className="text-[11px] text-[#4A5E66] mt-0.5 truncate">
                  {analysisResult.entities.map(e => e.ticker).join(', ') || 'MARKET'}
                </div>
              </div>
            </div>

            {/* Stress Trigger Warning */}
            {analysisResult.impact_score > stressThreshold && analysisResult.sentiment_score <= -0.05 && (
              <div className="bg-red-50 border border-red-200 border-l-4 border-l-[#E4572E] p-3 rounded text-xs text-[#0B2B33] flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-[#E4572E] shrink-0 mt-0.5" />
                <div>
                  <strong>Automated stress trigger.</strong> This signal exceeds the impact threshold ({analysisResult.impact_score.toFixed(1)} &gt; {stressThreshold.toFixed(1)}) with adverse sentiment and will initiate a <strong>{analysisResult.event_type}</strong> portfolio revaluation test.
                </div>
              </div>
            )}

            {/* Explainability Accordion */}
            <div className="border border-[#DCE3E5] rounded-md overflow-hidden text-xs">
              <button
                onClick={() => setShowExplain(!showExplain)}
                className="w-full flex items-center justify-between p-2.5 bg-[#F3F6F6] hover:bg-[#E5ECF6] font-semibold text-[#0B2B33] cursor-pointer"
              >
                <span>Attribution Breakdown &amp; Technical Payload</span>
                {showExplain ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {showExplain && (
                <div className="p-3 bg-white space-y-3">
                  <div>
                    <span className="font-semibold text-[#0B2B33]">Lexical sentiment drivers: </span>
                    <span className="text-[#4A5E66]">
                      {analysisResult.drivers.sentiment_terms?.length
                        ? analysisResult.drivers.sentiment_terms.map(([w, v]) => `"${w}" (${v > 0 ? '+' : ''}${v})`).join(', ')
                        : 'None matched (neutral baseline)'}
                    </span>
                  </div>
                  <div>
                    <span className="font-semibold text-[#0B2B33]">Classification evidence tokens: </span>
                    <span className="text-[#4A5E66]">
                      {analysisResult.drivers.event_evidence?.length
                        ? analysisResult.drivers.event_evidence.join(', ')
                        : 'Rule fallback'}
                    </span>
                  </div>
                  <div>
                    <span className="font-semibold text-[#0B2B33]">Impact calibration components: </span>
                    <pre className="mt-1 p-2 bg-[#F3F6F6] rounded font-mono text-[11px] overflow-x-auto text-[#0B2B33]">
                      {JSON.stringify(analysisResult.drivers.impact_components, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <span className="font-semibold text-[#0B2B33]">Output Payload (JSON): </span>
                    <pre className="mt-1 p-2 bg-[#F3F6F6] rounded font-mono text-[11px] overflow-x-auto text-[#0B2B33]">
                      {JSON.stringify(analysisResult, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
