import type { FC } from 'react';
import { NavLink, Link } from 'react-router-dom';
import logo from '../../assets/GABRIEL_LOGO.png';
import { SliconIcon } from '../shared';
import type { SliconName } from '../shared';

const navItems: { path: string; label: string; icon: SliconName }[] = [
  { path: '/', label: 'Home', icon: 'home' },
  { path: '/chat', label: 'Chat', icon: 'chat' },
  { path: '/image', label: 'Image', icon: 'image' },
  { path: '/voice', label: 'Voice', icon: 'voice' },
  { path: '/models', label: 'Models', icon: 'models' },
  { path: '/system', label: 'System', icon: 'system' },
  { path: '/settings', label: 'Settings', icon: 'settings' },
];

export const Sidebar: FC = () => {
  return (
    <aside className="w-[200px] flex-shrink-0 h-full flex flex-col justify-between p-3 select-none">
      {/* Floating Glass Navigation Shelf */}
      <div className="flex-1 glass-floating aurora-glass flex flex-col p-3 space-y-4">
        {/* Brand Logo & Name */}
        <Link
          to="/"
          className="flex items-center gap-3 px-2 py-1.5 rounded-xl hover:bg-[var(--color-hover)] transition-all group"
        >
          <img
            src={logo}
            alt="Gabriel AI"
            className="h-8 w-8 object-contain flex-shrink-0 transition-transform group-hover:scale-105"
          />
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-sm text-text-primary leading-tight tracking-tight">
              Gabriel
            </span>
            <span className="text-[9px] font-semibold text-text-secondary uppercase tracking-widest">
              Local Engine
            </span>
          </div>
        </Link>

        <div className="w-full h-px bg-[var(--color-border)]" />

        {/* Core Navigation Items */}
        <nav className="flex-1 space-y-1.5" role="navigation" aria-label="Main navigation">
          {navItems.map(({ path, label, icon }) => (
            <NavLink
              key={path}
              to={path}
              end={path === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 cursor-pointer ${
                  isActive
                    ? 'bg-[var(--color-primary-bg)] text-primary shadow-xs font-bold'
                    : 'text-text-secondary hover:bg-[var(--color-hover)] hover:text-text-primary'
                }`
              }
            >
              <SliconIcon name={icon} size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Bottom Bar Controls */}
        <div className="pt-2.5 border-t border-[var(--color-border)] flex items-center justify-center px-1">
          <span className="text-[10px] font-mono text-text-secondary font-semibold tracking-wider">
            v1.2.3 · LOCAL
          </span>
        </div>
      </div>
    </aside>
  );
};