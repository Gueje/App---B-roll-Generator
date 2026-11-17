import { HistorySession, ScriptSegment, BrollSuggestion } from "../types";

const HISTORY_KEY_PREFIX = 'br_history_';
const ACTIVE_SESSION_PREFIX = 'br_active_session_';
const IDB_NAME = 'broll_generator_db';
const IDB_STORE = 'sessions';
const IDB_VERSION = 1;

// --- IndexedDB Helpers (High-capacity durable local storage backup) ---

const openIDB = (): Promise<IDBDatabase | null> => {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      resolve(null);
      return;
    }
    try {
      const request = window.indexedDB.open(IDB_NAME, IDB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          const store = db.createObjectStore(IDB_STORE, { keyPath: 'storageKey' });
          store.createIndex('userEmail', 'userEmail', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
};

const putSessionIDB = async (userEmail: string, session: HistorySession): Promise<void> => {
  const db = await openIDB();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put({
        ...session,
        userEmail,
        storageKey: `${userEmail}::${session.id}`
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Ignore IDB errors silently
  } finally {
    db.close();
  }
};

const deleteSessionIDB = async (userEmail: string, sessionId: string): Promise<void> => {
  const db = await openIDB();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.delete(`${userEmail}::${sessionId}`);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Ignore
  } finally {
    db.close();
  }
};

export const getHistoryAsync = async (userEmail: string): Promise<HistorySession[]> => {
  const localHistory = getHistory(userEmail);
  const db = await openIDB();
  if (!db) return localHistory;

  try {
    const idbSessions = await new Promise<HistorySession[]>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const index = store.index('userEmail');
      const req = index.getAll(userEmail);
      req.onsuccess = () => {
        const rows = (req.result || []) as Array<HistorySession & { userEmail?: string; storageKey?: string }>;
        const cleaned: HistorySession[] = rows.map(({ userEmail: _u, storageKey: _k, ...rest }) => rest);
        resolve(cleaned);
      };
      req.onerror = () => resolve([]);
    });

    // Merge local and IDB, preferring whichever has more suggestions or newer date
    const mergedMap = new Map<string, HistorySession>();
    [...idbSessions, ...localHistory].forEach((sess) => {
      const existing = mergedMap.get(sess.id);
      if (!existing) {
        mergedMap.set(sess.id, sess);
      } else {
        const existingCount = existing.suggestions?.length || 0;
        const incomingCount = sess.suggestions?.length || 0;
        if (incomingCount > existingCount || (incomingCount === existingCount && sess.date > existing.date)) {
          mergedMap.set(sess.id, sess);
        }
      }
    });

    return Array.from(mergedMap.values())
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 30);
  } catch {
    return localHistory;
  } finally {
    db.close();
  }
};

// --- Safe LocalStorage Helpers ---

const safeWriteHistoryLocalStorage = (key: string, sessions: HistorySession[]) => {
  let listToSave = [...sessions];
  while (listToSave.length > 0) {
    try {
      localStorage.setItem(key, JSON.stringify(listToSave));
      return;
    } catch {
      // QuotaExceededError: drop the oldest session (last item) and retry,
      // keeping the newest/active session always preserved in localStorage
      if (listToSave.length === 1) {
        // Even a single massive script exceeded 5MB localStorage quota;
        // IndexedDB still holds the complete session safely.
        return;
      }
      listToSave.pop();
    }
  }
};

// --- Active Session Pointer ---

export const setActiveSessionId = (userEmail: string, sessionId: string | null) => {
  if (!userEmail) return;
  const key = `${ACTIVE_SESSION_PREFIX}${userEmail}`;
  try {
    if (sessionId) {
      localStorage.setItem(key, sessionId);
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage errors
  }
};

export const getActiveSessionId = (userEmail: string): string | null => {
  if (!userEmail) return null;
  try {
    return localStorage.getItem(`${ACTIVE_SESSION_PREFIX}${userEmail}`);
  } catch {
    return null;
  }
};

export const getActiveSession = (userEmail: string): HistorySession | null => {
  const activeId = getActiveSessionId(userEmail);
  if (!activeId) return null;
  const history = getHistory(userEmail);
  return history.find(h => h.id === activeId) || null;
};

// --- Upsert (Create or Update in place — zero duplicates) ---

export interface SaveSessionParams {
  id?: string;
  userEmail: string;
  scriptName: string;
  segments: ScriptSegment[];
  suggestions: BrollSuggestion[];
  globalContext?: string;
  isContextApproved?: boolean;
  userStyle?: string;
  userTone?: string;
  aspectRatio?: string;
  resolution?: string;
}

export const upsertSession = (params: SaveSessionParams): HistorySession => {
  const {
    id,
    userEmail,
    scriptName,
    segments,
    suggestions,
    globalContext,
    isContextApproved,
    userStyle,
    userTone,
    aspectRatio,
    resolution,
  } = params;

  const sessionId = id || crypto.randomUUID();
  const session: HistorySession = {
    id: sessionId,
    date: new Date().toISOString(),
    scriptName: scriptName || 'Guion sin título',
    segments,
    suggestions,
    globalContext,
    isContextApproved,
    userStyle,
    userTone,
    aspectRatio,
    resolution,
  };

  if (!userEmail) return session;

  const key = `${HISTORY_KEY_PREFIX}${userEmail}`;
  const history = getHistory(userEmail);

  // Remove previous copy of this same sessionId so it updates in place and moves to top
  const filtered = history.filter(h => h.id !== sessionId);
  const newHistory = [session, ...filtered].slice(0, 20);

  safeWriteHistoryLocalStorage(key, newHistory);
  setActiveSessionId(userEmail, sessionId);

  // Mirror asynchronously to IndexedDB for large-script durability
  void putSessionIDB(userEmail, session);

  return session;
};

// Backwards-compatible wrapper
export const saveSession = (
  userEmail: string,
  scriptName: string,
  segments: ScriptSegment[],
  suggestions: BrollSuggestion[],
  globalContext?: string,
  isContextApproved?: boolean,
  sessionId?: string
): HistorySession => {
  return upsertSession({
    id: sessionId,
    userEmail,
    scriptName,
    segments,
    suggestions,
    globalContext,
    isContextApproved,
  });
};

export const getHistory = (userEmail: string): HistorySession[] => {
  if (!userEmail) return [];
  const key = `${HISTORY_KEY_PREFIX}${userEmail}`;
  try {
    const existingRaw = localStorage.getItem(key);
    return existingRaw ? JSON.parse(existingRaw) : [];
  } catch {
    return [];
  }
};

export const deleteSession = (userEmail: string, sessionId: string): HistorySession[] => {
  if (!userEmail) return [];
  const key = `${HISTORY_KEY_PREFIX}${userEmail}`;
  let history = getHistory(userEmail);
  history = history.filter(h => h.id !== sessionId);
  safeWriteHistoryLocalStorage(key, history);

  if (getActiveSessionId(userEmail) === sessionId) {
    setActiveSessionId(userEmail, null);
  }

  void deleteSessionIDB(userEmail, sessionId);
  return history;
};

export const clearHistory = (userEmail: string) => {
  const key = `${HISTORY_KEY_PREFIX}${userEmail}`;
  localStorage.removeItem(key);
  setActiveSessionId(userEmail, null);
};