import React from 'react';
import { Sliders, Zap, Database } from 'lucide-react';
import { ForeshockLogo } from './ForeshockLogo';

export interface AppConfig {
  mode: 'replay' | 'live';
  stressThreshold: number;
  tiltLambda: number;
  halfLifeMinutes: number;
  maxWeight: number;
  deadbandBp: number;
  maxTurnover: number;
  intervalMinutes: number;
}

interface SidebarProps {
  config: AppConfig;
  onChange: (cfg: Partial<AppConfig>) => void;
  isOpen: boolean;
  onToggle: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ config, onChange, isOpen, onToggle }) => {
  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={onToggle}
        />
      )}

      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-72 bg-white border-r border-[#DCE3E5] p-5 overflow-y-auto transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:h-auto lg:min-h-screen ${
          isOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full'
        }`}
      >
        {/* App Branding */}
        <div className="flex items-center justify-between pb-4 border-b border-[#DCE3E5] mb-5">
          <div className="flex items-center gap-2.5">
            <div className="bg-[#0B0F19] p-1.5 rounded-xl border border-[#1E293B] shadow-sm flex items-center justify-center">
              <ForeshockLogo className="w-6 h-6" />
            </div>
            <div>
              <div className="font-bold text-lg leading-none text-[#0B2B33]">Foreshock</div>
              <div className="text-[11px] text-[#4A5E66] mt-0.5">Quantitative Risk Engine</div>
            </div>
          </div>
          <button
            onClick={onToggle}
            className="lg:hidden text-[#4A5E66] hover:text-[#0B2B33] p-1"
          >
            ✕
          </button>
        </div>

        {/* Section Header */}
        <div className="flex items-center gap-2 font-bold text-[#0B2B33] text-sm mb-4">
          <Sliders className="w-4 h-4 text-[#0B2B33]" />
          <span>Model Parameters</span>
        </div>

        {/* Data Source */}
        <div className="mb-6">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#0B2B33] uppercase tracking-wider mb-2">
            <Database className="w-3.5 h-3.5" />
            Data Ingestion
          </div>
          <div className="space-y-1.5 text-sm">
            <label className="flex items-center gap-2 cursor-pointer p-2 rounded-md hover:bg-[#F3F6F6] text-[#0B2B33]">
              <input
                type="radio"
                name="datasource"
                value="replay"
                checked={config.mode === 'replay'}
                onChange={() => onChange({ mode: 'replay' })}
                className="accent-[#0B2B33]"
              />
              <span>1-Week Replay Stream (Synthetic)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer p-2 rounded-md hover:bg-[#F3F6F6] text-[#4A5E66]">
              <input
                type="radio"
                name="datasource"
                value="live"
                checked={config.mode === 'live'}
                onChange={() => onChange({ mode: 'live' })}
                className="accent-[#1E9E78]"
              />
              <div className="flex items-center justify-between flex-1">
                <span className={config.mode === 'live' ? 'font-semibold text-[#0B2B33]' : ''}>Live Ingestion Feed</span>
                {config.mode === 'live' && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-[#1E9E78] font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#1E9E78] animate-pulse"></span>
                    ACTIVE
                  </span>
                )}
              </div>
            </label>
          </div>
        </div>

        {/* Stress-Test Trigger */}
        <div className="mb-6 border-t border-[#DCE3E5] pt-5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#0B2B33] uppercase tracking-wider">
              <Zap className="w-3.5 h-3.5 text-[#E4572E]" />
              Automated Stress Trigger
            </div>
            <span className="font-mono text-xs font-bold px-2 py-0.5 bg-[#F3F6F6] border border-[#DCE3E5] rounded">
              &gt; {config.stressThreshold.toFixed(1)}
            </span>
          </div>
          <label className="block text-xs text-[#4A5E66] mb-1">
            Automated execution threshold (Impact &gt; 7.0)
          </label>
          <input
            type="range"
            min="5.0"
            max="9.5"
            step="0.1"
            value={config.stressThreshold}
            onChange={(e) => onChange({ stressThreshold: parseFloat(e.target.value) })}
            className="w-full accent-[#E4572E] cursor-pointer"
          />
        </div>

        {/* Module A Parameters */}
        <div className="mb-6 border-t border-[#DCE3E5] pt-5">
          <div className="text-xs font-bold text-[#0B2B33] uppercase tracking-wider mb-4">
            Module A: Tactical Constraints
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[#4A5E66]">Sentiment Tilt Sensitivity (λ)</span>
                <span className="font-mono font-semibold">{config.tiltLambda.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min="0.2"
                max="3.0"
                step="0.1"
                value={config.tiltLambda}
                onChange={(e) => onChange({ tiltLambda: parseFloat(e.target.value) })}
                className="w-full accent-[#0B2B33] cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[#4A5E66]">Signal Half-Life (Decay)</span>
                <span className="font-mono font-semibold">{config.halfLifeMinutes} min</span>
              </div>
              <input
                type="range"
                min="30"
                max="720"
                step="30"
                value={config.halfLifeMinutes}
                onChange={(e) => onChange({ halfLifeMinutes: parseInt(e.target.value) })}
                className="w-full accent-[#0B2B33] cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[#4A5E66]">Asset Concentration Cap</span>
                <span className="font-mono font-semibold">{(config.maxWeight * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min="0.06"
                max="0.20"
                step="0.01"
                value={config.maxWeight}
                onChange={(e) => onChange({ maxWeight: parseFloat(e.target.value) })}
                className="w-full accent-[#0B2B33] cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[#4A5E66]">Rebalancing Dead-Band Filter</span>
                <span className="font-mono font-semibold">{config.deadbandBp} bp</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={config.deadbandBp}
                onChange={(e) => onChange({ deadbandBp: parseInt(e.target.value) })}
                className="w-full accent-[#0B2B33] cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[#4A5E66]">One-Way Turnover Cap / Step</span>
                <span className="font-mono font-semibold">{(config.maxTurnover * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min="0.01"
                max="0.20"
                step="0.01"
                value={config.maxTurnover}
                onChange={(e) => onChange({ maxTurnover: parseFloat(e.target.value) })}
                className="w-full accent-[#0B2B33] cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[#4A5E66]">Rebalancing Cadence</span>
                <span className="font-mono font-semibold">{config.intervalMinutes} min</span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                {[15, 30, 60].map((mins) => (
                  <button
                    key={mins}
                    onClick={() => onChange({ intervalMinutes: mins })}
                    className={`py-1 text-xs font-semibold rounded border transition-colors ${
                      config.intervalMinutes === mins
                        ? 'bg-[#0B2B33] text-white border-[#0B2B33]'
                        : 'bg-white text-[#4A5E66] border-[#DCE3E5] hover:bg-[#F3F6F6]'
                    }`}
                  >
                    {mins}m
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
