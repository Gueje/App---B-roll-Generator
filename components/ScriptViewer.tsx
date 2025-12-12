import React from 'react';
import { ScriptSegment, BrollSuggestion, MediaType } from '../types';
import { Video, Image as ImageIcon, ExternalLink, Wand2, StickyNote } from 'lucide-react';

interface Props {
  segments: ScriptSegment[];
  suggestions: BrollSuggestion[];
}

const ScriptViewer: React.FC<Props> = ({ segments, suggestions }) => {
  return (
    <div className="space-y-6">
      {segments.map((segment) => {
        const suggestion = suggestions.find((s) => s.segmentId === segment.id);
        
        return (
          <div key={segment.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col md:flex-row">
            {/* Script Column */}
            <div className="md:w-1/3 p-6 bg-slate-50 border-r border-slate-100">
              <div className="flex items-center gap-2 mb-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
                <span>Block {segment.order + 1}</span>
              </div>
              <p className="text-slate-800 text-sm leading-relaxed whitespace-pre-wrap font-serif">
                "{segment.originalText}"
              </p>
              {segment.notes.length > 0 && (
                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-100 rounded-md text-xs text-yellow-800 flex items-start gap-2">
                  <StickyNote className="w-4 h-4 shrink-0" />
                  <div>
                    <span className="font-bold block mb-1">Detected Notes:</span>
                    <ul className="list-disc pl-4 space-y-1">
                      {segment.notes.map((note, i) => <li key={i}>{note}</li>)}
                    </ul>
                  </div>
                </div>
              )}
            </div>

            {/* B-Roll Suggestion Column */}
            <div className="md:w-2/3 p-6 relative">
              {suggestion ? (
                <div className="h-full flex flex-col">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded text-xs font-bold flex items-center gap-1 ${
                        suggestion.mediaType === MediaType.VIDEO ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {suggestion.mediaType === MediaType.VIDEO ? <Video className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
                        {suggestion.mediaType}
                      </span>
                      <span className="text-xs text-slate-500 border border-slate-200 px-2 py-1 rounded">
                        Style: {suggestion.styleParams.style}
                      </span>
                    </div>
                  </div>

                  <h3 className="font-medium text-lg text-slate-900 mb-2">
                    {suggestion.visualIntent}
                  </h3>

                  <div className="bg-slate-100 rounded p-3 mb-4">
                     <p className="text-xs text-slate-500 uppercase font-bold mb-1">Search Query</p>
                     <p className="text-slate-800 font-mono text-sm">{suggestion.searchQuery.mainQuery}</p>
                     <div className="mt-2 flex flex-wrap gap-2">
                        {suggestion.searchQuery.keywords.slice(0, 5).map(k => (
                          <span key={k} className="text-xs bg-white border border-slate-300 text-slate-600 px-1.5 py-0.5 rounded">#{k}</span>
                        ))}
                     </div>
                  </div>

                  <div className="mt-auto">
                    <p className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">Instant Search</p>
                    <div className="flex flex-wrap gap-2">
                        <a href={suggestion.sources.googleImages} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 px-3 py-2 rounded-lg transition-colors">
                            <img src="https://www.google.com/favicon.ico" className="w-3 h-3" alt="Google" />
                            Google
                        </a>
                        <a href={suggestion.sources.pexels} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs bg-[#05a081] hover:bg-[#048a6f] text-white px-3 py-2 rounded-lg transition-colors">
                            Pexels
                        </a>
                        <a href={suggestion.sources.unsplash} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs bg-black hover:bg-slate-800 text-white px-3 py-2 rounded-lg transition-colors">
                            Unsplash
                        </a>
                        <a href={suggestion.sources.pinterest} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs bg-[#E60023] hover:bg-[#bd081c] text-white px-3 py-2 rounded-lg transition-colors">
                            Pinterest
                        </a>
                    </div>
                  </div>

                  {suggestion.aiPrompt && (
                    <div className="mt-4 pt-4 border-t border-slate-100">
                         <div className="flex items-center gap-1 text-xs text-indigo-600 font-bold mb-1">
                             <Wand2 className="w-3 h-3" /> AI Generation Prompt
                         </div>
                         <p className="text-xs text-slate-600 italic">"{suggestion.aiPrompt}"</p>
                    </div>
                  )}

                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400 text-sm italic border-2 border-dashed border-slate-100 rounded-lg">
                  No B-roll required for this segment.
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ScriptViewer;