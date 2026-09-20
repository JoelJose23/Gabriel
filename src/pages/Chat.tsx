import type { FC } from 'react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import {
  ChevronRight,
  Plus,
  History,
  Download,
  ArrowRight,
  Mic,
  Info,
  Sliders,
  Sparkles,
  Zap,
  Square,
} from 'lucide-react';
import {
  StatusDot,
  ProgressBar,
  AttachMenuPopover,
} from '../components/shared';
import { Select } from '../components/shared/Select';
import { useCardSpotlight } from '../hooks/useCardSpotlight';
import {
  loadedModels,
  allModels,
  chatHistory as initialChatHistory,
} from '../data/mockData';

const llmModels = allModels.filter(m => m.type === 'LLM');

const defaultShortMessages = [
  {
    id: '1',
    role: 'user' as const,
    content: 'Can you summarize how local AI models execute on hardware?',
    timestamp: '09:23 AM',
  },
  {
    id: '2',
    role: 'assistant' as const,
    content: 'Local AI models run directly on your GPU, CPU, or NPU without sending data to cloud servers. Quantization formats like GGUF and FP16 optimize VRAM usage for real-time inference on consumer hardware.',
    timestamp: '09:24 AM',
  },
];

export const Chat: FC = () => {
  const location = useLocation();
  const initialMsgFromHome = location.state?.initialMessage;

  const [selectedModel, setSelectedModel] = useState('llama-3.1-70b');
  const [messages, setMessages] = useState(() => {
    if (initialMsgFromHome) {
      return [
        {
          id: Date.now().toString(),
          role: 'user' as const,
          content: initialMsgFromHome,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ];
    }
    return defaultShortMessages;
  });

  const [inputValue, setInputValue] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showInfoSidebar, setShowInfoSidebar] = useState(true);
  const [activeTab, setActiveTab] = useState<'info' | 'history'>('info');
  const [historyList, setHistoryList] = useState(initialChatHistory);

  const abortControllerRef = useRef<AbortController | null>(null);
  const { ref: infoCardRef, onPointerMove: onInfoCardPointerMove } = useCardSpotlight();

  const handleNewChat = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);

    const newId = Date.now().toString();
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const newEntry = {
      id: newId,
      title: 'New Conversation',
      timestamp: `Today, ${timeStr}`,
      messageCount: 0,
    };

    setHistoryList(prev => [newEntry, ...prev]);
    setMessages([]);
    setInputValue('');
  }, []);

  // Handle Ctrl+N trigger from global shortcut router
  useEffect(() => {
    if (location.state?.newChat) {
      handleNewChat();
    }
  }, [location.state, handleNewChat]);

  const handleStopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
  }, []);

  // Contextual shortcut: Ctrl + . to Stop Generation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '.') {
        e.preventDefault();
        handleStopGeneration();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleStopGeneration]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (inputValue.trim() && !isGenerating) {
      const userText = inputValue;
      const newMsg = {
        id: Date.now().toString(),
        role: 'user' as const,
        content: userText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages(prev => [...prev, newMsg]);
      setInputValue('');
      setIsGenerating(true);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Simulated local SSE response with abort signal
      const timeoutId = setTimeout(() => {
        if (!controller.signal.aborted) {
          const assistantMsg = {
            id: (Date.now() + 1).toString(),
            role: 'assistant' as const,
            content: `Gabriel processed your prompt using ${selectedModel} in 120ms at 42.8 t/s.`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          };
          setMessages(prev => [...prev, assistantMsg]);
        }
        setIsGenerating(false);
        abortControllerRef.current = null;
      }, 1200);

      controller.signal.addEventListener('abort', () => {
        clearTimeout(timeoutId);
        setIsGenerating(false);
      });
    }
  };

  const currentModel = loadedModels[0];

  return (
    <div className="flex flex-col h-full max-w-6xl mx-auto space-y-4 text-text-primary">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between gap-3 glass-panel aurora-glass p-3">
        {/* Left: Model Selector */}
        <div className="flex items-center gap-3">
          <Select
            options={llmModels.map(m => ({ value: m.id, label: m.name }))}
            value={selectedModel}
            onChange={setSelectedModel}
            className="w-64"
            icon={<StatusDot status="running" size={6} />}
          />
        </div>

        {/* Right: Actions & New Chat */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleNewChat}
            className="btn-primary py-2 px-4 flex flex-row items-center gap-2 text-xs font-bold cursor-pointer active:scale-95 transition-all shadow-sm"
            title="Start new conversation"
          >
            <Plus size={15} strokeWidth={2.5} />
            <span className="whitespace-nowrap">New Chat</span>
          </button>

          <div className="w-px h-6 bg-[var(--color-border)] mx-1" />

          <button
            onClick={() => {
              setShowInfoSidebar(true);
              setActiveTab('history');
            }}
            className="p-2.5 rounded-xl text-text-secondary hover:bg-[var(--color-hover)] hover:text-text-primary active:scale-90 transition-all cursor-pointer"
            title="History"
            aria-label="History"
          >
            <History size={18} strokeWidth={2} />
          </button>

          <button
            className="p-2.5 rounded-xl text-text-secondary hover:bg-[var(--color-hover)] hover:text-text-primary active:scale-90 transition-all cursor-pointer"
            title="Export"
            aria-label="Export"
          >
            <Download size={18} strokeWidth={2} />
          </button>

          <button
            onClick={() => setShowInfoSidebar(!showInfoSidebar)}
            className={`p-2.5 rounded-xl active:scale-90 transition-all cursor-pointer ${
              showInfoSidebar ? 'bg-[var(--color-primary-bg)] text-primary' : 'text-text-secondary hover:bg-[var(--color-hover)] hover:text-text-primary'
            }`}
            title="Toggle Session Info"
            aria-label="Toggle info panel"
          >
            <Info size={18} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Main Message Thread + Session Info Sidebar */}
      <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
        {/* Message Thread Box */}
        <div className="flex-1 flex flex-col min-w-0 glass-panel aurora-glass overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 text-text-secondary space-y-3">
                <div className="w-12 h-12 rounded-full bg-[var(--color-primary-bg)] text-primary flex items-center justify-center">
                  <Sparkles size={24} />
                </div>
                <h3 className="font-bold text-base text-text-primary">Fresh Conversation Started</h3>
                <p className="text-xs max-w-sm">Ask Gabriel anything about local model execution, code, workflows, or hardware optimization.</p>
              </div>
            ) : (
              messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))
            )}
          </div>

          {/* Floating Glass Input */}
          <form onSubmit={handleSubmit} className="p-3 bg-transparent">
            <div className="flex items-center gap-2 rounded-full glass-floating dynamic-glass-pill pl-3 pr-3.5 py-2.5 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
              <AttachMenuPopover iconSize={16} />

              <input
                type="text"
                placeholder="Ask Gabriel anything locally... (Ctrl+Enter to send)"
                className="flex-1 bg-transparent border-none focus:outline-none text-xs text-text-primary placeholder:text-text-secondary font-medium"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
              />

              <button
                type="button"
                className="p-1.5 rounded-full text-text-secondary hover:text-primary active:scale-90 transition-all cursor-pointer shrink-0"
                aria-label="Voice input"
              >
                <Mic size={16} strokeWidth={1.5} />
              </button>

              {isGenerating ? (
                <button
                  type="button"
                  onClick={handleStopGeneration}
                  className="p-1.5 text-white bg-primary rounded-full hover:scale-105 active:scale-95 transition-all cursor-pointer shrink-0"
                  aria-label="Stop generation (Ctrl+.)"
                  title="Stop generation (Ctrl+.)"
                >
                  <Square size={13} fill="currentColor" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!inputValue.trim()}
                  className="p-1.5 text-white bg-primary rounded-full disabled:opacity-40 disabled:hover:scale-100 hover:scale-105 active:scale-95 transition-all cursor-pointer shrink-0"
                  aria-label="Send (Ctrl+Enter)"
                  title="Send (Ctrl+Enter)"
                >
                  <ArrowRight size={14} strokeWidth={2} />
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Supplementary Info Panel */}
        {showInfoSidebar && (
          <div
            ref={infoCardRef}
            onPointerMove={onInfoCardPointerMove}
            className="w-72 flex-shrink-0 glass-panel aurora-glass p-4 overflow-y-auto space-y-4 flex flex-col"
          >
            {/* Tabs */}
            <div className="flex items-center p-1 bg-[var(--color-hover)] rounded-xl text-xs font-semibold relative z-10">
              <button
                onClick={() => setActiveTab('info')}
                className={`flex-1 py-1.5 rounded-lg transition-all active:scale-95 cursor-pointer ${
                  activeTab === 'info' ? 'bg-[var(--color-card)] text-primary font-bold shadow-2xs' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                Session Info
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`flex-1 py-1.5 rounded-lg transition-all active:scale-95 cursor-pointer ${
                  activeTab === 'history' ? 'bg-[var(--color-card)] text-primary font-bold shadow-2xs' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                History ({historyList.length})
              </button>
            </div>

            {activeTab === 'info' ? (
              <div className="space-y-4 text-xs relative z-10">
                <div className="space-y-3">
                  <div className="font-bold text-text-primary flex items-center gap-1.5">
                    <Sliders size={14} className="text-primary" />
                    Model Details
                  </div>
                  <div className="p-3 bg-[var(--color-hover)] rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-text-secondary font-medium">Model</span>
                      <span className="font-bold text-text-primary truncate max-w-[120px]">{currentModel.name}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-text-secondary font-medium">Quantization</span>
                      <span className="badge badge-primary font-mono font-bold">{currentModel.quantization}</span>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-text-secondary mb-1 font-medium">
                      <span>Context Window</span>
                      <span className="font-mono text-text-primary font-bold">3.2K / 8K</span>
                    </div>
                    <ProgressBar value={3200} max={8000} color="primary" height={4} />
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-[var(--color-border)] font-medium">
                    <div className="flex justify-between text-text-secondary">
                      <span>Temperature</span>
                      <span className="font-mono text-text-primary font-bold">0.7</span>
                    </div>
                    <div className="flex justify-between text-text-secondary">
                      <span>Top P</span>
                      <span className="font-mono text-text-primary font-bold">0.9</span>
                    </div>
                    <div className="flex justify-between text-text-secondary">
                      <span>Max Tokens</span>
                      <span className="font-mono text-text-primary font-bold">2048</span>
                    </div>
                  </div>
                </div>

                {/* Session Real-time Speed */}
                <div className="pt-3 border-t border-[var(--color-border)] space-y-2">
                  <div className="font-bold text-text-primary flex items-center gap-1.5">
                    <Zap size={14} className="text-secondary" />
                    Inference Telemetry
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div className="p-2 rounded-xl bg-[var(--color-hover)]">
                      <span className="text-[10px] text-text-secondary font-semibold uppercase block">Speed</span>
                      <span className="font-mono font-bold text-sm text-secondary">42.8 t/s</span>
                    </div>
                    <div className="p-2 rounded-xl bg-[var(--color-hover)]">
                      <span className="text-[10px] text-text-secondary font-semibold uppercase block">Latency</span>
                      <span className="font-mono font-bold text-sm text-primary">120 ms</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-xs relative z-10">
                <div className="font-bold text-text-primary mb-2">Chat History</div>
                {historyList.map(conv => (
                  <button
                    key={conv.id}
                    onClick={() => setMessages([])}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl bg-[var(--color-hover)] hover:bg-[var(--color-active)] transition-all text-left group cursor-pointer"
                  >
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="font-bold text-text-primary truncate">{conv.title}</div>
                      <div className="text-[10px] text-text-secondary font-mono">{conv.timestamp} · {conv.messageCount} msgs</div>
                    </div>
                    <ChevronRight size={14} className="text-text-secondary group-hover:text-text-primary shrink-0 transition-transform group-hover:translate-x-0.5" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const MessageBubble: FC<{ message: typeof defaultShortMessages[0] }> = ({ message }) => {
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-[var(--color-primary-bg)] text-primary flex items-center justify-center shrink-0 text-xs font-bold">
          G
        </div>
      )}
      <div className={`flex-1 ${isUser ? 'text-right' : ''}`}>
        <div
          className={`inline-block max-w-[82%] rounded-2xl p-3.5 text-xs ${
            isUser
              ? 'bg-primary text-white font-medium rounded-br-xs'
              : 'glass-panel text-text-primary rounded-bl-xs'
          }`}
        >
          <div className="whitespace-pre-wrap leading-relaxed">
            {message.content}
          </div>
        </div>
        <div className={`flex items-center gap-1.5 mt-1 text-[10px] text-text-secondary ${isUser ? 'justify-end' : ''}`}>
          <span className="font-mono">{message.timestamp}</span>
        </div>
      </div>
    </div>
  );
};