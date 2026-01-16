export enum MediaType {
  VIDEO = 'VIDEO',
  IMAGE = 'IMAGE',
}

export interface ExtractedLink {
  url: string;
  type: 'YOUTUBE' | 'IMAGE' | 'GENERIC';
}

export interface ScriptSegment {
  id: string;
  originalText: string;
  notes: string[]; // Detected brackets or comments
  extractedLinks: ExtractedLink[]; // New field for URLs found in text
  order: number;
}

export interface SearchQuery {
  mainQuery: string;
  youtubeQuery: string; // Specific query optimized for YouTube search
  variants: string[];
  keywords: string[];
}

export interface BrollSuggestion {
  segmentId: string;
  visualIntent: string; // What should be shown
  mediaType: MediaType;
  searchQuery: SearchQuery;
  styleParams: {
    mood: string;
    style: string; // e.g. "Cinematic", "Minimalist"
    negativePrompt?: string;
  };
  sources: {
    googleImages: string;
    pexels: string;
    unsplash: string;
    pinterest: string;
    youtube: string; // New source
  };
  aiPrompt?: string; // If AI generation is suggested
}

export interface AnalysisResult {
  segment: ScriptSegment;
  suggestions: BrollSuggestion[];
}

export interface AppConfig {
  geminiKey: string;
}

export interface ExportStats {
  totalSegments: number;
  coveredSegments: number;
  coveragePercent: number;
}

export interface UserProfile {
  email: string;
  name: string;
  picture: string;
}

export interface HistorySession {
  id: string;
  date: string; // ISO string
  scriptName: string;
  segments: ScriptSegment[];
  suggestions: BrollSuggestion[];
}