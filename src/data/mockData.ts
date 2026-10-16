export const user = {
  name: 'Jackson Lee',
  mode: 'Local Mode',
  avatar: 'JL',
};

export const quickActions = [
  { id: '1', icon: 'MessageSquare', label: 'Chat with LLMs', description: 'Have conversations with local models', route: '/chat', color: 'primary' as const },
  { id: '2', icon: 'Image', label: 'Generate Image', description: 'Create images with stable diffusion', route: '/image', color: 'secondary' as const },
  { id: '3', icon: 'Mic', label: 'Text to Speech', description: 'Generate natural speech locally', route: '/voice', color: 'tertiary' as const },
  { id: '4', icon: 'Box', label: 'Browse Models', description: 'Manage & load local AI models', route: '/models', color: 'primary' as const },
];

export const settingsSections = [
  { id: 'general', label: 'General', icon: 'Settings' },
  { id: 'appearance', label: 'Appearance', icon: 'Palette' },
  { id: 'governor', label: 'Engine Governor', icon: 'Cpu' },
  { id: 'shortcuts', label: 'Keyboard Shortcuts', icon: 'Keyboard' },
];
