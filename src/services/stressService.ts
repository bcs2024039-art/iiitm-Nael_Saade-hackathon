// Foreshock Module B - Strategic Stress Tester (TypeScript Implementation)
import dataset from '../data/dataset.json';

export interface Position {
  position_id: string;
  currency: string;
  rating: string;
  pd_annual: number;
  lgd: number;
  maturity_years: number;
  coupon_pct: number;
  mod_duration: number;
  convexity: number;
  spread_duration: number;
  dv01_usd: number;
  cs01_usd: number;
  direction: number;
  beta: number;
  fixed_rate: boolean;
  ticker: string;
  asset_class: string;
  instrument: string;
  counterparty: string;
  sector: string;
  notional_usd_mm: number;
  market_value_usd_mm: number;
}

export interface ShockSummary {
  event_type: string;
  impact_score: number;
  severity: number;
  equity_pct: number;
  rate_bp: number;
  spread_bp: number;
  pd_multiplier: number;
  fx_vs_usd_pct: Record<string, number>;
  description: string;
}

export interface StressResult {
  scenario: ShockSummary;
  value_before: number;
  value_after: number;
  pnl: number;
  pnl_pct: number;
  by_asset_class: Array<{ asset_class: string; mv_before: number; pnl: number; mv_after: number; pnl_pct: number }>;
  by_sector: Array<{ sector: string; mv_before: number; pnl: number; mv_after: number; pnl_pct: number }>;
  by_risk_factor: Record<string, number>;
  expected_loss_before: number;
  expected_loss_after: number;
  top_losers: Array<{ position_id: string; instrument: string; counterparty: string; sector: string; pnl: number }>;
  narrative: string;
}

const scenariosData = dataset.scenarios as {
  _meta: { loan_loss_horizon_years_cap: number };
  scenarios: Record<string, {
    description: string;
    equity_pct: number;
    rate_bp: number;
    spread_bp: number;
    pd_multiplier: number;
    fx_vs_usd_pct: Record<string, number>;
    sector_equity_adj_pct: Record<string, number>;
    sector_pd_factor: Record<string, number>;
  }>;
  rating_spread_beta: Record<string, number>;
  rating_pd_scale: Record<string, number>;
};

const portfolio = (dataset.portfolio || []) as unknown as Position[];

export function getScenarioList(): string[] {
  return Object.keys(scenariosData.scenarios);
}

export function runStressScenario(eventType: string, impactScore: number): StressResult {
  const scenarioDef = scenariosData.scenarios[eventType] || scenariosData.scenarios["Credit Event"];
  const k = Math.min(1.0, Math.max(0.1, impactScore / 10.0));

  const equityPct = scenarioDef.equity_pct * k;
  const rateBp = scenarioDef.rate_bp * k;
  const spreadBp = scenarioDef.spread_bp * k;
  const pdMultiplier = 1.0 + (scenarioDef.pd_multiplier - 1.0) * k;

  const fxShocks: Record<string, number> = {};
  for (const [c, v] of Object.entries(scenarioDef.fx_vs_usd_pct || {})) {
    fxShocks[c] = v * k;
  }

  const sectorEqAdj: Record<string, number> = {};
  for (const [s, v] of Object.entries(scenarioDef.sector_equity_adj_pct || {})) {
    sectorEqAdj[s] = v * k;
  }

  const dy = rateBp / 1e4;
  const ds = spreadBp / 1e4;
  const loanHorizonCap = scenariosData._meta?.loan_loss_horizon_years_cap || 3.0;

  let totalMvBefore = 0;
  let totalRatesPnl = 0;
  let totalSpreadPnl = 0;
  let totalCreditPnl = 0;
  let totalEquityPnl = 0;
  let totalFxPnl = 0;
  let totalElBefore = 0;
  let totalElAfter = 0;

  const positionsResult: Array<Position & {
    mv_before: number;
    pnl: number;
    mv_after: number;
    pnl_rates: number;
    pnl_spread: number;
    pnl_credit: number;
    pnl_equity: number;
    pnl_fx: number;
    el_before: number;
    el_after: number;
  }> = [];

  for (const p of portfolio) {
    let mv0 = Number(p.market_value_usd_mm) || 0;
    const notional = Number(p.notional_usd_mm) || 0;
    const dur = Number(p.mod_duration) || 0;
    const conv = Number(p.convexity) || 0;
    const sdur = Number(p.spread_duration) || 0;
    const ratingBeta = scenariosData.rating_spread_beta[p.rating] || 1.0;
    const ratingPdScale = scenariosData.rating_pd_scale[p.rating] || 1.0;

    let pnlRates = 0;
    let pnlSpread = 0;
    let pnlCredit = 0;
    let pnlEquity = 0;
    let pnlFx = 0;
    let elBefore = 0;
    let elAfter = 0;

    if (p.asset_class === "Loan") {
      const pd0 = Number(p.pd_annual) || 0;
      const lgd = Number(p.lgd) || 0;
      const h = Math.min(Number(p.maturity_years) || 0, loanHorizonCap);
      const sectorFactor = scenarioDef.sector_pd_factor[p.sector] || 1.0;
      const mEff = 1.0 + (pdMultiplier - 1.0) * sectorFactor * ratingPdScale;
      const pd1 = Math.min(0.99, pd0 * mEff);

      mv0 = notional * (1.0 - pd0 * lgd * h);
      pnlCredit = -notional * lgd * (pd1 - pd0) * h;
      if (p.fixed_rate) {
        pnlRates = -mv0 * dur * dy;
      }
      elBefore = notional * lgd * pd0 * h;
      elAfter = notional * lgd * pd1 * h;
    } else if (p.asset_class === "Bond") {
      pnlRates = mv0 * (-dur * dy + 0.5 * conv * dy * dy);
      pnlSpread = -mv0 * sdur * ds * ratingBeta;
    } else if (p.asset_class === "Equity") {
      const beta = Number(p.beta) || 1.0;
      const adj = sectorEqAdj[p.sector] || 0.0;
      pnlEquity = mv0 * Math.max(-1.0, beta * equityPct + adj);
    } else if (p.asset_class === "Derivative") {
      const dir = Number(p.direction) || 0;
      if (p.instrument === "Interest Rate Swap") {
        pnlRates = dir * (Number(p.dv01_usd) || 0) * rateBp / 1e6;
      } else if (p.instrument === "FX Forward") {
        const fxShock = fxShocks[p.currency] || 0.0;
        pnlFx = notional * dir * fxShock;
      } else if (p.instrument === "CDS (Protection Bought)") {
        pnlSpread = dir * (Number(p.cs01_usd) || 0) * (spreadBp * ratingBeta) / 1e6;
      }
    }

    const posPnl = pnlRates + pnlSpread + pnlCredit + pnlEquity + pnlFx;
    const mvAfter = mv0 + posPnl;

    totalMvBefore += mv0;
    totalRatesPnl += pnlRates;
    totalSpreadPnl += pnlSpread;
    totalCreditPnl += pnlCredit;
    totalEquityPnl += pnlEquity;
    totalFxPnl += pnlFx;
    totalElBefore += elBefore;
    totalElAfter += elAfter;

    positionsResult.push({
      ...p,
      mv_before: mv0,
      pnl: posPnl,
      mv_after: mvAfter,
      pnl_rates: pnlRates,
      pnl_spread: pnlSpread,
      pnl_credit: pnlCredit,
      pnl_equity: pnlEquity,
      pnl_fx: pnlFx,
      el_before: elBefore,
      el_after: elAfter,
    });
  }

  const totalPnl = totalRatesPnl + totalSpreadPnl + totalCreditPnl + totalEquityPnl + totalFxPnl;
  const totalMvAfter = totalMvBefore + totalPnl;
  const pnlPct = totalMvBefore > 0 ? totalPnl / totalMvBefore : 0;

  // Breakdown by asset class
  const acMap: Record<string, { before: number; pnl: number; after: number }> = {};
  for (const pos of positionsResult) {
    if (!acMap[pos.asset_class]) acMap[pos.asset_class] = { before: 0, pnl: 0, after: 0 };
    acMap[pos.asset_class].before += pos.mv_before;
    acMap[pos.asset_class].pnl += pos.pnl;
    acMap[pos.asset_class].after += pos.mv_after;
  }
  const byAssetClass = Object.entries(acMap).map(([ac, v]) => ({
    asset_class: ac,
    mv_before: Math.round(v.before * 1000) / 1000,
    pnl: Math.round(v.pnl * 1000) / 1000,
    mv_after: Math.round(v.after * 1000) / 1000,
    pnl_pct: v.before !== 0 ? Math.round((v.pnl / v.before) * 10000) / 100 : 0
  })).sort((a, b) => a.pnl - b.pnl);

  // Breakdown by sector
  const secMap: Record<string, { before: number; pnl: number; after: number }> = {};
  for (const pos of positionsResult) {
    const sec = pos.sector || "Other";
    if (!secMap[sec]) secMap[sec] = { before: 0, pnl: 0, after: 0 };
    secMap[sec].before += pos.mv_before;
    secMap[sec].pnl += pos.pnl;
    secMap[sec].after += pos.mv_after;
  }
  const bySector = Object.entries(secMap).map(([sec, v]) => ({
    sector: sec,
    mv_before: Math.round(v.before * 1000) / 1000,
    pnl: Math.round(v.pnl * 1000) / 1000,
    mv_after: Math.round(v.after * 1000) / 1000,
    pnl_pct: v.before !== 0 ? Math.round((v.pnl / Math.abs(v.before)) * 10000) / 100 : 0
  })).sort((a, b) => a.pnl - b.pnl);

  // Top losers
  const topLosers = [...positionsResult]
    .sort((a, b) => a.pnl - b.pnl)
    .slice(0, 10)
    .map(p => ({
      position_id: p.position_id,
      instrument: p.instrument,
      counterparty: p.counterparty,
      sector: p.sector,
      pnl: Math.round(p.pnl * 100) / 100
    }));

  const byRiskFactor: Record<string, number> = {
    "Rates": Math.round(totalRatesPnl * 100) / 100,
    "Credit spreads": Math.round(totalSpreadPnl * 100) / 100,
    "Credit losses (PD)": Math.round(totalCreditPnl * 100) / 100,
    "Equity": Math.round(totalEquityPnl * 100) / 100,
    "FX": Math.round(totalFxPnl * 100) / 100,
  };

  // Worst drag for narrative
  const worstFactor = Object.entries(byRiskFactor).sort((a, b) => a[1] - b[1])[0];
  const narrative = `${eventType} scenario (impact ${impactScore.toFixed(1)}/10): equities ${(equityPct * 100).toFixed(1)}%, ` +
    `rates ${rateBp >= 0 ? '+' : ''}${rateBp.toFixed(0)}bp, credit spreads +${spreadBp.toFixed(0)}bp, PD multiplier x${pdMultiplier.toFixed(2)}. ` +
    `Portfolio value $${totalMvBefore.toLocaleString(undefined, { maximumFractionDigits: 1 })}M → $${totalMvAfter.toLocaleString(undefined, { maximumFractionDigits: 1 })}M ` +
    `(${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(1)}M, ${(pnlPct * 100).toFixed(2)}%). ` +
    `Largest drag: ${worstFactor[0].toLowerCase()} (${worstFactor[1] >= 0 ? '+' : ''}$${worstFactor[1].toFixed(1)}M); ` +
    `loan expected loss $${totalElBefore.toFixed(1)}M → $${totalElAfter.toFixed(1)}M.`;

  return {
    scenario: {
      event_type: eventType,
      impact_score: Math.round(impactScore * 100) / 100,
      severity: Math.round(k * 1000) / 1000,
      equity_pct: Math.round(equityPct * 10000) / 100,
      rate_bp: Math.round(rateBp * 10) / 10,
      spread_bp: Math.round(spreadBp * 10) / 10,
      pd_multiplier: Math.round(pdMultiplier * 1000) / 1000,
      fx_vs_usd_pct: Object.fromEntries(Object.entries(fxShocks).map(([c, v]) => [c, Math.round(v * 10000) / 100])),
      description: scenarioDef.description
    },
    value_before: Math.round(totalMvBefore * 100) / 100,
    value_after: Math.round(totalMvAfter * 100) / 100,
    pnl: Math.round(totalPnl * 100) / 100,
    pnl_pct: Math.round(pnlPct * 10000) / 10000,
    by_asset_class: byAssetClass,
    by_sector: bySector,
    by_risk_factor: byRiskFactor,
    expected_loss_before: Math.round(totalElBefore * 100) / 100,
    expected_loss_after: Math.round(totalElAfter * 100) / 100,
    top_losers: topLosers,
    narrative
  };
}
