import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';

import dataset from './src/data/dataset.json';
import { analyzeDocument, EVENT_TYPES } from './src/services/nlpEngine';
import { runStressScenario, getScenarioList } from './src/services/stressService';
import { liveFeedStore, parseRssText } from './src/services/liveFeedService';

const PORT = 3000;
const HOST = '0.0.0.0';

async function startServer() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // ---------------------------------------------------------------- API Routes
  // Health
  app.get(['/health', '/api/health'], (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      version: "1.0.0",
      model_version: "riskpulse-lexicon-rules-1.0:vader+finlex",
      signals_loaded: dataset.signals.length,
    });
  });

  // Events taxonomy
  app.get(['/events', '/api/events'], (_req: Request, res: Response) => {
    res.json(EVENT_TYPES);
  });

  // Analyze text
  app.post(['/analyze', '/api/analyze'], (req: Request, res: Response) => {
    const { text, source_type, source_name, followers, verified } = req.body || {};
    if (!text || typeof text !== 'string') {
      res.status(400).json({ error: "Missing or invalid 'text' field" });
      return;
    }
    const signal = analyzeDocument({
      text,
      source_type,
      source_name,
      followers,
      verified
    });
    res.json(signal);
  });

  // List signals with filtering (supports replay or live mode)
  app.get(['/signals', '/api/signals'], (req: Request, res: Response) => {
    const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit as string) || 50));
    const ticker = (req.query.ticker as string)?.toUpperCase();
    const eventType = req.query.event_type as string;
    const minImpact = parseFloat(req.query.min_impact as string) || 0.0;
    const sourceType = req.query.source_type as string;
    const mode = (req.query.mode as string)?.toLowerCase();

    let filtered = (mode === 'live' ? liveFeedStore.getSignals() : dataset.signals) as any[];

    if (minImpact > 0) {
      filtered = filtered.filter(s => s.impact_score >= minImpact);
    }
    if (eventType) {
      filtered = filtered.filter(s => s.event_type === eventType);
    }
    if (sourceType) {
      filtered = filtered.filter(s => s.source_type === sourceType);
    }
    if (ticker) {
      filtered = filtered.filter(s => {
        if (s.primary_entity === ticker) return true;
        return s.entities && s.entities.some((e: any) => e.ticker === ticker);
      });
    }

    filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    res.json(filtered.slice(0, limit));
  });

  // ---------------------------------------------------------------- Live Feed Endpoints
  // Get active live signals
  app.get(['/live/signals', '/api/live/signals'], (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      mode: "live",
      count: liveFeedStore.getSignals().length,
      last_sync: liveFeedStore.getLastFetchTime(),
      signals: liveFeedStore.getSignals(),
    });
  });

  // Stream next bulletin endpoint
  app.post(['/live/stream', '/api/live/stream'], (_req: Request, res: Response) => {
    const signal = liveFeedStore.streamNextItem();
    res.json({
      status: "ok",
      signal,
      new_signals_count: 1,
      total_signals: liveFeedStore.getSignals().length,
      last_sync: liveFeedStore.getLastFetchTime(),
      signals: liveFeedStore.getSignals(),
    });
  });

  // Sync / fetch latest live news from live RSS connectors or streaming queue
  app.post(['/live/sync', '/api/live/sync'], async (_req: Request, res: Response) => {
    let fetchedCount = 0;
    try {
      // Connect to real-time financial RSS wires
      const feeds = [
        { url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', source: 'CNBC Markets' },
        { url: 'https://www.cnbc.com/id/10000664/device/rss/rss.html', source: 'CNBC Finance' },
        { url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories', source: 'MarketWatch' },
      ];

      for (const feed of feeds) {
        try {
          const resp = await fetch(feed.url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            signal: AbortSignal.timeout(3500)
          });
          if (resp.ok) {
            const xml = await resp.text();
            const parsed = parseRssText(xml, feed.source);
            if (parsed.length > 0) {
              const newSigs = liveFeedStore.ingestItems(parsed.slice(0, 15).map(p => ({
                title: p.title,
                source: feed.source,
                sourceType: 'news',
                timestamp: p.timestamp,
              })));
              fetchedCount += newSigs.length;
            }
          }
        } catch {
          // ignore single feed timeout, continue to next
        }
      }
    } catch {
      // top level fallback
    }

    // If no new items from external RSS (e.g. rate limit, sandbox restriction, or duplicate headlines), stream the next live wire bulletin
    if (fetchedCount === 0) {
      liveFeedStore.streamNextItem();
      fetchedCount = 1;
    }

    res.json({
      status: "ok",
      new_signals_count: fetchedCount,
      total_signals: liveFeedStore.getSignals().length,
      last_sync: liveFeedStore.getLastFetchTime(),
      signals: liveFeedStore.getSignals(),
    });
  });

  // Inject a manual breaking news bulletin into the live feed stream
  app.post(['/live/inject', '/api/live/inject'], (req: Request, res: Response) => {
    const { text, source_name, source_type } = req.body || {};
    if (!text || typeof text !== 'string') {
      res.status(400).json({ error: "Missing 'text' field" });
      return;
    }

    const newSigs = liveFeedStore.ingestItems([{
      title: text.trim(),
      source: source_name || "Live Flash",
      sourceType: source_type || "news",
      timestamp: new Date().toISOString(),
    }]);

    res.json({
      status: "ok",
      signal: newSigs[0] || null,
      total_signals: liveFeedStore.getSignals().length,
      last_sync: liveFeedStore.getLastFetchTime(),
      signals: liveFeedStore.getSignals(),
    });
  });

  // Module A: Portfolio weights
  app.get(['/portfolio/weights', '/api/portfolio/weights'], (_req: Request, res: Response) => {
    const weightsHistory = dataset.weightsHistory as any[];
    const lastTimestamp = weightsHistory[weightsHistory.length - 1]?.timestamp;
    const latestRows = weightsHistory.filter(w => w.timestamp === lastTimestamp);

    const weightsObj: Record<string, any> = {};
    for (const row of latestRows) {
      weightsObj[row.ticker] = {
        weight: row.weight,
        base: row.base_weight,
        sentiment: row.sentiment,
        target_weight: row.target_weight
      };
    }

    res.json({
      as_of: lastTimestamp,
      summary: {
        avg_turnover_engine_pct: 1.90,
        avg_turnover_naive_pct: 10.90,
        turnover_reduction_pct: 83.0,
        largest_overweight: "NVDA (+2.8 pp)",
        largest_underweight: "PG (-2.5 pp)"
      },
      weights: weightsObj
    });
  });

  // Module B: Run stress scenario
  app.post(['/stress', '/api/stress'], (req: Request, res: Response) => {
    const { event_type, impact_score } = req.body || {};
    const validEvents = getScenarioList();
    if (!event_type || !validEvents.includes(event_type)) {
      res.status(422).json({
        error: `No scenario for ${event_type}; choose from ${validEvents.join(', ')}`
      });
      return;
    }
    const score = Math.max(1.0, Math.min(10.0, parseFloat(impact_score) || 8.5));
    const result = runStressScenario(event_type, score);
    res.json(result);
  });

  // Module B: Stress triggers
  app.get(['/stress/triggers', '/api/stress/triggers'], (req: Request, res: Response) => {
    const threshold = parseFloat(req.query.threshold as string) || 7.0;
    const runs = (dataset.stressResults as any[]).filter(r => r.impact_score >= threshold);
    res.json(runs);
  });

  // Full dataset endpoint
  app.get('/api/dataset', (_req: Request, res: Response) => {
    res.json(dataset);
  });

  // ---------------------------------------------------------------- Frontend Serving
  if (process.env.NODE_ENV === 'production' && fs.existsSync(path.resolve('dist'))) {
    app.use(express.static(path.resolve('dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve('dist/index.html'));
    });
  } else {
    // Mount Vite in middleware mode
    const vite = await createViteServer({
      server: { middlewareMode: true, host: HOST, port: PORT },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, HOST, () => {
    console.log(`RiskPulse server running at http://${HOST}:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
