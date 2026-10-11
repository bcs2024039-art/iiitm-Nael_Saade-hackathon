import React from 'react';
import { Layers, FileCode, CheckCircle2, AlertTriangle, BookOpen } from 'lucide-react';

export const TabMethodology: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Architecture Card */}
      <div className="bg-white border border-[#DCE3E5] rounded-lg p-5">
        <div className="flex items-center gap-2 mb-3">
          <Layers className="w-5 h-5 text-[#0B2B33]" />
          <h3 className="font-bold text-[#0B2B33] text-lg">System Architecture &amp; Analytical Pipeline</h3>
        </div>
        <div className="bg-[#F3F6F6] border border-[#DCE3E5] rounded-lg p-3 flex justify-center mb-3">
          <img
            src="/architecture.png"
            alt="Foreshock Architecture"
            className="max-h-[380px] object-contain rounded"
            onError={(e) => {
              // Hide image container if not loaded
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
        </div>
        <p className="text-xs text-[#4A5E66] text-center">
          <code>Data Inlets &amp; Feeds → Normalization Connectors → NLP Risk Engine → Structured Risk Signals (JSONL/REST) → Tactical Rebalancer / Stress Engine → Real-Time Analytics UI</code>
        </p>
      </div>

      {/* Two Columns: Specifications & Limitations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Specifications */}
        <div className="bg-white border border-[#DCE3E5] rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-[#DCE3E5] pb-2">
            <BookOpen className="w-4 h-4 text-[#0B2B33]" />
            <h4 className="font-bold text-[#0B2B33] text-sm uppercase tracking-wider">
              Risk Signal Schema &amp; Analytical Pipeline
            </h4>
          </div>
          <ul className="text-xs text-[#0B2B33] space-y-2.5 leading-relaxed">
            <li>
              <strong>sentiment_score ∈ [−1.0, +1.0]:</strong> Social-media-aware sentiment analysis augmented with an institutional finance lexicon, context-sensitive n-gram scoring, and directional economic rules (e.g., distinguishing &ldquo;inflation cools&rdquo; from &ldquo;inflation surges&rdquo;).
            </li>
            <li>
              <strong>event_type (12 Archetypes):</strong> Structured classification spanning Geopolitical, Macroeconomic, Credit Event, Merger/Acquisition, Earnings/Guidance, Product Launch, Regulatory/Legal, Operational/Cyber, Natural Disaster/Pandemic, Leadership Change, Analyst Action, and General Market.
            </li>
            <li>
              <strong>impact_score ∈ [1.0, 10.0]:</strong> Calibrated from event priors, linguistic severity markers, quantitative magnitude cues (percentages, dollar volumes), absolute sentiment intensity, and entity prominence—moderated by source credibility, reporting certainty, and cross-channel corroboration.
            </li>
            <li>
              <strong>Full Model Explainability:</strong> Every emitted signal provides auditable attribution drivers: matched lexical sentiment terms, classification trigger evidence tokens, decomposed impact components, and publisher credibility metrics.
            </li>
            <li>
              <strong>Supported Ingestion Inlets:</strong> Pre-calibrated news wire and social commentary streams for replay; live production connectors for GDELT DOC 2.0, NewsAPI, and financial RSS; and batch CSV file adapters.
            </li>
          </ul>
        </div>

        {/* Honest Limitations */}
        <div className="bg-white border border-[#DCE3E5] rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-[#DCE3E5] pb-2">
            <AlertTriangle className="w-4 h-4 text-[#E4572E]" />
            <h4 className="font-bold text-[#0B2B33] text-sm uppercase tracking-wider">
              Methodological Assumptions &amp; Governance Constraints
            </h4>
          </div>
          <ul className="text-xs text-[#0B2B33] space-y-2.5 leading-relaxed">
            <li>
              <strong>Synthetic Market Simulation:</strong> The bundled 1-week replay data utilizes simulated counterparties, synthetic news feeds, and stochastic pricing to validate system mechanics without relying on proprietary live market feeds.
            </li>
            <li>
              <strong>Deterministic Rules vs. Neural Models:</strong> Delivers deterministic, low-latency scoring (~1,690 docs/sec per core) with complete auditability, though complex rhetorical subtleties (nested negations, irony) may be captured less reliably than large transformer models.
            </li>
            <li>
              <strong>Systemic Boundary Classification:</strong> While impact heuristics effectively rank event severity, distinguishing isolated idiosyncratic noise from systemic crises relies on Module B's multi-condition triggers (severity threshold, adverse sentiment filter, and cooldown intervals).
            </li>
            <li>
              <strong>Sensitivity Pricing Approximation:</strong> Stress revaluations apply standard first- and second-order sensitivities (modified duration, convexity, CS01, DV01, and PD × LGD) for rapid scenario exploration rather than full non-linear CCAR/EBA capital models.
            </li>
            <li>
              <strong>Dual-Horizon Decoupling:</strong> Idiosyncratic company headlines dynamically adjust tactical portfolio weights in Module A, while market-wide macro shocks activate wholesale balance-sheet stress revaluation in Module B.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};
