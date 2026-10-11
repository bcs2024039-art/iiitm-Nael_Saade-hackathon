// Foreshock AI/NLP Risk Engine (TypeScript Implementation)
import vader from 'vader-sentiment';
import dataset from '../data/dataset.json';

export interface EntityMention {
  ticker: string;
  name: string;
  sector: string;
  relevance: number;
  matched: string;
}

export interface RiskSignal {
  signal_id: string;
  doc_id: string;
  timestamp: string;
  source_type: 'news' | 'social';
  source_name: string;
  headline: string;
  entities: EntityMention[];
  primary_entity: string;
  sentiment_score: number;
  sentiment_label: 'positive' | 'negative' | 'neutral';
  event_type: string;
  impact_score: number;
  event_confidence: number;
  secondary_event?: string | null;
  impact_band: 'Critical' | 'High' | 'Moderate' | 'Low';
  reliability: number;
  corroboration: number;
  drivers: {
    sentiment_terms: [string, number][];
    event_evidence: string[];
    event_scores: Record<string, number>;
    magnitude: {
      usd_millions: number;
      pct: number;
      bps: number;
    };
    impact_components: {
      prior: number;
      severity: number;
      magnitude: number;
      sentiment: number;
      prominence: number;
      raw: number;
      reliability: number;
      scope: number;
      severity_terms?: string[];
    };
    credibility: number;
    certainty: number;
  };
  model_version: string;
  synthetic: boolean;
}

export const EVENT_TYPES = [
  "Geopolitical",
  "Macroeconomic",
  "Credit Event",
  "Merger/Acquisition",
  "Earnings/Guidance",
  "Product Launch",
  "Regulatory/Legal",
  "Operational/Cyber",
  "Natural Disaster/Pandemic",
  "Leadership Change",
  "Analyst Action",
  "Other"
];

export const EVENT_SEVERITY_PRIOR: Record<string, number> = {
  "Geopolitical": 0.70,
  "Macroeconomic": 0.62,
  "Credit Event": 0.78,
  "Natural Disaster/Pandemic": 0.70,
  "Operational/Cyber": 0.55,
  "Regulatory/Legal": 0.50,
  "Merger/Acquisition": 0.42,
  "Earnings/Guidance": 0.32,
  "Leadership Change": 0.30,
  "Product Launch": 0.26,
  "Analyst Action": 0.18,
  "Other": 0.12,
};

// Universe companies
export const UNIVERSE = (dataset.universe || []) as Array<{
  ticker: string;
  name: string;
  sector: string;
  base_weight: number;
  beta: number;
  prominence: number;
  aliases: string;
}>;

// Finance Lexicon Unigrams
const FIN_UNIGRAMS: Record<string, number> = {
  "bankruptcy": -3.6, "bankrupt": -3.6, "insolvency": -3.6, "insolvent": -3.6, "fraud": -3.6, "ponzi": -3.6, "meltdown": -3.6,
  "collapse": -3.3, "collapses": -3.3, "collapsed": -3.3, "collapsing": -3.3, "default": -3.3, "defaults": -3.3, "defaulted": -3.3,
  "plunge": -3.3, "plunges": -3.3, "plunged": -3.3, "plunging": -3.3, "crash": -3.3, "crashes": -3.3, "crashed": -3.3, "crisis": -3.3,
  "turmoil": -3.3, "carnage": -3.3, "cyberattack": -3.3, "ransomware": -3.3, "panic": -3.0, "contagion": -3.0, "bailout": -3.0,
  "recession": -3.0, "tumble": -2.7, "tumbles": -2.7, "tumbled": -2.7, "slump": -2.7, "slumps": -2.7, "slumped": -2.7,
  "downgrade": -2.7, "downgrades": -2.7, "downgraded": -2.7, "bearish": -2.7, "outage": -2.7, "shutdown": -2.7, "escalates": -2.7,
  "shortage": -2.7, "layoffs": -2.7, "sink": -2.4, "sinks": -2.4, "sank": -2.4, "slide": -2.4, "slides": -2.4, "slid": -2.4,
  "misses": -2.4, "missed": -2.4, "disappoints": -2.4, "disappointed": -2.4, "disappointing": -2.4, "weak": -2.4, "weaker": -2.4,
  "standoff": -2.4, "tensions": -2.4, "recall": -2.4, "recalls": -2.4, "recalled": -2.4, "disrupt": -2.4, "disrupts": -2.4, "disrupted": -2.4,
  "halt": -2.4, "halts": -2.4, "halted": -2.4, "warning": -2.4, "warnings": -2.4, "losses": -2.4, "loss": -2.4, "headwinds": -2.4,
  "froz": -2.0, "frozen": -2.0, "freeze": -2.0, "stagnant": -2.0, "investigation": -1.8, "lawsuit": -1.8, "sued": -1.8,
  "tariff": -1.8, "tariffs": -1.8, "drop": -1.5, "drops": -1.5, "dropped": -1.5, "dip": -1.5, "dips": -1.5, "fears": -1.5,
  // Positive
  "skyrocket": 3.0, "skyrockets": 3.0, "skyrocketed": 3.0, "stellar": 3.0, "blowout": 3.0,
  "soar": 2.7, "soars": 2.7, "soared": 2.7, "surge": 2.7, "surges": 2.7, "surged": 2.7, "rally": 2.7, "rallies": 2.7, "rallied": 2.7, "bullish": 2.7,
  "outperform": 2.7, "outperforms": 2.7, "boom": 2.4, "booms": 2.4, "boost": 2.4, "boosts": 2.4, "boosted": 2.4,
  "upgrade": 2.4, "upgrades": 2.4, "upgraded": 2.4, "breakthrough": 2.4, "rebound": 2.4, "rebounds": 2.4, "robust": 2.4, "upbeat": 2.4,
  "jump": 2.0, "jumps": 2.0, "jumped": 2.0, "gain": 2.0, "gains": 2.0, "gained": 2.0, "climb": 2.0, "climbs": 2.0,
  "beat": 2.0, "beats": 2.0, "beating": 2.0, "tops": 2.0, "topped": 2.0, "exceeds": 2.0, "exceeded": 2.0, "profitable": 2.0,
  "expansion": 2.0, "de-escalation": 2.0, "optimism": 2.0, "resilient": 2.0, "buyback": 2.0, "buybacks": 2.0, "undervalued": 2.0,
  "recover": 1.5, "recovers": 1.5, "recovered": 1.5, "growth": 1.5, "dividend": 1.5, "lifts": 1.5, "lifted": 1.5,
  // Neutralized noise words
  "interest": 0.0, "interests": 0.0, "share": 0.0, "shares": 0.0, "credit": 0.0, "crude": 0.0, "cut": 0.0, "cuts": 0.0,
  "stock": 0.0, "stocks": 0.0, "oil": 0.0, "bond": 0.0, "bonds": 0.0, "record": 0.0, "target": 0.0, "targets": 0.0,
};

// Event patterns with regex & weights
const EVENT_RULES: Record<string, [RegExp, number][]> = {
  "Geopolitical": [
    [/\b(?:war|warfare|invasion|invad\w+|air-?strikes?|missiles?|military|troops|shelling|bombing|coup|blockade|warships?|naval)\b/i, 3.0],
    [/\b(?:sanctions?|embargo|export controls?|trade war|tariffs?|trade disputes?|retaliatory)\b/i, 2.5],
    [/\b(?:geopolitic\w*|stand-?off|escalat\w+|tensions?|hostilities|cease-?fire|truce|peace talks|de-?escalat\w+)\b/i, 2.0],
    [/\b(?:strait of \w+|shipping lanes?|tanker traffic|red sea|black sea|taiwan strait|persian gulf|gulf standoff)\b/i, 2.5],
    [/\b(?:elections?|referendum|nato|opec)\b/i, 1.5],
  ],
  "Macroeconomic": [
    [/\b(?:federal reserve|the fed|fomc|central banks?|ecb|monetary policy|rate hikes?|rate cuts?|interest rates?|basis points?|50 basis point)\b/i, 3.0],
    [/\b(?:inflation|cpi|ppi|pce|deflation|stagflation|consumer prices?|producer prices?)\b/i, 2.6],
    [/\b(?:gdp|recession|economic growth|economy|pmi|manufacturing|retail sales|jobless claims|unemployment|payrolls)\b/i, 2.4],
    [/\b(?:treasury yields?|bond yields?|yield curve|10-year yield|dollar index)\b/i, 2.0],
  ],
  "Credit Event": [
    [/\b(?:default|bankrupt\w*|chapter 11|insolven\w+|liquidation|wind down)\b/i, 3.5],
    [/\b(?:bank runs?|deposit run|deposit flight|halt\w* withdrawals?|froz\w+ withdrawals?|liquidity crisis|bailout|contagion)\b/i, 3.2],
    [/\b(?:credit rating|ratings? agency|credit outlook|junk status|downgrade|negative outlook|positive outlook|fitch|moody'?s)\b/i, 2.8],
    [/\b(?:credit spreads?|cds spreads?|loan loss|write-?downs?|margin calls?)\b/i, 2.2],
  ],
  "Merger/Acquisition": [
    [/\b(?:acquir\w+|acquisitions?|mergers?|take-?overs?|buy-?outs?|tender offer|bids? for|agrees to buy|deal valued)\b/i, 3.0],
    [/\b(?:divest\w*|spin-?offs?|sells retail unit|abandons bid|joint venture)\b/i, 2.2],
  ],
  "Earnings/Guidance": [
    [/\b(?:earnings|quarterly profit|quarterly results|q[1-4]|beats quarterly profit|misses revenue|raises full-year|cuts full-year|tops wall street|reaffirms full-year guidance)\b/i, 3.2],
    [/\b(?:revenue estimates?|pricing power|cloud orders|subscription growth|profit warning)\b/i, 2.4],
  ],
  "Product Launch": [
    [/\b(?:launch\w*|unveil\w*|releases?|debut\w*|rollout|new model|ai chip|unveils new|introduces new)\b/i, 2.8],
  ],
  "Regulatory/Legal": [
    [/\b(?:antitrust|lawsuit|regulators?|sec|ftc|investigation|subpoena|penalty|fined|court rules|probe)\b/i, 2.8],
  ],
  "Operational/Cyber": [
    [/\b(?:ransomware|cyberattack|hacked|data breach|outage|production halt|supplier shortage|delays deliveries|recalls? \d+|wiring issue|software fault)\b/i, 3.0],
  ],
  "Natural Disaster/Pandemic": [
    [/\b(?:hurricane|earthquake|wildfire|flood|typhoon|pandemic|landfall|refineries shut down|ports closed)\b/i, 3.2],
  ],
  "Leadership Change": [
    [/\b(?:ceo resigns|cfo to step down|names .* as new chief executive|executive shake-up|steps down|appoints new)\b/i, 3.0],
  ],
  "Analyst Action": [
    [/\b(?:price target|initiates coverage|downgrades|upgrades|analysts upgrade|overweight rating|neutral rating)\b/i, 3.0],
  ]
};

// Severity keywords
const SEVERITY_CUES: [RegExp, number][] = [
  [/\b(?:catastrophic|historic|massive|unprecedented|devastating|existential|worst in decades)\b/i, 1.2],
  [/\b(?:files for bankruptcy|bank run|deposit run|contagion|halted tanker traffic|crude spikes)\b/i, 1.0],
  [/\b(?:emergency|surprise hike|cripples|ransomware attack|category [45] hurricane|disaster)\b/i, 0.9],
  [/\b(?:plunges?|meltdown|record loss|severe|soaring)\b/i, 0.6],
];

export function extractEntities(text: string): EntityMention[] {
  const mentions: EntityMention[] = [];
  const upper = text.toUpperCase();

  for (const c of UNIVERSE) {
    let matched = false;
    let matchStr = "";

    // Cashtag check e.g. $AAPL
    if (upper.includes(`$${c.ticker}`)) {
      matched = true;
      matchStr = `$${c.ticker}`;
    } else if (new RegExp(`\\b${c.ticker}\\b`).test(upper)) {
      // Check isolated ticker
      matched = true;
      matchStr = c.ticker;
    } else {
      // Check company name or aliases
      const terms = [c.name, ...(c.aliases ? c.aliases.split('|') : [])];
      for (const term of terms) {
        if (new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) {
          matched = true;
          matchStr = term;
          break;
        }
      }
    }

    if (matched) {
      mentions.push({
        ticker: c.ticker,
        name: c.name,
        sector: c.sector,
        relevance: 1.0,
        matched: matchStr,
      });
    }
  }

  return mentions;
}

export function analyzeSentiment(text: string): { score: number; terms: [string, number][] } {
  // Use VADER as base
  let res = { compound: 0 };
  try {
    res = vader.SentimentIntensityAnalyzer.polarity_scores(text);
  } catch (e) {
    // fallback
  }

  let compound = res.compound || 0;
  const terms: [string, number][] = [];
  const words = text.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(Boolean);

  // Apply financial overrides
  let overrideSum = 0;
  let overrideCount = 0;
  for (const w of words) {
    if (FIN_UNIGRAMS[w] !== undefined) {
      const val = FIN_UNIGRAMS[w];
      if (Math.abs(val) > 0.05) {
        terms.push([w, val]);
        overrideSum += val;
        overrideCount++;
      }
    }
  }

  // Phrase overrides
  if (/files for bankruptcy|bank run|deposit run/i.test(text)) {
    terms.push(["files bankruptcy", -3.8]);
    overrideSum -= 3.8;
    overrideCount++;
  }
  if (/crude spikes|oil surges|tanker traffic/i.test(text)) {
    terms.push(["crude spikes", -2.8]);
    overrideSum -= 2.8;
    overrideCount++;
  }
  if (/surprise.*rate hike|50 basis point rate hike/i.test(text)) {
    terms.push(["surprise hike", -3.0]);
    overrideSum -= 3.0;
    overrideCount++;
  }
  if (/beats quarterly profit|record revenue|raises full-year/i.test(text)) {
    terms.push(["beats profit", 2.8]);
    overrideSum += 2.8;
    overrideCount++;
  }

  if (overrideCount > 0) {
    const normOverride = Math.tanh(overrideSum / 3.5);
    compound = 0.4 * compound + 0.6 * normOverride;
  }

  compound = Math.max(-1, Math.min(1, Math.round(compound * 10000) / 10000));
  return { score: compound, terms };
}

export function classifyEvent(text: string): { eventType: string; confidence: number; evidence: string[]; scores: Record<string, number> } {
  const scores: Record<string, number> = {};
  const evidenceMap: Record<string, string[]> = {};

  for (const [etype, rules] of Object.entries(EVENT_RULES)) {
    let total = 0;
    const hits: string[] = [];
    for (const [rx, weight] of rules) {
      const m = text.match(rx);
      if (m) {
        total += weight;
        hits.push(m[0].toLowerCase());
      }
    }
    scores[etype] = Math.round(total * 100) / 100;
    evidenceMap[etype] = hits;
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  let top = sorted[0][0];
  const topScore = sorted[0][1];

  if (topScore < 1.6) {
    top = "Other";
  }

  // Softmax
  const temp = 1.8;
  const logits: Record<string, number> = {};
  for (const [k, v] of Object.entries(scores)) {
    if (v > 0) logits[k] = v / temp;
  }
  logits["Other"] = 1.5 / temp;

  const maxLogit = Math.max(...Object.values(logits));
  let expSum = 0;
  const exps: Record<string, number> = {};
  for (const [k, v] of Object.entries(logits)) {
    const e = Math.exp(v - maxLogit);
    exps[k] = e;
    expSum += e;
  }
  const confidence = expSum > 0 ? (exps[top] || 0) / expSum : 0.5;

  return {
    eventType: top,
    confidence: Math.round(confidence * 1000) / 1000,
    evidence: evidenceMap[top] || [],
    scores
  };
}

export function scoreImpact(params: {
  eventType: string;
  sentiment: number;
  text: string;
  reliability: number;
  scope: number;
  prominence: number;
}): { score: number; band: 'Critical' | 'High' | 'Moderate' | 'Low'; components: any } {
  const prior = EVENT_SEVERITY_PRIOR[params.eventType] || 0.12;

  // Severity cues
  let sevTotal = 0;
  const sevHits: string[] = [];
  for (const [rx, w] of SEVERITY_CUES) {
    const m = params.text.match(rx);
    if (m) {
      sevTotal += w;
      sevHits.push(m[0].toLowerCase());
    }
  }
  const severity = 1.0 - Math.exp(-sevTotal / 1.2);

  // Magnitude cues
  let mag = 0;
  const magMatch = params.text.match(/\$?(\d+(?:\.\d+)?)\s*(billion|million|bn|m|%|bps|basis points)/i);
  if (magMatch) {
    mag = 0.5;
    if (/billion|bn/i.test(magMatch[2])) mag = 0.85;
  }

  const raw = 0.32 * prior + 0.26 * severity + 0.14 * mag + 0.10 * Math.abs(params.sentiment) + 0.18 * params.prominence;
  const base = 1.0 / (1.0 + Math.exp(-9.0 * (raw - 0.40)));
  const impact01 = base * (0.6 + 0.4 * Math.max(0, Math.min(1, params.reliability))) * params.scope;
  let score = 1.0 + 9.0 * impact01;
  score = Math.max(1.0, Math.min(10.0, Math.round(score * 100) / 100));

  let band: 'Critical' | 'High' | 'Moderate' | 'Low' = 'Low';
  if (score >= 8.0) band = 'Critical';
  else if (score >= 6.0) band = 'High';
  else if (score >= 4.0) band = 'Moderate';

  return {
    score,
    band,
    components: {
      prior: Math.round(prior * 100) / 100,
      severity: Math.round(severity * 100) / 100,
      magnitude: Math.round(mag * 100) / 100,
      sentiment: Math.round(Math.abs(params.sentiment) * 100) / 100,
      prominence: Math.round(params.prominence * 100) / 100,
      raw: Math.round(raw * 100) / 100,
      reliability: Math.round(params.reliability * 100) / 100,
      scope: Math.round(params.scope * 100) / 100,
      severity_terms: sevHits
    }
  };
}

export function analyzeDocument(options: {
  text: string;
  source_type?: 'news' | 'social';
  source_name?: string;
  followers?: number;
  verified?: boolean;
}): RiskSignal {
  const sourceType = options.source_type || 'news';
  const sourceName = options.source_name || (sourceType === 'news' ? 'SynthWire' : 'X');
  const text = options.text.trim();

  // Entities
  const entities = extractEntities(text);
  let primary = entities.length > 0 ? entities[0].ticker : "MARKET";
  if (entities.length === 0) {
    entities.push({
      ticker: "MARKET",
      name: "Broad market",
      sector: "Market-wide",
      relevance: 1.0,
      matched: ""
    });
  }

  // Sentiment
  const sentimentRes = analyzeSentiment(text);
  const sentiment = sentimentRes.score;
  const label = sentiment >= 0.15 ? "positive" : sentiment <= -0.15 ? "negative" : "neutral";

  // Event
  const eventRes = classifyEvent(text);

  // Credibility & Reliability
  let cred = 0.6;
  if (sourceType === 'news') {
    const lower = sourceName.toLowerCase();
    if (lower.includes('synthwire') || lower.includes('reuters') || lower.includes('bloomberg')) cred = 1.0;
    else if (lower.includes('markets daily') || lower.includes('wsj')) cred = 0.9;
    else if (lower.includes('ledger') || lower.includes('ft')) cred = 0.85;
    else if (lower.includes('business journal')) cred = 0.8;
    else if (lower.includes('pulse')) cred = 0.7;
    else if (lower.includes('blog')) cred = 0.5;
  } else {
    const f = options.followers ?? 400;
    cred = 0.25 + 0.35 * Math.min(1.0, Math.log10(1 + f) / 6.0) + (options.verified ? 0.15 : 0.0);
    cred = Math.min(cred, 0.9);
  }

  // Reliability: credibility * certainty * corroboration
  const certainty = /maybe|perhaps|unconfirmed|rumor|hearing|anyone know/i.test(text) ? 0.65 : 1.0;
  const corroboration = 1;
  const reliability = Math.min(1.0, Math.round(cred * certainty * 1000) / 1000);

  // Prominence & Scope
  const prominence = primary === "MARKET" ? 0.9 : (UNIVERSE.find(u => u.ticker === primary)?.prominence || 0.7);
  const scope = primary === "MARKET" ? 1.0 : 0.8;

  // Impact
  const impactRes = scoreImpact({
    eventType: eventRes.eventType,
    sentiment,
    text,
    reliability,
    scope,
    prominence
  });

  return {
    signal_id: `sig-adhoc-${Date.now()}`,
    doc_id: `doc-${Date.now()}`,
    timestamp: new Date().toISOString(),
    source_type: sourceType,
    source_name: sourceName,
    headline: text,
    entities,
    primary_entity: primary,
    sentiment_score: sentiment,
    sentiment_label: label,
    event_type: eventRes.eventType,
    impact_score: impactRes.score,
    event_confidence: eventRes.confidence,
    impact_band: impactRes.band,
    reliability,
    corroboration,
    drivers: {
      sentiment_terms: sentimentRes.terms,
      event_evidence: eventRes.evidence,
      event_scores: eventRes.scores,
      magnitude: { usd_millions: 0, pct: 0, bps: 0 },
      impact_components: impactRes.components,
      credibility: Math.round(cred * 100) / 100,
      certainty
    },
    model_version: "riskpulse-lexicon-rules-1.0:vader+finlex",
    synthetic: true
  };
}
