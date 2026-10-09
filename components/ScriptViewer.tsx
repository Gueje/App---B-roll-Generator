import React, { useState } from 'react';
import { ScriptSegment, BrollSuggestion, MediaType } from '../types';
import { Video, Image as ImageIcon, Wand2, StickyNote, ExternalLink, Youtube, Download, Copy, Check, Film, Search } from 'lucide-react';

interface Props {
  segments: ScriptSegment[];
  suggestions: BrollSuggestion[];
}

const ScriptViewer: React.FC<Props> = ({ segments, suggestions }) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyPrompt = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId(null);
    }, 2000);
  };

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
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-1 rounded text-xs font-bold flex items-center gap-1 ${
                        suggestion.mediaType === MediaType.VIDEO 
                            ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300' 
                            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
                      }`}>
                        {suggestion.mediaType === MediaType.VIDEO ? <Video className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
                        {suggestion.mediaType === 'VIDEO' ? 'VIDEO' : 'IMAGEN'}
                      </span>
                      <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/40 border border-indigo-200 dark:border-indigo-800 px-2 py-1 rounded">
                        🎨 {suggestion.styleParams.style}
                      </span>
                      {suggestion.styleParams.mood && suggestion.styleParams.mood !== "Auto-Detect" && (
                        <span className="text-xs text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-600 px-2 py-1 rounded">
                          Tono: {suggestion.styleParams.mood}
                        </span>
                      )}
                    </div>
                  </div>

                  <h3 className="font-medium text-lg text-slate-900 dark:text-white mb-2 leading-snug">
                    {suggestion.visualIntent}
                  </h3>

                  <div className="bg-slate-100 dark:bg-slate-700/50 rounded-lg p-3.5 mb-4 space-y-2">
                     <div>
                       <div className="flex items-center gap-1 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                          <Search className="w-3 h-3 text-indigo-500" /> Búsqueda Visual Específica (Google / Pinterest)
                       </div>
                       <p className="text-slate-900 dark:text-slate-100 font-mono text-xs bg-white dark:bg-slate-800 p-2 rounded border border-slate-200 dark:border-slate-600 select-all">
                         {suggestion.searchQuery.mainQuery}
                       </p>
                     </div>
                     
                     {/* YouTube specific query */}
                     {suggestion.searchQuery.youtubeQuery && (
                       <div>
                          <div className="flex items-center gap-1 text-[11px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wider mb-1">
                             <Youtube className="w-3 h-3" /> Búsqueda en YouTube (Metraje / Archivo / B-Roll)
                          </div>
                          <p className="text-slate-900 dark:text-slate-100 font-mono text-xs bg-white dark:bg-slate-800 p-2 rounded border border-slate-200 dark:border-slate-600 select-all">
                             {suggestion.searchQuery.youtubeQuery}
                          </p>
                       </div>
                     )}

                     {/* Stock Query (English for Pexels / Unsplash) */}
                     {suggestion.searchQuery.stockQuery && (
                       <div>
                          <div className="flex items-center gap-1 text-[11px] font-bold text-teal-600 dark:text-teal-400 uppercase tracking-wider mb-1">
                             <Film className="w-3 h-3" /> Stock Keywords (Pexels / Unsplash)
                          </div>
                          <p className="text-slate-900 dark:text-slate-100 font-mono text-xs bg-white dark:bg-slate-800 p-2 rounded border border-slate-200 dark:border-slate-600 select-all">
                             {suggestion.searchQuery.stockQuery}
                          </p>
                       </div>
                     )}

                     {suggestion.searchQuery.keywords.length > 0 && (
                       <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-200 dark:border-slate-600">
                          {suggestion.searchQuery.keywords.slice(0, 5).map(k => (
                            <span key={k} className="text-[11px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded">#{k}</span>
                          ))}
                       </div>
                     )}
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
                        <p className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">Enlaces Directos a Recursos</p>
                        <div className="flex flex-wrap gap-2">
                            <a href={suggestion.sources.googleImages} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 px-3 py-2 rounded-lg transition-colors font-medium shadow-xs">
                                <img src="https://www.google.com/favicon.ico" className="w-3.5 h-3.5" alt="Google" />
                                Google Images
                            </a>
                            <a href={suggestion.sources.youtube} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs bg-[#FF0000] hover:bg-[#cc0000] text-white px-3 py-2 rounded-lg transition-colors font-medium shadow-xs">
                                <Youtube className="w-3.5 h-3.5" />
                                YouTube
                            </a>
                            <a href={suggestion.sources.pexels} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs bg-[#05a081] hover:bg-[#048a6f] text-white px-3 py-2 rounded-lg transition-colors font-medium shadow-xs">
                                <Film className="w-3.5 h-3.5" />
                                Pexels
                            </a>
                            <a href={suggestion.sources.unsplash} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs bg-black hover:bg-slate-800 dark:bg-slate-900 dark:border dark:border-slate-700 text-white px-3 py-2 rounded-lg transition-colors font-medium shadow-xs">
                                Unsplash
                            </a>
                            <a href={suggestion.sources.pinterest} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs bg-[#E60023] hover:bg-[#bd081c] text-white px-3 py-2 rounded-lg transition-colors font-medium shadow-xs">
                                Pinterest
                            </a>
                        </div>
                    </div>
                  </div>

                  {suggestion.aiPrompt && (
                    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                         <div className="flex items-center justify-between gap-2 mb-2">
                             <div className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-wider">
                                 <Wand2 className="w-3.5 h-3.5" /> Prompt para IA Generativa (Estilo Aplicado)
                             </div>
                             <button
                               onClick={() => handleCopyPrompt(segment.id, suggestion.aiPrompt || '')}
                               className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 font-medium transition-colors"
                               title="Copiar prompt para Midjourney / Imagen / Flux"
                             >
                               {copiedId === segment.id ? (
                                 <>
                                   <Check className="w-3 h-3 text-emerald-600" />
                                   <span>¡Copiado!</span>
                                 </>
                               ) : (
                                 <>
                                   <Copy className="w-3 h-3" />
                                   <span>Copiar Prompt</span>
                                 </>
                               )}
                             </button>
                         </div>
                         <p className="text-xs text-slate-700 dark:text-slate-300 font-mono bg-slate-50 dark:bg-slate-900/60 p-3 rounded-lg border border-slate-200 dark:border-slate-700 leading-relaxed select-all">
                           {suggestion.aiPrompt}
                         </p>
                    </div>
                  )}
                </>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 text-sm border-2 border-dashed border-slate-100 dark:border-slate-700 rounded-lg p-8 text-center space-y-2">
                  <div className="w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-900 flex items-center justify-center text-slate-300">
                    <Wand2 className="w-4 h-4" />
                  </div>
                  <p className="italic">Bloque pendiente de generación visual.</p>
                  <p className="text-[10px] uppercase font-bold text-slate-300 tracking-widest">Usa el botón superior para procesar este bloque</p>
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