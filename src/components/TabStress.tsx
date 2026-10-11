import React, { useState, useMemo } from 'react';
import { PlotlyChart } from './PlotlyChart';
import { runStressScenario, getScenarioList, StressResult } from '../services/stressService';
import { AlertTriangle, ShieldCheck, Zap, Sliders, Radio } from 'lucide-react';
import dataset from '../data/dataset.json';
import { RiskSignal } from '../services/nlpEngine';

interface TabStressProps {
  stressThreshold: number;
  appMode?: 'replay' | 'live';
  signals?: RiskSignal[];
}

export const TabStress: React.FC<TabStressProps> = ({ stressThreshold, appMode = 'replay', signals }) => {
  const replayStressResults = dataset.stressResults as any[];
  const scenarioEventTypes = getScenarioList();

  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const [selectedAutoIdx, setSelectedAutoIdx] = useState<number>(0);

  // Manual What-If parameters
  const [manualEvent, setManualEvent] = useState<string>('Credit Event');
  const [manualImpact, setManualImpact] = useState<number>(8.5);

  // Generate dynamic stress runs from incoming live signals that breach threshold
  const liveStressRuns = useMemo(() => {
    if (appMode !== 'live' || !signals || signals.length === 0) return [];
    const validScenarios = getScenarioList();
    // Filter signals with high impact
    const highSignals = signals.filter(s => s.impact_score >= stressThreshold);
    return highSignals.map(s => {
      // Map event type or fallback
      const scenarioKey = validScenarios.includes(s.event_type) ? s.event_type : 'Credit Event';
      const result = runStressScenario(scenarioKey, s.impact_score);
      return {
        run_id: s.signal_id,
        trigger_time: s.timestamp,
        headline: s.headline,
        source: s.source_name,
        source_name: s.source_name,
        event_type: s.event_type || 'Credit Event',
        impact_score: s.impact_score,
        sentiment_score: s.sentiment_score,
        pnl: result.pnl,
        result,
        is_live: true,
      };
    });
  }, [appMode, signals, stressThreshold]);

  // Combined or mode-selected stress results for timeline
  const activeStressResults = useMemo(() => {
    if (appMode === 'live') {
      return liveStressRuns.length > 0 ? liveStressRuns : replayStressResults;
    }
    return replayStressResults;
  }, [appMode, liveStressRuns, replayStressResults]);

  // Available auto-triggered runs filtered by threshold
  const activeAutoRuns = useMemo(() => {
    if (appMode === 'live' && liveStressRuns.length > 0) {
      return liveStressRuns;
    }
    return replayStressResults.filter(r => r.impact_score >= stressThreshold);
  }, [appMode, liveStressRuns, replayStressResults, stressThreshold]);

  // Current active result
  const currentResult: StressResult | null = useMemo(() => {
    if (mode === 'auto') {
      if (!activeAutoRuns.length) return null;
      const run = activeAutoRuns[selectedAutoIdx] || activeAutoRuns[0];
      return run.result as StressResult;
    } else {
      return runStressScenario(manualEvent, manualImpact);
    }
  }, [mode, activeAutoRuns, selectedAutoIdx, manualEvent, manualImpact]);

  // Current auto run metadata
  const currentAutoRun = mode === 'auto' && activeAutoRuns.length ? (activeAutoRuns[selectedAutoIdx] || activeAutoRuns[0]) : null;

  // Timeline / Runs chart
  const runsChartData = useMemo(() => {
    if (!activeStressResults.length) return [];
    const times = activeStressResults.map(r => {
      const d = new Date(r.trigger_time);
      if (isNaN(d.getTime())) return r.trigger_time;
      return appMode === 'live'
        ? d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
        : d.toLocaleDateString('en-US', { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
    });

    return [{
      type: 'scatter',
      mode: 'lines+markers',
      x: times,
      y: activeStressResults.map(r => r.pnl),
      text: activeStressResults.map(r => `${r.event_type}<br>${r.headline}<br>P&L: ${r.pnl >= 0 ? '+' : ''}${r.pnl.toFixed(1)}M`),
      marker: {
        size: activeStressResults.map(r => r.impact_score * 2.2),
        color: activeStressResults.map(r => r.impact_score >= stressThreshold ? '#E4572E' : '#9DB0B8'),
      },
      line: { color: '#0B2B33', width: 1.5, dash: 'dot' },
      hovertemplate: '<b>%{text}</b><extra></extra>'
    }];
  }, [activeStressResults, stressThreshold, appMode]);

  // Factor Attribution Waterfall Data
  const waterfallData = useMemo(() => {
    if (!currentResult) return [];
    const rf = currentResult.by_risk_factor;
    const factors = ["Rates", "Credit spreads", "Credit losses (PD)", "Equity", "FX"];
    const values = factors.map(f => rf[f] || 0);

    return [{
      type: 'waterfall',
      orientation: 'v',
      measure: [...factors.map(() => 'relative'), 'total'],
      x: [...factors, 'Total P&L'],
      y: [...values, currentResult.pnl],
      connector: { line: { color: '#DCE3E5' } },
      decreasing: { marker: { color: '#E4572E' } },
      increasing: { marker: { color: '#1E9E78' } },
      totals: { marker: { color: '#0B2B33' } },
      hovertemplate: '<b>%{x}</b>: %{y:+,.1f}M<extra></extra>'
    }];
  }, [currentResult]);

  // Asset class breakdown
  const assetClassData = useMemo(() => {
    if (!currentResult) return [];
    return [{
      type: 'bar',
      x: currentResult.by_asset_class.map(d => d.asset_class),
      y: currentResult.by_asset_class.map(d => d.pnl),
      marker: {
        color: currentResult.by_asset_class.map(d => d.pnl >= 0 ? '#1E9E78' : '#E4572E')
      },
      hovertemplate: '%{x}: %{y:+.1f}M<extra></extra>'
    }];
  }, [currentResult]);

  // Sector breakdown
  const sectorData = useMemo(() => {
    if (!currentResult) return [];
    return [{
      type: 'bar',
      orientation: 'h',
      x: currentResult.by_sector.map(d => d.pnl),
      y: currentResult.by_sector.map(d => d.sector),
      marker: {
        color: currentResult.by_sector.map(d => d.pnl >= 0 ? '#1E9E78' : '#E4572E')
      },
      hovertemplate: '%{y}: %{x:+.1f}M<extra></extra>'
    }];
  }, [currentResult]);

  return (
    <div className="space-y-6">
      {/* Story card */}
      <div className="bg-white border border-[#DCE3E5] border-l-4 border-l-[#E4572E] p-4 rounded-lg text-sm text-[#0B2B33] leading-relaxed">
        <strong>Stress Framework.</strong> Adverse signals with calibrated impact scores exceeding <strong>{stressThreshold.toFixed(1)}</strong> automatically
        trigger scenario revaluations. Each event classification activates calibrated multi-factor shock vectors (equities, benchmark curves, credit spreads,
        default probabilities, and foreign exchange) scaled by severity (Impact / 10). The entire wholesale banking book (corporate loans, fixed income,
        equity holdings, interest rate swaps, CDS, and FX forwards) is simultaneously repriced.
      </div>

      {/* Auto-triggered stress runs timeline */}
      <div className="bg-white border border-[#DCE3E5] rounded-lg p-4">
        <div className="flex justify-between items-center mb-2">
          <h3 className="font-bold text-[#0B2B33] text-base">Event-Triggered Stress Simulation Runs</h3>
          <span className="text-xs text-[#4A5E66]">Bubble size scales with signal impact score</span>
        </div>
        <div className="h-[220px]">
          <PlotlyChart
            data={runsChartData}
            layout={{
              height: 220,
              xaxis: { title: { text: "Time of Trigger" }, showgrid: false },
              yaxis: { title: { text: "Estimated P&L ($M)" }, zeroline: true, zerolinecolor: '#0B2B33', gridcolor: '#F3F6F6' },
              margin: { l: 50, r: 20, t: 10, b: 40 }
            }}
          />
        </div>
      </div>

      {/* Scenario Selector & Controls */}
      <div className="bg-white border border-[#DCE3E5] rounded-lg p-5">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 pb-3 border-b border-[#DCE3E5]">
          <div>
            <h3 className="font-bold text-[#0B2B33] text-lg">Scenario Stress Inspection</h3>
            <p className="text-xs text-[#4A5E66]">Review automated event-driven shock runs or construct custom what-if stress simulations</p>
          </div>

          {/* Mode Switcher */}
          <div className="flex bg-[#F3F6F6] p-1 rounded-md border border-[#DCE3E5]">
            <button
              onClick={() => setMode('auto')}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors cursor-pointer ${
                mode === 'auto'
                  ? 'bg-white text-[#0B2B33] shadow-xs'
                  : 'text-[#4A5E66] hover:text-[#0B2B33]'
              }`}
            >
              Automated Triggers ({activeAutoRuns.length})
            </button>
            <button
              onClick={() => setMode('manual')}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors cursor-pointer ${
                mode === 'manual'
                  ? 'bg-white text-[#0B2B33] shadow-xs'
                  : 'text-[#4A5E66] hover:text-[#0B2B33]'
              }`}
            >
              Custom What-If Scenario
            </button>
          </div>
        </div>

        {/* Mode Specific Controls */}
        {mode === 'auto' ? (
          <div className="space-y-3">
            {activeAutoRuns.length === 0 ? (
              <div className="p-4 bg-[#F3F6F6] border border-[#DCE3E5] rounded text-xs text-[#4A5E66] space-y-1">
                <div className="font-semibold text-[#0B2B33]">
                  {appMode === 'live' ? 'Live Ingestion Monitoring Active' : 'No Automated Breaches'}
                </div>
                <p>
                  {appMode === 'live'
                    ? `No incoming market documents currently breach the automated trigger threshold (${stressThreshold.toFixed(1)}). Stream bulletins or inject a breaking headline (e.g. Bank Run $38B Default) from the Risk Signals tab to evaluate real-time wholesale book revaluations.`
                    : `No recorded signals breached the automated trigger threshold (${stressThreshold.toFixed(1)}). Adjust the trigger sensitivity in the parameters panel.`}
                </p>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-[#0B2B33] mb-1">Select Trigger Event</label>
                <select
                  value={selectedAutoIdx}
                  onChange={(e) => setSelectedAutoIdx(parseInt(e.target.value))}
                  className="w-full bg-[#F3F6F6] border border-[#DCE3E5] rounded p-2 text-sm text-[#0B2B33]"
                >
                  {activeAutoRuns.map((r, i) => {
                    const d = new Date(r.trigger_time);
                    const timeStr = !isNaN(d.getTime())
                      ? (r.is_live
                          ? d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
                          : d.toLocaleDateString('en-US', { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }))
                      : r.trigger_time;
                    return (
                      <option key={i} value={i}>
                        {r.is_live ? '⚡ [LIVE] ' : ''}{timeStr} · {r.event_type} · impact {r.impact_score.toFixed(1)} (P&L: {r.pnl >= 0 ? '+' : ''}{r.pnl.toFixed(1)}M)
                      </option>
                    );
                  })}
                </select>

                {currentAutoRun && (
                  <div className="mt-3 p-3 bg-[#F3F6F6] border border-[#DCE3E5] rounded text-xs">
                    <div className="flex items-center gap-2 mb-1">
                      {currentAutoRun.is_live && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-[#1E9E78]">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#1E9E78] animate-pulse"></span>
                          LIVE FEED CATALYST
                        </span>
                      )}
                      <span className="font-semibold text-[#0B2B33]">Catalyst headline</span>
                    </div>
                    <span className="text-[#0B2B33] font-medium">{currentAutoRun.headline}</span>
                    <div className="text-[#4A5E66] mt-1.5">
                      Source: <strong>{currentAutoRun.source_name || currentAutoRun.source || 'Live Wire'}</strong>
                      {currentAutoRun.sentiment_score !== undefined && (
                        <span> · Sentiment: <strong>{currentAutoRun.sentiment_score >= 0 ? '+' : ''}{currentAutoRun.sentiment_score.toFixed(2)}</strong></span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#0B2B33] mb-1">Stress Event Archetype</label>
              <select
                value={manualEvent}
                onChange={(e) => setManualEvent(e.target.value)}
                className="w-full bg-[#F3F6F6] border border-[#DCE3E5] rounded p-2 text-sm text-[#0B2B33]"
              >
                {scenarioEventTypes.map(ev => (
                  <option key={ev} value={ev}>{ev}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="flex justify-between text-xs font-semibold text-[#0B2B33] mb-1">
                <span>Scenario Severity (Impact Score 1.0–10.0)</span>
                <span className="font-mono text-sm text-[#E4572E]">{manualImpact.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min="1.0"
                max="10.0"
                step="0.1"
                value={manualImpact}
                onChange={(e) => setManualImpact(parseFloat(e.target.value))}
                className="w-full accent-[#E4572E] cursor-pointer mt-2"
              />
            </div>
          </div>
        )}

        {/* Results view if available */}
        {currentResult && (
          <div className="mt-6 space-y-5">
            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-[#F3F6F6] border border-[#DCE3E5] rounded p-3">
                <div className="text-xs text-[#4A5E66]">Pre-Stress Book Value</div>
                <div className="text-xl font-bold font-mono text-[#0B2B33] mt-1">
                  ${currentResult.value_before.toLocaleString(undefined, { maximumFractionDigits: 1 })}M
                </div>
              </div>
              <div className="bg-[#F3F6F6] border border-[#DCE3E5] rounded p-3">
                <div className="text-xs text-[#4A5E66]">Post-Stress Book Value</div>
                <div className="text-xl font-bold font-mono text-[#0B2B33] mt-1">
                  ${currentResult.value_after.toLocaleString(undefined, { maximumFractionDigits: 1 })}M
                </div>
                <div className="text-xs font-mono font-bold text-[#E4572E] mt-0.5">
                  {currentResult.pnl >= 0 ? '+' : ''}{currentResult.pnl.toFixed(1)}M
                </div>
              </div>
              <div className="bg-[#F3F6F6] border border-[#DCE3E5] rounded p-3">
                <div className="text-xs text-[#4A5E66]">Simulated Net P&amp;L</div>
                <div className={`text-xl font-bold font-mono mt-1 ${currentResult.pnl_pct >= 0 ? 'text-[#1E9E78]' : 'text-[#E4572E]'}`}>
                  {(currentResult.pnl_pct * 100).toFixed(2)}%
                </div>
              </div>
              <div className="bg-[#F3F6F6] border border-[#DCE3E5] rounded p-3">
                <div className="text-xs text-[#4A5E66]">Loan Expected Loss (EL)</div>
                <div className="text-xl font-bold font-mono text-[#E4572E] mt-1">
                  ${currentResult.expected_loss_after.toFixed(1)}M
                </div>
                <div className="text-[11px] text-[#4A5E66] mt-0.5">
                  Δ Expected Loss: +{(currentResult.expected_loss_after - currentResult.expected_loss_before).toFixed(1)}M vs ${currentResult.expected_loss_before.toFixed(1)}M
                </div>
              </div>
            </div>

            {/* Narrative Note */}
            <div className="bg-red-50 border border-red-200 border-l-4 border-l-[#E4572E] p-3.5 rounded text-xs text-[#0B2B33] leading-relaxed">
              {currentResult.narrative}
            </div>

            {/* Waterfall and Shocks Applied */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Waterfall */}
              <div className="lg:col-span-7 bg-[#F3F6F6] border border-[#DCE3E5] rounded-lg p-3">
                <h4 className="font-bold text-[#0B2B33] text-xs uppercase tracking-wider mb-2">
                  Risk Factor P&amp;L Attribution ($M)
                </h4>
                <div className="h-[300px]">
                  <PlotlyChart
                    data={waterfallData}
                    layout={{
                      height: 300,
                      yaxis: { title: { text: "P&L ($M)" }, gridcolor: '#DCE3E5' },
                      margin: { l: 45, r: 15, t: 10, b: 40 }
                    }}
                  />
                </div>
              </div>

              {/* Shocks Table */}
              <div className="lg:col-span-5 bg-[#F3F6F6] border border-[#DCE3E5] rounded-lg p-3 flex flex-col justify-between">
                <div>
                  <h4 className="font-bold text-[#0B2B33] text-xs uppercase tracking-wider mb-2">
                    Calibrated Factor Shocks (Impact-Scaled)
                  </h4>
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[#DCE3E5] text-[#4A5E66]">
                        <th className="py-1 text-left">Risk Factor</th>
                        <th className="py-1 text-right">Applied Shock</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#DCE3E5]">
                      <tr>
                        <td className="py-1.5 text-[#0B2B33]">Equities</td>
                        <td className="py-1.5 text-right font-mono font-semibold text-[#E4572E]">
                          {currentResult.scenario.equity_pct >= 0 ? '+' : ''}{currentResult.scenario.equity_pct.toFixed(1)}%
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1.5 text-[#0B2B33]">Benchmark Curves (Parallel)</td>
                        <td className="py-1.5 text-right font-mono font-semibold">
                          {currentResult.scenario.rate_bp >= 0 ? '+' : ''}{currentResult.scenario.rate_bp.toFixed(0)} bp
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1.5 text-[#0B2B33]">Credit Spreads</td>
                        <td className="py-1.5 text-right font-mono font-semibold text-[#E4572E]">
                          +{currentResult.scenario.spread_bp.toFixed(0)} bp
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1.5 text-[#0B2B33]">Default Probability (PD Multiplier)</td>
                        <td className="py-1.5 text-right font-mono font-semibold text-[#E4572E]">
                          × {currentResult.scenario.pd_multiplier.toFixed(2)}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1.5 text-[#0B2B33]">FX Valuation (vs USD)</td>
                        <td className="py-1.5 text-right font-mono text-[11px]">
                          {Object.entries(currentResult.scenario.fx_vs_usd_pct || {})
                            .map(([c, v]) => `${c} ${v >= 0 ? '+' : ''}${v.toFixed(1)}%`)
                            .join(', ') || '—'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Asset Class breakdown small chart */}
                <div className="mt-3 pt-3 border-t border-[#DCE3E5]">
                  <h5 className="font-bold text-[#0B2B33] text-[11px] mb-1">Asset Class P&amp;L Breakdown ($M)</h5>
                  <div className="h-[120px]">
                    <PlotlyChart
                      data={assetClassData}
                      layout={{
                        height: 120,
                        yaxis: { gridcolor: '#DCE3E5' },
                        margin: { l: 35, r: 10, t: 5, b: 25 }
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Sector Breakdown & Top 10 Losers */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Sector Breakdown */}
              <div className="lg:col-span-6 bg-[#F3F6F6] border border-[#DCE3E5] rounded-lg p-3">
                <h4 className="font-bold text-[#0B2B33] text-xs uppercase tracking-wider mb-2">
                  Sector P&amp;L Distribution ($M)
                </h4>
                <div className="h-[280px]">
                  <PlotlyChart
                    data={sectorData}
                    layout={{
                      height: 280,
                      xaxis: { gridcolor: '#DCE3E5' },
                      yaxis: { automargin: true },
                      margin: { l: 120, r: 15, t: 10, b: 35 }
                    }}
                  />
                </div>
              </div>

              {/* Ten Largest Position Losses */}
              <div className="lg:col-span-6 bg-[#F3F6F6] border border-[#DCE3E5] rounded-lg p-3">
                <h4 className="font-bold text-[#0B2B33] text-xs uppercase tracking-wider mb-2">
                  Top 10 Position P&amp;L Drawdowns
                </h4>
                <div className="overflow-x-auto max-h-[280px] border border-[#DCE3E5] rounded bg-white">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-[#F3F6F6] text-[#4A5E66] border-b border-[#DCE3E5] sticky top-0">
                      <tr>
                        <th className="p-2 font-semibold">Instrument Type</th>
                        <th className="p-2 font-semibold">Obligor / Counterparty</th>
                        <th className="p-2 font-semibold">Sector</th>
                        <th className="p-2 font-semibold text-right">Drawdown ($M)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#DCE3E5]">
                      {currentResult.top_losers.map((pos) => (
                        <tr key={pos.position_id} className="hover:bg-[#F3F6F6]/50">
                          <td className="p-2 whitespace-nowrap text-[#0B2B33]">{pos.instrument}</td>
                          <td className="p-2 whitespace-nowrap font-medium text-[#0B2B33]">{pos.counterparty}</td>
                          <td className="p-2 whitespace-nowrap text-[#4A5E66]">{pos.sector}</td>
                          <td className="p-2 whitespace-nowrap text-right font-mono font-bold text-[#E4572E]">
                            {pos.pnl >= 0 ? '+' : ''}{pos.pnl.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
