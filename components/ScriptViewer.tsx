import React from 'react';
import { ScriptSegment, BrollSuggestion, MediaType } from '../types';
import { Video, Image as ImageIcon, Wand2, StickyNote, ExternalLink, Youtube, Download } from 'lucide-react';

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
          <div key={segment.id} className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col md:flex-row transition-colors">
            {/* Script Column */}
            <div className="md:w-1/3 p-6 bg-slate-50 dark:bg-slate-900 border-r border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-2 mb-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
                <span>Bloque {segment.order + 1}</span>
              </div>
              <p className="text-slate-800 dark:text-slate-200 text-sm leading-relaxed whitespace-pre-wrap font-serif">
                "{segment.originalText}"
              </p>
              
              {/* Detected Notes */}
              {segment.notes.length > 0 && (
                <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-100 dark:border-yellow-900/50 rounded-md text-xs text-yellow-800 dark:text-yellow-500 flex items-start gap-2">
                  <StickyNote className="w-4 h-4 shrink-0" />
                  <div>
                    <span className="font-bold block mb-1">Notas Detectadas:</span>
                    <ul className="list-disc pl-4 space-y-1">
                      {segment.notes.map((note, i) => <li key={i}>{note}</li>)}
                    </ul>
                  </div>
                </div>
              )}
            </div>

            {/* B-Roll Suggestion Column */}
            <div className="md:w-2/3 p-6 relative flex flex-col dark:text-slate-200">
              {suggestion ? (
                <>
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded text-xs font-bold flex items-center gap-1 ${
                        suggestion.mediaType === MediaType.VIDEO 
                            ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300' 
                            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
                      }`}>
                        {suggestion.mediaType === MediaType.VIDEO ? <Video className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
                        {suggestion.mediaType === 'VIDEO' ? 'VIDEO' : 'IMAGEN'}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-600 px-2 py-1 rounded">
                        Estilo: {suggestion.styleParams.style}
                      </span>
                    </div>
                  </div>

                  <h3 className="font-medium text-lg text-slate-900 dark:text-white mb-2">
                    {suggestion.visualIntent}
                  </h3>

                  <div className="bg-slate-100 dark:bg-slate-700/50 rounded p-3 mb-4">
                     <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold mb-1">Búsqueda Rigurosa (Query)</p>
                     <p className="text-slate-800 dark:text-slate-200 font-mono text-sm mb-2">{suggestion.searchQuery.mainQuery}</p>
                     
                     {/* YouTube specific query display */}
                     {suggestion.searchQuery.youtubeQuery && (
                       <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400 border-t border-slate-200 dark:border-slate-600 pt-2 mb-2">
                          <Youtube className="w-3 h-3" />
                          <span className="font-mono">{suggestion.searchQuery.youtubeQuery}</span>
                       </div>
                     )}

                     <div className="flex flex-wrap gap-2">
                        {suggestion.searchQuery.keywords.slice(0, 5).map(k => (
                          <span key={k} className="text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded">#{k}</span>
                        ))}
                     </div>
                  </div>

                  <div className="mt-auto space-y-4">
                    
                    {/* Source Links from Text (Priority) */}
                    {segment.extractedLinks && segment.extractedLinks.length > 0 && (
                        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30 rounded-lg">
                            <p className="text-xs font-bold text-blue-700 dark:text-blue-400 mb-2 uppercase tracking-wider flex items-center gap-2">
                                <ExternalLink className="w-3 h-3" /> Recursos en el guion
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {segment.extractedLinks.map((link, idx) => (
                                    <a 
                                        key={idx} 
                                        href={link.url} 
                                        target="_blank" 
                                        rel="noreferrer"
                                        className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg transition-colors font-medium ${
                                            link.type === 'YOUTUBE' 
                                            ? 'bg-red-600 text-white hover:bg-red-700' 
                                            : 'bg-blue-600 text-white hover:bg-blue-700'
                                        }`}
                                    >
                                        {link.type === 'YOUTUBE' ? <Youtube className="w-3 h-3" /> : <Download className="w-3 h-3" />}
                                        {link.type === 'YOUTUBE' ? 'Ver Video' : 'Abrir Recurso'}
                                    </a>
                                ))}
                            </div>
                        </div>
                    )}

                    <div>
                        <p className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">Buscar en Stock & Video</p>
                        <div className="flex flex-wrap gap-2">
                            <a href={suggestion.sources.googleImages} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 px-3 py-2 rounded-lg transition-colors">
                                <img src="https://www.google.com/favicon.ico" className="w-3 h-3" alt="Google" />
                                Google
                            </a>
                            <a href={suggestion.sources.youtube} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs bg-[#FF0000] hover:bg-[#cc0000] text-white px-3 py-2 rounded-lg transition-colors">
                                <Youtube className="w-3 h-3" />
                                YouTube
                            </a>
                            <a href={suggestion.sources.pexels} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs bg-[#05a081] hover:bg-[#048a6f] text-white px-3 py-2 rounded-lg transition-colors">
                                Pexels
                            </a>
                            <a href={suggestion.sources.unsplash} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs bg-black hover:bg-slate-800 dark:bg-slate-900 dark:border dark:border-slate-700 text-white px-3 py-2 rounded-lg transition-colors">
                                Unsplash
                            </a>
                            <a href={suggestion.sources.pinterest} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs bg-[#E60023] hover:bg-[#bd081c] text-white px-3 py-2 rounded-lg transition-colors">
                                Pinterest
                            </a>
                        </div>
                    </div>
                  </div>

                  {suggestion.aiPrompt && (
                    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                         <div className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 font-bold mb-1">
                             <Wand2 className="w-3 h-3" /> Prompt para IA Generativa
                         </div>
                         <p className="text-xs text-slate-600 dark:text-slate-400 italic">"{suggestion.aiPrompt}"</p>
                    </div>
                  )}
                </>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400 text-sm italic border-2 border-dashed border-slate-100 dark:border-slate-700 rounded-lg">
                  No se requiere B-roll para este segmento.
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