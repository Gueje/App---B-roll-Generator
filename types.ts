export enum MediaType {
  VIDEO = 'VIDEO',
  IMAGE = 'IMAGE',
}

export interface ScriptSegment {
  id: string;
  originalText: string;
  notes: string[]; // Detected brackets or comments
  order: number;
}

export interface SearchQuery {
  mainQuery: string;
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
  };
  aiPrompt?: string; // If AI generation is suggested
}

export interface AnalysisResult {
  segment: ScriptSegment;
  suggestions: BrollSuggestion[];
}

export interface AppConfig {
  geminiKey: string;
  googleClientId: string;
  googleApiKey: string;
}

export interface ExportStats {
  totalSegments: number;
  coveredSegments: number;
  coveragePercent: number;
}