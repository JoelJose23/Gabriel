import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface AccentPreset {
  hex: string;
  label: string;
}

export const accentPresets: AccentPreset[] = [
  { hex: '#8B7FE8', label: 'Purple' },
  { hex: '#3FA76B', label: 'Green' },
  { hex: '#E8955A', label: 'Orange' },
  { hex: '#E87FE8', label: 'Magenta' },
  { hex: '#3FA7E8', label: 'Blue' },
  { hex: '#E8A75A', label: 'Amber' },
];

export function hexToRgba(hex: string, alpha: number): string {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) || 0;
  const g = parseInt(cleanHex.substring(2, 4), 16) || 0;
  const b = parseInt(cleanHex.substring(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function hexToRgb(hex: string): string {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) || 0;
  const g = parseInt(cleanHex.substring(2, 4), 16) || 0;
  const b = parseInt(cleanHex.substring(4, 6), 16) || 0;
  return `${r}, ${g}, ${b}`;
}

export function applyAccentColor(hex: string): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const rgba15 = hexToRgba(hex, 0.15);
  const rgba25 = hexToRgba(hex, 0.25);
  const rgba35 = hexToRgba(hex, 0.35);
  const rgb = hexToRgb(hex);

  root.style.setProperty('--color-accent', hex);
  root.style.setProperty('--color-accent-bg', rgba15);
  root.style.setProperty('--color-accent-border', rgba25);
  root.style.setProperty('--color-accent-glow', rgba35);
  root.style.setProperty('--color-accent-rgb', rgb);

  // Sync with --color-primary tokens for unified consistency
  root.style.setProperty('--color-primary', hex);
  root.style.setProperty('--color-primary-bg', rgba15);
  root.style.setProperty('--color-primary-border', rgba25);

  root.setAttribute('data-accent-color', hex);
}

// Immediately apply initial accent color on script load
if (typeof window !== 'undefined') {
  const saved = localStorage.getItem('gabriel_accent_color') || '#8B7FE8';
  applyAccentColor(saved);
}

export interface AccentThemeContextType {
  accentColor: string;
  setAccentColor: (hex: string) => void;
  presets: AccentPreset[];
}

const AccentThemeContext = createContext<AccentThemeContextType | undefined>(undefined);

export const AccentThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [accentColor, setAccentColorState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('gabriel_accent_color');
      if (saved) return saved;
    }
    return '#8B7FE8';
  });

  useEffect(() => {
    applyAccentColor(accentColor);
    if (typeof window !== 'undefined') {
      localStorage.setItem('gabriel_accent_color', accentColor);
    }
  }, [accentColor]);

  const setAccentColor = useCallback((hex: string) => {
    applyAccentColor(hex);
    setAccentColorState(hex);
  }, []);

  return (
    <AccentThemeContext.Provider
      value={{
        accentColor,
        setAccentColor,
        presets: accentPresets,
      }}
    >
      {children}
    </AccentThemeContext.Provider>
  );
};

export function useAccentTheme(): AccentThemeContextType {
  const context = useContext(AccentThemeContext);
  if (!context) {
    // Fallback if accessed outside provider
    const saved = typeof window !== 'undefined' ? localStorage.getItem('gabriel_accent_color') || '#8B7FE8' : '#8B7FE8';
    return {
      accentColor: saved,
      setAccentColor: (hex: string) => applyAccentColor(hex),
      presets: accentPresets,
    };
  }
  return context;
}

export const useAccentColor = useAccentTheme;
