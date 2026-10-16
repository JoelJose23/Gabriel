// Chat session persistence — localStorage only, no backend involvement.

import type { ChatMessage, StoredSession } from '../types/api';

const STORAGE_KEY = 'gabriel.chat.sessions.v1';
const MAX_SESSIONS = 100;

function readAll(): StoredSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredSession[]) : [];
  } catch {
    return [];
  }
}

function writeAll(sessions: StoredSession[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, MAX_SESSIONS)));
  } catch (err) {
    console.error('Failed to persist chat sessions:', err);
  }
}

/** Sessions sorted newest-first. */
export function listSessions(): StoredSession[] {
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getSession(id: string): StoredSession | undefined {
  return readAll().find(s => s.id === id);
}

export function createSession(model: string, title = 'New chat'): StoredSession {
  const now = Date.now();
  const session: StoredSession = {
    id: `sess-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    model,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
  writeAll([session, ...readAll()]);
  return session;
}

export function saveSession(session: StoredSession): StoredSession {
  const updated = { ...session, updatedAt: Date.now() };
  const all = readAll();
  const idx = all.findIndex(s => s.id === updated.id);
  if (idx === -1) all.unshift(updated);
  else all[idx] = updated;
  writeAll(all);
  return updated;
}

export function deleteSession(id: string): void {
  writeAll(readAll().filter(s => s.id !== id));
}

/** Derive a session title from the first user message. */
export function titleFromMessages(messages: ChatMessage[]): string {
  const first = messages.find(m => m.role === 'user');
  if (!first) return 'New chat';
  const text = first.content.trim();
  return text.length > 40 ? `${text.slice(0, 40)}…` : text || 'New chat';
}
