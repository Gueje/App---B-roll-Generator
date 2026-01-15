import { HistorySession, ScriptSegment, BrollSuggestion } from "../types";

const HISTORY_KEY_PREFIX = 'br_history_';

export const saveSession = (
  userEmail: string, 
  scriptName: string, 
  segments: ScriptSegment[], 
  suggestions: BrollSuggestion[]
) => {
  if (!userEmail) return;

  const session: HistorySession = {
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
    scriptName,
    segments,
    suggestions
  };

  const key = `${HISTORY_KEY_PREFIX}${userEmail}`;
  const existingRaw = localStorage.getItem(key);
  const history: HistorySession[] = existingRaw ? JSON.parse(existingRaw) : [];

  // Add to top, limit to 20
  const newHistory = [session, ...history].slice(0, 20);
  localStorage.setItem(key, JSON.stringify(newHistory));
};

export const getHistory = (userEmail: string): HistorySession[] => {
  if (!userEmail) return [];
  const key = `${HISTORY_KEY_PREFIX}${userEmail}`;
  const existingRaw = localStorage.getItem(key);
  return existingRaw ? JSON.parse(existingRaw) : [];
};

export const deleteSession = (userEmail: string, sessionId: string): HistorySession[] => {
    if (!userEmail) return [];
    const key = `${HISTORY_KEY_PREFIX}${userEmail}`;
    const existingRaw = localStorage.getItem(key);
    if (!existingRaw) return [];

    let history: HistorySession[] = JSON.parse(existingRaw);
    history = history.filter(h => h.id !== sessionId);
    
    localStorage.setItem(key, JSON.stringify(history));
    return history;
};

export const clearHistory = (userEmail: string) => {
    const key = `${HISTORY_KEY_PREFIX}${userEmail}`;
    localStorage.removeItem(key);
}