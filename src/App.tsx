import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { Sidebar, AppConfig } from './components/Sidebar';
import { TabSignals } from './components/TabSignals';
import { TabRebalancer } from './components/TabRebalancer';
import { TabStress } from './components/TabStress';
import { TabMethodology } from './components/TabMethodology';
import { ForeshockLogo } from './components/ForeshockLogo';
import { Menu, Activity, Sliders, ShieldAlert, Cpu } from 'lucide-react';
import dataset from './data/dataset.json';
import { RiskSignal } from './services/nlpEngine';
import { liveFeedStore } from './services/liveFeedService';

const initialConfig: AppConfig = {
  mode: 'replay',
  stressThreshold: 7.0,
  tiltLambda: 1.2,
  halfLifeMinutes: 240,
  maxWeight: 0.10,
  deadbandBp: 25,
  maxTurnover: 0.04,
  intervalMinutes: 30,
};

const tabs = [
  { id: 'signals', label: 'Risk Signals & Intelligence' },
  { id: 'rebalancer', label: 'Tactical Rebalancer (Module A)' },
  { id: 'stress', label: 'Strategic Stress Testing (Module B)' },
  { id: 'methodology', label: 'Methodology & Architecture' },
] as const;

type TabId = typeof tabs[number]['id'];

export const App: React.FC = () => {
  const [config, setConfig] = useState<AppConfig>(initialConfig);
  const [activeTab, setActiveTab] = useState<TabId>('signals');
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);

  // Live Ingestion Feed State
  const [liveSignals, setLiveSignals] = useState<RiskSignal[]>(() => liveFeedStore.getSignals());
  const [isSyncingLive, setIsSyncingLive] = useState<boolean>(false);
  const [lastLiveSync, setLastLiveSync] = useState<number>(() => liveFeedStore.getLastFetchTime());
  const [autoSyncEnabled, setAutoSyncEnabled] = useState<boolean>(true);

  const handleConfigChange = (partial: Partial<AppConfig>) => {
    setConfig(prev => ({ ...prev, ...partial }));
  };

  // Sync latest live news from backend RSS or streaming generator
  const handleSyncLiveFeed = useCallback(async () => {
    setIsSyncingLive(true);
    try {
      const resp = await fetch('/api/live/sync', { method: 'POST' });
      if (resp.ok) {
        const data = await resp.json();
        if (data.signals && Array.isArray(data.signals) && data.signals.length > 0) {
          const sorted = [...data.signals].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          setLiveSignals(sorted);
          liveFeedStore.setSignals(sorted);
          setLastLiveSync(data.last_sync || Date.now());
          setIsSyncingLive(false);
          return;
        }
      }
    } catch {
      // Backend request fallback to client-side stream generator
    }

    // Client fallback: stream next live wire item
    liveFeedStore.streamNextItem();
    const sorted = [...liveFeedStore.getSignals()].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    setLiveSignals(sorted);
    setLastLiveSync(Date.now());
    setIsSyncingLive(false);
  }, []);

  // Stream next live wire bulletin
  const handleStreamNextLiveItem = useCallback(async () => {
    setIsSyncingLive(true);
    try {
      const resp = await fetch('/api/live/stream', { method: 'POST' });
      if (resp.ok) {
        const data = await resp.json();
        if (data.signals && Array.isArray(data.signals) && data.signals.length > 0) {
          const sorted = [...data.signals].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          setLiveSignals(sorted);
          liveFeedStore.setSignals(sorted);
          setLastLiveSync(data.last_sync || Date.now());
          setIsSyncingLive(false);
          return;
        }
      }
    } catch {
      // Client fallback
    }

    liveFeedStore.streamNextItem();
    const sorted = [...liveFeedStore.getSignals()].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    setLiveSignals(sorted);
    setLastLiveSync(Date.now());
    setIsSyncingLive(false);
  }, []);

  // Inject a custom live bulletin
  const handleInjectLiveItem = useCallback(async (text: string, source: string, sourceType: 'news' | 'social') => {
    setIsSyncingLive(true);
    try {
      const resp = await fetch('/api/live/inject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, source_name: source, source_type: sourceType })
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.signals && Array.isArray(data.signals) && data.signals.length > 0) {
          const sorted = [...data.signals].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          setLiveSignals(sorted);
          liveFeedStore.setSignals(sorted);
          setLastLiveSync(data.last_sync || Date.now());
          setIsSyncingLive(false);
          return;
        }
      }
    } catch {
      // Client fallback
    }

    liveFeedStore.ingestItems([{ title: text, source, sourceType }]);
    const sorted = [...liveFeedStore.getSignals()].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    setLiveSignals(sorted);
    setLastLiveSync(Date.now());
    setIsSyncingLive(false);
  }, []);

  // Immediately refresh feeds whenever switching into 'live' mode
  useEffect(() => {
    if (config.mode === 'live') {
      handleSyncLiveFeed();
    }
  }, [config.mode, handleSyncLiveFeed]);

  // Periodic polling / auto-sync effect when in live ingestion mode
  useEffect(() => {
    if (config.mode !== 'live' || !autoSyncEnabled) return;

    const interval = setInterval(() => {
      handleSyncLiveFeed();
    }, 20000);

    return () => clearInterval(interval);
  }, [config.mode, autoSyncEnabled, handleSyncLiveFeed]);

  const replaySignals = (dataset.signals || []) as unknown as RiskSignal[];
  const activeSignals = config.mode === 'live' ? liveSignals : replaySignals;

  return (
    <div className="min-h-screen bg-[#F3F6F6] text-[#0B2B33] flex flex-col">
      {/* Top Mobile Bar */}
      <div className="lg:hidden bg-white border-b border-[#DCE3E5] px-4 py-3 flex items-center justify-between sticky top-0 z-30 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="bg-[#0B0F19] p-1 rounded-lg border border-[#1E293B] shadow-xs flex items-center justify-center">
            <ForeshockLogo className="w-5 h-5" />
          </div>
          <span className="font-bold text-lg text-[#0B2B33]">Foreshock</span>
        </div>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-1.5 rounded-md hover:bg-[#F3F6F6] text-[#4A5E66] hover:text-[#0B2B33]"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 flex max-w-[1600px] w-full mx-auto">
        {/* Sidebar */}
        <Sidebar
          config={config}
          onChange={handleConfigChange}
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
        />

        {/* Main Content Area */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-full overflow-hidden">
          {/* Header */}
          <Header mode={config.mode} />

          {/* Navigation Tabs */}
          <div className="flex border-b border-[#DCE3E5] gap-2 overflow-x-auto mb-6 text-sm">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-2.5 px-4 font-semibold whitespace-nowrap border-b-2 transition-all cursor-pointer ${
                    isActive
                      ? 'border-[#0B2B33] text-[#0B2B33]'
                      : 'border-transparent text-[#4A5E66] hover:text-[#0B2B33] hover:border-[#DCE3E5]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Active Tab Content */}
          <div className="pb-12">
            {activeTab === 'signals' && (
              <TabSignals
                signals={activeSignals}
                stressThreshold={config.stressThreshold}
                mode={config.mode}
                onSyncLiveFeed={handleSyncLiveFeed}
                onStreamNextLiveItem={handleStreamNextLiveItem}
                onInjectLiveItem={handleInjectLiveItem}
                isSyncingLive={isSyncingLive}
                lastLiveSync={lastLiveSync}
                autoSyncEnabled={autoSyncEnabled}
                onToggleAutoSync={() => setAutoSyncEnabled(!autoSyncEnabled)}
              />
            )}
            {activeTab === 'rebalancer' && (
              <TabRebalancer
                tiltLambda={config.tiltLambda}
                halfLifeMinutes={config.halfLifeMinutes}
                maxWeight={config.maxWeight}
                deadbandBp={config.deadbandBp}
                maxTurnover={config.maxTurnover}
                appMode={config.mode}
                signals={activeSignals}
                onSyncLiveFeed={handleSyncLiveFeed}
                isSyncingLive={isSyncingLive}
              />
            )}
            {activeTab === 'stress' && (
              <TabStress
                stressThreshold={config.stressThreshold}
                appMode={config.mode}
                signals={activeSignals}
              />
            )}
            {activeTab === 'methodology' && (
              <TabMethodology />
            )}
          </div>

          {/* Footer */}
          <footer className="mt-8 pt-6 border-t border-[#DCE3E5] text-xs text-[#4A5E66] leading-relaxed">
            <strong>Regulatory Notice:</strong> Demonstration metrics and scenario figures reflect synthetic data, simulated counterparties, and independent price series to validate execution mechanics and risk sensitivity pipelines. For quantitative evaluation purposes only.
          </footer>
        </main>
      </div>
    </div>
  );
};

export default App;
