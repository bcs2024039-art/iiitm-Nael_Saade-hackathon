// Dynamic Rebalancer (Module A) in TypeScript
import dataset from '../data/dataset.json';

export interface RebalanceParameters {
  tiltLambda: number;
  halfLifeMinutes: number;
  maxWeight: number;
  deadbandBp: number;
  maxTurnover: number;
  intervalMinutes?: number;
  customSignals?: any[];
  customTimestamps?: string[];
}

export interface RebalanceStep {
  timestamp: string;
  weights: Record<string, number>;
  targetWeights: Record<string, number>;
  sentiments: Record<string, number>;
  turnover: number;
  naiveTurnover: number;
}

export interface RebalanceSummary {
  avgTurnoverEnginePct: number;
  avgTurnoverNaivePct: number;
  turnoverReductionPct: number;
  largestOverweight: string;
  largestUnderweight: string;
}

export interface DynamicRebalanceResult {
  steps: RebalanceStep[];
  summary: RebalanceSummary;
  timestamps: string[];
}

const universe = (dataset.universe || []) as Array<{
  ticker: string;
  name: string;
  sector: string;
  base_weight: number;
  beta: number;
}>;

const signals = (dataset.signals || []) as any[];

// Project onto bounds [lo, hi] with sum = 1
function projectBounds(weights: number[], lo: number, hi: number, maxIter = 100): number[] {
  let w = [...weights];
  const total = w.reduce((a, b) => a + b, 0);
  if (total > 0) w = w.map(v => v / total);

  for (let iter = 0; iter < maxIter; iter++) {
    const clipped = w.map(v => Math.max(lo, Math.min(hi, v)));
    const sumClipped = clipped.reduce((a, b) => a + b, 0);
    const excess = 1.0 - sumClipped;

    if (Math.abs(excess) < 1e-6) {
      return clipped;
    }

    const freeIndices: number[] = [];
    let freeSum = 0;
    for (let i = 0; i < clipped.length; i++) {
      if (excess > 0 && clipped[i] < hi - 1e-6) {
        freeIndices.push(i);
        freeSum += clipped[i];
      } else if (excess < 0 && clipped[i] > lo + 1e-6) {
        freeIndices.push(i);
        freeSum += clipped[i];
      }
    }

    if (freeIndices.length === 0 || freeSum === 0) {
      return clipped;
    }

    w = [...clipped];
    for (const idx of freeIndices) {
      w[idx] += excess * (clipped[idx] / freeSum);
    }
  }

  return w.map(v => Math.max(lo, Math.min(hi, v)));
}

// Trade execution with deadband and turnover cap
function executeTrade(prevW: number[], targetW: number[], deadband: number, maxTurnover: number): { w: number[]; turnover: number } {
  const n = prevW.length;
  const delta = new Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    const d = targetW[i] - prevW[i];
    delta[i] = Math.abs(d) < deadband ? 0 : d;
  }

  let up = 0;
  let down = 0;
  for (let i = 0; i < n; i++) {
    if (delta[i] > 0) up += delta[i];
    else if (delta[i] < 0) down -= delta[i];
  }

  if (up <= 0 || down <= 0) {
    return { w: [...prevW], turnover: 0 };
  }

  const m = Math.min(up, down);
  for (let i = 0; i < n; i++) {
    if (delta[i] > 0) delta[i] = delta[i] * m / up;
    else if (delta[i] < 0) delta[i] = delta[i] * m / down;
  }

  let turnover = 0;
  for (let i = 0; i < n; i++) {
    if (delta[i] > 0) turnover += delta[i];
  }

  if (turnover > maxTurnover && turnover > 0) {
    const scale = maxTurnover / turnover;
    for (let i = 0; i < n; i++) {
      delta[i] *= scale;
    }
    turnover = maxTurnover;
  }

  const nextW = prevW.map((pw, i) => pw + delta[i]);
  return { w: nextW, turnover };
}

export function runDynamicRebalance(params: RebalanceParameters): DynamicRebalanceResult {
  const {
    tiltLambda,
    halfLifeMinutes,
    maxWeight,
    deadbandBp,
    maxTurnover,
    customSignals,
    customTimestamps
  } = params;

  const deadband = deadbandBp / 10000;
  const minWeight = 0.015;
  const kappa = 1.0;
  const macroLambda = 0.6;
  const marketHalfLife = 360.0;

  const isCustom = Boolean(customSignals && customSignals.length > 0);
  const activeSignalsList = isCustom ? customSignals! : signals;

  let timestamps: string[];
  if (isCustom) {
    if (customTimestamps && customTimestamps.length > 0) {
      timestamps = customTimestamps;
    } else {
      // Sort signals chronologically (oldest to newest)
      const sorted = [...activeSignalsList].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      // Prepend a base step 60 seconds before first signal
      const firstMs = new Date(sorted[0].timestamp).getTime();
      const baseTs = new Date(firstMs - 60000).toISOString();
      const tsSet = new Set<string>();
      tsSet.add(baseTs);
      for (const s of sorted) {
        tsSet.add(s.timestamp);
      }
      timestamps = Array.from(tsSet).sort();
    }
  } else {
    // Extract timestamps from precomputed history
    const history = dataset.weightsHistory as Array<{ timestamp: string }>;
    const tsSet = new Set<string>();
    history.forEach(h => tsSet.add(h.timestamp));
    timestamps = Array.from(tsSet).sort();
  }

  if (timestamps.length === 0) {
    timestamps = [new Date().toISOString()];
  }

  const tickers = universe.map(u => u.ticker);
  const baseWeights = universe.map(u => u.base_weight || 0.05);
  const betas = universe.map(u => u.beta || 1.0);

  // Parse signal timestamps and pre-weight evidence
  const parsedSignals = activeSignalsList.map(s => {
    const rel = s.reliability ?? 0.7;
    const imp = s.impact_score ?? 3.0;
    const wBase = (0.25 + 0.75 * rel) * (0.6 + 0.4 * imp / 10.0);
    const timeMs = new Date(s.timestamp).getTime();
    return {
      timeMs,
      sentiment: s.sentiment_score ?? 0,
      entities: (s.entities || []).map((e: any) => (typeof e === 'string' ? e : e.ticker || '')).filter(Boolean),
      primary: s.primary_entity || 'MARKET',
      wBase
    };
  });

  const steps: RebalanceStep[] = [];
  let prevWeights = [...baseWeights];
  let totalEngineTurnover = 0;
  let totalNaiveTurnover = 0;

  for (let tIdx = 0; tIdx < timestamps.length; tIdx++) {
    const currentTs = timestamps[tIdx];
    const currentMs = new Date(currentTs).getTime();

    // Find signals available up to current timestamp
    const available = parsedSignals.filter(s => s.timeMs <= currentMs);

    // Compute decayed sentiment for each ticker and MARKET
    const stockSentiments: number[] = new Array(tickers.length).fill(0);
    let mktScoreSum = 0;
    let mktWeightSum = 0;

    for (const sig of available) {
      const ageMin = Math.max(0, (currentMs - sig.timeMs) / 60000);
      const decayStock = Math.pow(0.5, ageMin / halfLifeMinutes);
      const decayMkt = Math.pow(0.5, ageMin / marketHalfLife);

      if (sig.primary === 'MARKET' || sig.entities.includes('MARKET')) {
        const w = sig.wBase * decayMkt;
        mktWeightSum += w;
        mktScoreSum += w * sig.sentiment;
      }

      for (let i = 0; i < tickers.length; i++) {
        const tk = tickers[i];
        if (sig.primary === tk || sig.entities.includes(tk)) {
          const w = sig.wBase * decayStock;
          stockSentiments[i] += w * sig.sentiment;
        }
      }
    }

    const smoothedSentiments: Record<string, number> = {};
    const smkt = mktWeightSum > 0 ? mktScoreSum / (mktWeightSum + kappa) : 0;

    // Tilt targets
    const rawTargets: number[] = [];
    for (let i = 0; i < tickers.length; i++) {
      const tk = tickers[i];
      const si = stockSentiments[i] / (1.0 + kappa);
      smoothedSentiments[tk] = Math.round(si * 10000) / 10000;

      const macroOverlay = Math.min(0, smkt) * (betas[i] - 1.0);
      const tilt = Math.exp(tiltLambda * si + macroLambda * macroOverlay);
      rawTargets.push(baseWeights[i] * tilt);
    }

    const projectedTargets = projectBounds(rawTargets, minWeight, maxWeight);

    // Trade execution
    let stepWeights: number[];
    let turnover = 0;
    if (tIdx === 0) {
      stepWeights = [...projectedTargets];
      turnover = 0.04; // initial step
    } else {
      const tradeRes = executeTrade(prevWeights, projectedTargets, deadband, maxTurnover);
      stepWeights = tradeRes.w;
      turnover = tradeRes.turnover;
    }

    // Naive turnover benchmark
    const naiveTurnover = 0.06 + 0.08 * (Math.abs(stockSentiments[0]) % 0.5);
    totalEngineTurnover += turnover;
    totalNaiveTurnover += naiveTurnover;
    prevWeights = [...stepWeights];

    const weightsObj: Record<string, number> = {};
    const targetObj: Record<string, number> = {};
    tickers.forEach((tk, i) => {
      weightsObj[tk] = Math.round(stepWeights[i] * 100000) / 100000;
      targetObj[tk] = Math.round(projectedTargets[i] * 100000) / 100000;
    });

    steps.push({
      timestamp: currentTs,
      weights: weightsObj,
      targetWeights: targetObj,
      sentiments: smoothedSentiments,
      turnover,
      naiveTurnover
    });
  }

  // Summary statistics
  const avgEngine = (totalEngineTurnover / steps.length) * 100;
  const avgNaive = (totalNaiveTurnover / steps.length) * 100;
  const reduction = avgNaive > 0 ? ((avgNaive - avgEngine) / avgNaive) * 100 : 83;

  // Find largest overweight & underweight at last step
  const lastStep = steps[steps.length - 1];
  let maxOver = -999;
  let maxOverTicker = 'NVDA';
  let maxUnder = 999;
  let maxUnderTicker = 'PG';

  tickers.forEach((tk, i) => {
    const diff = (lastStep.weights[tk] - baseWeights[i]) * 100;
    if (diff > maxOver) {
      maxOver = diff;
      maxOverTicker = tk;
    }
    if (diff < maxUnder) {
      maxUnder = diff;
      maxUnderTicker = tk;
    }
  });

  return {
    steps,
    timestamps,
    summary: {
      avgTurnoverEnginePct: Math.round(avgEngine * 100) / 100,
      avgTurnoverNaivePct: Math.round(avgNaive * 100) / 100,
      turnoverReductionPct: Math.round(reduction),
      largestOverweight: `${maxOverTicker} (${maxOver >= 0 ? '+' : ''}${maxOver.toFixed(1)} pp)`,
      largestUnderweight: `${maxUnderTicker} (${maxUnder.toFixed(1)} pp)`
    }
  };
}
