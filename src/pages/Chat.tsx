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
  Trash2,
} from 'lucide-react';
import {
  StatusDot,
} from '../components/shared';
import { Select } from '../components/shared/Select';
import { useCardSpotlight } from '../hooks/useCardSpotlight';
import { listModels, streamChatCompletion } from '../api';
import {
  createSession,
  deleteSession,
  getSession,
  listSessions,
  saveSession,
  titleFromMessages,
} from '../lib/sessions';
import type { StoredSession } from '../types/api';

const TEMPERATURE = 0.7;
const MAX_TOKENS = 2048;

interface UiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

const nowTime = () =>
  new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export const Chat: FC = () => {
  const location = useLocation();
  const initialMsgFromHome = location.state?.initialMessage;

  const [llmModels, setLlmModels] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [messages, setMessages] = useState<UiMessage[]>(() => {
    if (initialMsgFromHome) {
      return [
        {
          id: Date.now().toString(),
          role: 'user' as const,
          content: initialMsgFromHome,
          timestamp: nowTime(),
        },
      ];
    }
    return [];
  });

  const [inputValue, setInputValue] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showInfoSidebar, setShowInfoSidebar] = useState(true);
  const [activeTab, setActiveTab] = useState<'info' | 'history'>('info');
  const [historyList, setHistoryList] = useState<StoredSession[]>(() => listSessions());
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [genStats, setGenStats] = useState<{ speed: number; latency: number } | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const { ref: infoCardRef, onPointerMove: onInfoCardPointerMove } = useCardSpotlight();

  // Load the real catalog of registered LLMs from the engine.
  useEffect(() => {
    let mounted = true;
    listModels()
      .then(res => {
        if (!mounted) return;
        const llms = res.data
          .filter(m => m.gabriel.model_type === 'llm')
          .map(m => ({ id: m.id, name: m.id }));
        setLlmModels(llms);
        setSelectedModel(prev => (llms.some(m => m.id === prev) ? prev : (llms[0]?.id ?? '')));
      })
      .catch(err => {
        console.error('Failed to list models from Gabriel API:', err);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const persistMessages = useCallback(
    (finalMessages: UiMessage[], model: string, existingId?: string | null) => {
      if (finalMessages.length === 0) return;
      const chatMessages = finalMessages.map(({ role, content }) => ({ role, content }));
      const title = titleFromMessages(chatMessages);
      const id = existingId ?? sessionId;
      if (id && getSession(id)) {
        saveSession({ ...getSession(id)!, messages: chatMessages, model, title });
      } else {
        const session = createSession(model, title);
        saveSession({ ...session, messages: chatMessages, model, title });
        setSessionId(session.id);
      }
      setHistoryList(listSessions());
    },
    [sessionId],
  );

  const handleNewChat = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
    setSessionId(null);
    setMessages([]);
    setInputValue('');
    setGenStats(null);
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

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputValue.trim() || isGenerating) return;

    const userText = inputValue;
    const newMsg: UiMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: userText,
      timestamp: nowTime(),
    };
    const assistantId = `${Date.now()}-a`;
    const assistantMsg: UiMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: nowTime(),
    };

    const historyForApi = [...messages, newMsg].map(({ role, content }) => ({ role, content }));
    const finalMessages = [...messages, newMsg, assistantMsg];

    setMessages(finalMessages);
    setInputValue('');
    setIsGenerating(true);
    setGenStats(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const startedAt = performance.now();
    let firstTokenAt: number | null = null;
    let tokenCount = 0;
    let content = '';

    try {
      await streamChatCompletion({
        model: selectedModel,
        messages: historyForApi,
        temperature: TEMPERATURE,
        max_tokens: MAX_TOKENS,
        signal: controller.signal,
        onChunk: chunk => {
          const delta = chunk.choices?.[0]?.delta?.content;
          if (!delta) return;
          if (firstTokenAt === null) {
            firstTokenAt = performance.now();
            setGenStats({
              speed: 0,
              latency: Math.round(firstTokenAt - startedAt),
            });
          }
          tokenCount += 1;
          content += delta;
          const snapshot = content;
          setMessages(prev =>
            prev.map(m => (m.id === assistantId ? { ...m, content: snapshot } : m)),
          );
        },
      });

      if (firstTokenAt !== null && tokenCount > 0) {
        const seconds = (performance.now() - firstTokenAt) / 1000;
        setGenStats({
          speed: tokenCount / Math.max(seconds, 0.001),
          latency: Math.round(firstTokenAt - startedAt),
        });
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        const message = err instanceof Error ? err.message : String(err);
        content = content ? `${content}\n\n[Error: ${message}]` : `Error: ${message}`;
        setMessages(prev =>
          prev.map(m => (m.id === assistantId ? { ...m, content } : m)),
        );
        console.error('Chat stream failed:', err);
      }
    } finally {
      assistantMsg.content = content;
      persistMessages(finalMessages.map(m => (m.id === assistantId ? { ...m, content } : m)), selectedModel);
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  const handleOpenSession = (session: StoredSession) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
    setSessionId(session.id);
    setSelectedModel(prev => (prev && !session.model ? prev : session.model || prev));
    setMessages(
      session.messages.map((m, i) => ({
        id: `${session.id}-${i}`,
        role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
        content: m.content,
        timestamp: new Date(session.updatedAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
      })),
    );
    setInputValue('');
    setGenStats(null);
  };

  const handleDeleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteSession(id);
    setHistoryList(listSessions());
    if (sessionId === id) handleNewChat();
  };

  const handleExport = () => {
    const data = JSON.stringify(
      {
        model: selectedModel,
        exported_at: new Date().toISOString(),
        messages: messages.map(({ role, content }) => ({ role, content })),
      },
      null,
      2,
    );
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gabriel-chat-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const modelOptions =
    llmModels.length > 0
      ? llmModels.map(m => ({ value: m.id, label: m.name }))
      : [{ value: '', label: 'No LLM model loaded' }];

  return (
    <div className="flex flex-col h-full max-w-6xl mx-auto space-y-4 text-text-primary">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between gap-3 glass-panel aurora-glass p-3">
        {/* Left: Model Selector */}
        <div className="flex items-center gap-3">
          <Select
            options={modelOptions}
            value={selectedModel}
            onChange={setSelectedModel}
            className="w-64"
            icon={<StatusDot status={selectedModel ? 'running' : 'error'} size={6} />}
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
            onClick={handleExport}
            disabled={messages.length === 0}
            className="p-2.5 rounded-xl text-text-secondary hover:bg-[var(--color-hover)] hover:text-text-primary disabled:opacity-40 disabled:hover:bg-transparent active:scale-90 transition-all cursor-pointer"
            title="Export conversation as JSON"
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
                {llmModels.length === 0 && (
                  <p className="text-[10px] font-mono text-warning">
                    No LLM model loaded — load one from the Models page first.
                  </p>
                )}
              </div>
            ) : (
              messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} streaming={isGenerating && msg.id === messages[messages.length - 1]?.id} />
              ))
            )}
          </div>

          {/* Floating Glass Input */}
          <form onSubmit={handleSubmit} className="p-3 bg-transparent">
            <div className="flex items-center gap-2 rounded-full glass-floating dynamic-glass-pill pl-3 pr-3.5 py-2.5 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
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
                disabled
                className="p-1.5 rounded-full text-text-secondary/50 cursor-not-allowed shrink-0"
                aria-label="Voice input (unavailable)"
                title="Speech-to-text is not available in this engine build"
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
                  disabled={!inputValue.trim() || !selectedModel}
                  className="p-1.5 text-white bg-primary rounded-full disabled:opacity-40 disabled:hover:scale-100 hover:scale-105 active:scale-95 transition-all cursor-pointer shrink-0"
                  aria-label="Send (Ctrl+Enter)"
                  title={selectedModel ? 'Send (Ctrl+Enter)' : 'Load an LLM model first'}
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
                      <span className="font-bold text-text-primary truncate max-w-[130px]" title={selectedModel}>
                        {selectedModel || '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-text-secondary font-medium">Messages</span>
                      <span className="badge badge-primary font-mono font-bold">{messages.length}</span>
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-[var(--color-border)] font-medium">
                    <div className="flex justify-between text-text-secondary">
                      <span>Temperature</span>
                      <span className="font-mono text-text-primary font-bold">{TEMPERATURE}</span>
                    </div>
                    <div className="flex justify-between text-text-secondary">
                      <span>Max Tokens</span>
                      <span className="font-mono text-text-primary font-bold">{MAX_TOKENS}</span>
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
                      <span className="font-mono font-bold text-sm text-secondary">
                        {genStats ? `${genStats.speed.toFixed(1)} t/s` : '—'}
                      </span>
                    </div>
                    <div className="p-2 rounded-xl bg-[var(--color-hover)]">
                      <span className="text-[10px] text-text-secondary font-semibold uppercase block">Latency</span>
                      <span className="font-mono font-bold text-sm text-primary">
                        {genStats ? `${genStats.latency} ms` : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-xs relative z-10">
                <div className="font-bold text-text-primary mb-2">Chat History</div>
                {historyList.length === 0 && (
                  <div className="text-text-secondary p-2">No saved conversations yet.</div>
                )}
                {historyList.map(conv => (
                  <button
                    key={conv.id}
                    onClick={() => handleOpenSession(conv)}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl transition-all text-left group cursor-pointer ${
                      sessionId === conv.id ? 'bg-[var(--color-active)]' : 'bg-[var(--color-hover)] hover:bg-[var(--color-active)]'
                    }`}
                  >
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="font-bold text-text-primary truncate">{conv.title}</div>
                      <div className="text-[10px] text-text-secondary font-mono">
                        {new Date(conv.updatedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · {conv.messages.length} msgs
                      </div>
                    </div>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => handleDeleteSession(e, conv.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleDeleteSession(e as unknown as React.MouseEvent, conv.id);
                      }}
                      className="p-1 rounded-lg text-text-secondary opacity-0 group-hover:opacity-100 hover:text-danger hover:bg-[var(--color-card)] transition-all shrink-0 cursor-pointer"
                      title="Delete conversation"
                    >
                      <Trash2 size={13} />
                    </span>
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

const MessageBubble: FC<{ message: UiMessage; streaming?: boolean }> = ({ message, streaming }) => {
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
            {message.content || (streaming ? '…' : '')}
          </div>
        </div>
        <div className={`flex items-center gap-1.5 mt-1 text-[10px] text-text-secondary ${isUser ? 'justify-end' : ''}`}>
          <span className="font-mono">{message.timestamp}</span>
        </div>
      </div>
    </div>
  );
};
