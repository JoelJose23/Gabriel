import type { FC } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { SystemMonitor } from './SystemMonitor';
import { GlobalGradients } from '../../components/shared';
import { useGlobalShortcuts } from '../../hooks/useGlobalShortcuts';

export const AppShell: FC = () => {
  useGlobalShortcuts();

  return (
    <>
      <GlobalGradients />
      <div className="relative flex h-screen overflow-hidden bg-[var(--color-cream)] font-sans antialiased text-text-primary">
        {/* Floating Sidebar Container */}
        <div className="relative z-20 py-3 pl-3">
          <Sidebar />
        </div>

        {/* Main Content Area */}
        <main className="relative z-10 flex-1 flex flex-col overflow-hidden min-w-0 bg-transparent">
          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            <Outlet />
          </div>
        </main>

        {/* Right Telemetry Column */}
        <aside className="relative z-20 w-[260px] flex-shrink-0 h-full aurora-glass overflow-y-auto p-4">
          <SystemMonitor />
        </aside>
      </div>
    </>
  );
};