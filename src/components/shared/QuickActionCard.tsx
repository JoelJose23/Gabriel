import type { FC } from 'react';
import { Link } from 'react-router-dom';
import type { ComponentType } from 'react';
import {
  MessageSquare,
  Image,
  Mic,
  Box,
  Download,
  Activity,
  Settings,
  FileText,
} from 'lucide-react';

const iconMap: Record<string, ComponentType<{ size?: number; strokeWidth?: number }>> = {
  MessageSquare,
  Image,
  Mic,
  Box,
  Download,
  Activity,
  Settings,
  FileText,
};

function resolveIcon(icon: string | ComponentType<{ size?: number; strokeWidth?: number }>) {
  if (typeof icon === 'string') {
    return iconMap[icon] || MessageSquare;
  }
  return icon;
}

interface QuickActionCardProps {
  icon: string | ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  description: string;
  route: string;
  color: 'primary' | 'secondary' | 'tertiary';
  className?: string;
}

const iconBgColors = {
  primary: 'bg-[#1F60FF]/15',
  secondary: 'bg-[#3FA76B]/15',
  tertiary: 'bg-[var(--color-hover)]',
};

const iconTextColors = {
  primary: 'text-primary',
  secondary: 'text-secondary',
  tertiary: 'text-text-secondary',
};

export const QuickActionCard: FC<QuickActionCardProps> = ({
  icon,
  label,
  description,
  route,
  color,
  className = '',
}) => {
  const Icon = resolveIcon(icon);
  return (
    <Link
      to={route}
      className={`bg-[#171717] border border-[#333333] p-5 hover:-translate-y-1 hover:border-[#424242] transition-all duration-200 flex flex-col justify-between group cursor-pointer ${className}`}
    >
      <div className="space-y-3 relative z-10">
        <div className={`inline-flex items-center justify-center rounded-xl p-3 ${iconBgColors[color]} ${iconTextColors[color]} transition-transform group-hover:scale-105`}>
          <Icon size={24} strokeWidth={2} />
        </div>
        <div>
          <h4 className="font-semibold text-text-primary text-base">{label}</h4>
          <p className="muted-text mt-1 text-text-secondary">{description}</p>
        </div>
      </div>
    </Link>
  );
};
