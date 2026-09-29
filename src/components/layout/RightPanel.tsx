import type { FC } from 'react';
import { useLocation } from 'react-router-dom';
import { HomeRightPanel } from '../../pages/Home';
import { ChatRightPanel } from '../../pages/Chat';
import { ImageRightPanel } from '../../pages/Image';
import { VoiceRightPanel } from '../../pages/Voice';
import { ModelsRightPanel } from '../../pages/Models';
import { SystemRightPanel } from '../../pages/System';
import { SettingsRightPanel } from '../../pages/Settings';

export const RightPanel: FC = () => {
  const location = useLocation();

  const panels: Record<string, FC> = {
    '/': HomeRightPanel,
    '/chat': ChatRightPanel,
    '/image': ImageRightPanel,
    '/voice': VoiceRightPanel,
    '/models': ModelsRightPanel,
    '/system': SystemRightPanel,
    '/settings': SettingsRightPanel,
  };

  const Panel = panels[location.pathname] || HomeRightPanel;

  return <Panel />;
};