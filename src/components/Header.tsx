import React from 'react';
import { ForeshockLogo } from './ForeshockLogo';

interface HeaderProps {
  mode: 'replay' | 'live';
}

export const Header: React.FC<HeaderProps> = ({ mode }) => {
  return (
    <header className="border-b-2 border-[#0B2B33] pb-3 mb-5 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3">
      <div>
        <div className="flex items-center gap-3">
          <div className="bg-[#0B0F19] p-1.5 rounded-xl border border-[#1E293B] shadow-sm flex items-center justify-center">
            <ForeshockLogo className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-[#0B2B33]">Foreshock</h1>
          </div>
        </div>
        <div className="text-sm sm:text-base text-[#4A5E66] mt-1">
          Real-time unstructured text intelligence for tactical index rebalancing and event-driven portfolio stress testing
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold tracking-wider uppercase text-white shadow-xs ${
            mode === 'live' ? 'bg-[#1E9E78]' : 'bg-[#0B2B33]'
          }`}
        >
          {mode === 'live' && <span className="w-2 h-2 rounded-full bg-white animate-pulse" />}
          {mode === 'live' ? 'LIVE INGESTION FEED' : '1-WEEK MARKET REPLAY'}
        </span>
      </div>
    </header>
  );
};
