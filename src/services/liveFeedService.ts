// Live Ingestion Feed Service for Foreshock
import { analyzeDocument, RiskSignal } from './nlpEngine';

export interface LiveFeedItem {
  id: string;
  title: string;
  source: string;
  sourceType: 'news' | 'social';
  timestamp: string;
  followers?: number;
  verified?: boolean;
}

// Realistic live market bulletins across asset classes and entities
const LIVE_WIRE_TEMPLATES: Array<{
  title: string;
  source: string;
  sourceType: 'news' | 'social';
  followers?: number;
  verified?: boolean;
}> = [
  {
    title: "US Treasury yields retreat 6 bp as core wholesale inflation prints lower than consensus expectations",
    source: "Bloomberg Wire",
    sourceType: "news",
  },
  {
    title: "Crude oil rallies 4.2% following maritime safety warning in Gulf of Aden tanker route",
    source: "Reuters Financial",
    sourceType: "news",
  },
  {
    title: "$NVDA supply chain partners in Taiwan report elevated semiconductor order volumes ahead of Q3 cycle",
    source: "X MarketPulse",
    sourceType: "social",
    followers: 48200,
    verified: true,
  },
  {
    title: "European Central Bank policymaker signals readiness to pause rate adjustments amid softening industrial output",
    source: "Financial Times",
    sourceType: "news",
  },
  {
    title: "Regional lender Pacific Horizon notes stable deposit bases following quarterly liquidity audit",
    source: "Dow Jones Wire",
    sourceType: "news",
  },
  {
    title: "Major port terminal operators report union agreement reached, averting East Coast freight disruption",
    source: "AP Markets",
    sourceType: "news",
  },
  {
    title: "$TSLA vehicle delivery figures in Europe exceed Q3 consensus forecasts by 8.4%",
    source: "X TechTraders",
    sourceType: "social",
    followers: 19500,
    verified: true,
  },
  {
    title: "Federal Reserve chair emphasizes cautious, data-dependent trajectory during monetary conference",
    source: "Bloomberg Wire",
    sourceType: "news",
  },
  {
    title: "Pacific Meridian Bank files for bankruptcy protection after deposit run, regulators step in",
    source: "Financial Times",
    sourceType: "news",
  },
  {
    title: "Goldman Sachs upgrades industrial equipment sector to overweight citing infrastructure capital spend",
    source: "Reuters Financial",
    sourceType: "news",
  },
  {
    title: "Cybersecurity agency issues security bulletin regarding cloud configuration vulnerabilities in fintech sector",
    source: "Wall Street Journal",
    sourceType: "news",
  },
  {
    title: "$MSFT cloud infrastructure division secures multi-billion enterprise intelligence partnership with global bank",
    source: "CNBC Markets",
    sourceType: "news",
  },
  {
    title: "$AAPL suppliers report assembly ramp ahead of upcoming generative AI hardware reveal",
    source: "Bloomberg Wire",
    sourceType: "news",
  },
  {
    title: "Commercial real estate loan delinquency rates tick up 18 bp among suburban office properties",
    source: "Dow Jones Wire",
    sourceType: "news",
  },
  {
    title: "Global container shipping spot rates fall 3.5% as transpacific vessel capacity normalizes",
    source: "Financial Times",
    sourceType: "news",
  },
  {
    title: "$JPM reports robust net interest income margin expansion in latest wholesale balance sheet commentary",
    source: "Dow Jones Wire",
    sourceType: "news",
  },
  {
    title: "Semiconductor equipment bookings surge 12% quarter-on-quarter led by advanced packaging demand",
    source: "Bloomberg Wire",
    sourceType: "news",
  },
  {
    title: "Commercial paper spreads tighten 4 bp across Tier-1 non-financial corporate issuers",
    source: "Reuters Financial",
    sourceType: "news",
  },
  {
    title: "Department of Justice antitrust division initiates preliminary inquiry into enterprise cloud bundling practices",
    source: "Wall Street Journal",
    sourceType: "news",
  },
  {
    title: "$XOM announces deepwater discovery in offshore basin, estimated at 400M recoverable barrels",
    source: "Reuters Financial",
    sourceType: "news",
  },
  {
    title: "OPEC+ delegates confirm technical compliance review remains on track ahead of ministerial summit",
    source: "Bloomberg Wire",
    sourceType: "news",
  },
  {
    title: "Retail sales volume advances 0.4% month-on-month, signaling sustained consumer balance sheet resilience",
    source: "CNBC Markets",
    sourceType: "news",
  },
  {
    title: "$AMZN logistics division deploys autonomous fulfillment robotics across 14 regional distribution hubs",
    source: "Dow Jones Wire",
    sourceType: "news",
  },
  {
    title: "Rating agency places speculative-grade automotive parts supplier on review for downgrade",
    source: "Reuters Financial",
    sourceType: "news",
  },
];

// Helper to decode XML and HTML character entities
export function decodeXmlEntities(text: string): string {
  return text
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&#(\d+);/g, (_, dec) => {
      try {
        return String.fromCharCode(parseInt(dec, 10));
      } catch {
        return '';
      }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try {
        return String.fromCharCode(parseInt(hex, 16));
      } catch {
        return '';
      }
    })
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lsquo;|&rsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

// Helper to parse RSS XML items
export function parseRssText(rssXml: string, sourceName = 'CNBC Live'): Array<{ title: string; timestamp: string }> {
  const items: Array<{ title: string; timestamp: string }> = [];
  const matches = [...rssXml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
  for (const m of matches) {
    const raw = m[1];
    const rawTitle = raw.match(/<title>(.*?)<\/title>/)?.[1] || '';
    const pubDate = raw.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';
    const cleanTitle = decodeXmlEntities(rawTitle);

    if (cleanTitle && cleanTitle.length > 10) {
      let isoDate = new Date().toISOString();
      if (pubDate) {
        try {
          const parsed = new Date(pubDate);
          if (!isNaN(parsed.getTime())) {
            isoDate = parsed.toISOString();
          }
        } catch {
          // fallback to now
        }
      }
      items.push({ title: cleanTitle, timestamp: isoDate });
    }
  }
  return items;
}

// In-memory live store
class LiveFeedStore {
  private signals: RiskSignal[] = [];
  private lastFetchTime: number = 0;
  private templateIndex: number = 0;

  constructor() {
    this.initializeDefaultLiveSignals();
  }

  // Pre-seed live store with recently analyzed real-time articles
  private initializeDefaultLiveSignals() {
    const now = Date.now();
    const seededSignals: RiskSignal[] = [];

    // Seed 15 recent items spaced across the last few hours
    LIVE_WIRE_TEMPLATES.slice(0, 15).forEach((tmpl, i) => {
      const itemTimestamp = new Date(now - (i * 12 * 60 * 1000) - 25000).toISOString();
      const signal = analyzeDocument({
        text: tmpl.title,
        source_type: tmpl.sourceType,
        source_name: tmpl.source,
        followers: tmpl.followers,
        verified: tmpl.verified,
      });
      signal.timestamp = itemTimestamp;
      signal.signal_id = `sig-live-${now - i * 1000}`;
      seededSignals.push(signal);
    });

    // Ensure sorted newest first
    seededSignals.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    this.signals = seededSignals;
    this.lastFetchTime = now;
  }

  public getSignals(): RiskSignal[] {
    return [...this.signals];
  }

  public setSignals(signals: RiskSignal[]): void {
    this.signals = [...signals].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 150);
    this.lastFetchTime = Date.now();
  }

  public getLastFetchTime(): number {
    return this.lastFetchTime;
  }

  // Ingest external RSS or custom items
  public ingestItems(items: Array<{ title: string; source?: string; sourceType?: 'news' | 'social'; timestamp?: string }>): RiskSignal[] {
    const newSignals: RiskSignal[] = [];
    const now = new Date().toISOString();

    for (const item of items) {
      const cleaned = item.title.trim();
      if (!cleaned) continue;

      // Check if already in ledger
      const existing = this.signals.some(s => s.headline.toLowerCase().trim() === cleaned.toLowerCase().trim());
      if (existing) continue;

      const sig = analyzeDocument({
        text: cleaned,
        source_type: item.sourceType || 'news',
        source_name: item.source || 'Financial Wire',
      });
      sig.timestamp = item.timestamp || now;
      sig.signal_id = `sig-live-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
      newSignals.push(sig);
    }

    if (newSignals.length > 0) {
      this.signals = [...newSignals, ...this.signals]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 150);
      this.lastFetchTime = Date.now();
    }

    return newSignals;
  }

  // Generate and append the next streaming headline (for continuous live ticker simulation)
  public streamNextItem(): RiskSignal {
    const tmpl = LIVE_WIRE_TEMPLATES[this.templateIndex % LIVE_WIRE_TEMPLATES.length];
    this.templateIndex++;

    const sig = analyzeDocument({
      text: tmpl.title,
      source_type: tmpl.sourceType,
      source_name: tmpl.source,
      followers: tmpl.followers,
      verified: tmpl.verified,
    });
    sig.timestamp = new Date().toISOString();
    sig.signal_id = `sig-live-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    this.signals = [sig, ...this.signals]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 150);
    this.lastFetchTime = Date.now();
    return sig;
  }
}

export const liveFeedStore = new LiveFeedStore();
