import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileText, Settings, Loader2, PlayCircle, Download, AlertCircle, Plus, Menu } from 'lucide-react';
import SettingsModal from './components/SettingsModal';
import ScriptViewer from './components/ScriptViewer';
import Sidebar from './components/Sidebar';
import HowToGuide from './components/HowToGuide'; // Imported new component
import { parseDocx } from './services/docxService';
import { generateBrollPlan } from './services/geminiService';
import { downloadLocalFile } from './services/exportService';
import { saveSession, getHistory } from './services/historyService';
import { AppConfig, ScriptSegment, BrollSuggestion, UserProfile, HistorySession } from './types';

const INITIAL_CONFIG: AppConfig = {
  geminiKey: localStorage.getItem('br_geminiKey') || '',
};

// Hardcoded local user for history tracking
const LOCAL_USER: UserProfile = {
  email: 'local_user',
  name: 'Local User',
  picture: ''
};

function App() {
  // State
  const [config, setConfig] = useState<AppConfig>(INITIAL_CONFIG);
  const [history, setHistory] = useState<HistorySession[]>([]);
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false); // Mobile Menu State

  const [segments, setSegments] = useState<ScriptSegment[]>([]);
  const [suggestions, setSuggestions] = useState<BrollSuggestion[]>([]);
  const [currentFileName, setCurrentFileName] = useState<string>('');
  
  const [status, setStatus] = useState<'IDLE' | 'PARSING' | 'GENERATING' | 'EXPORTING'>('IDLE');
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Persistence
  useEffect(() => {
    localStorage.setItem('br_geminiKey', config.geminiKey);
  }, [config]);

  // Load History on Mount
  useEffect(() => {
    const loadedHistory = getHistory(LOCAL_USER.email);
    setHistory(loadedHistory);
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus('PARSING');
    setError(null);
    setSegments([]);
    setSuggestions([]);
    setCurrentFileName(file.name.replace('.docx', ''));

    try {
      const arrayBuffer = await file.arrayBuffer();
      const parsedSegments = await parseDocx(arrayBuffer);
      
      if (parsedSegments.length === 0) {
        throw new Error("No readable text found in the document.");
      }
      
      setSegments(parsedSegments);
      setStatus('IDLE');
    } catch (err: any) {
      setError(err.message || "Failed to parse file");
      setStatus('IDLE');
    }
  };

  const handleGenerate = async () => {
    if (!config.geminiKey) {
        setIsSettingsOpen(true);
        setError("Please enter your Gemini API Key in settings.");
        return;
    }

    setStatus('GENERATING');
    setError(null);

    try {
      // Pass the key from state to the service
      const results = await generateBrollPlan(segments, config.geminiKey);
      setSuggestions(results);
      
      // Save to History
      saveSession(LOCAL_USER.email, currentFileName, segments, results);
      // Refresh history locally
      setHistory(getHistory(LOCAL_USER.email));

    } catch (err: any) {
      setError(err.message || "AI Generation failed");
    } finally {
      setStatus('IDLE');
    }
  };

  const handleDownload = () => {
    setStatus('EXPORTING');
    try {
      const docName = `B-Roll - ${currentFileName}`;
      downloadLocalFile(docName, segments, suggestions);
      // Small delay to show state change
      setTimeout(() => setStatus('IDLE'), 1000);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Download failed.");
      setStatus('IDLE');
    }
  };

  const handleSelectHistory = (session: HistorySession) => {
      setSegments(session.segments);
      setSuggestions(session.suggestions);
      setCurrentFileName(session.scriptName);
      setError(null);
      setIsMobileMenuOpen(false); // Close menu on selection
  };

  const handleNewProject = () => {
    setSegments([]);
    setSuggestions([]);
    setCurrentFileName('');
    setStatus('IDLE');
    setError(null);
    if (fileInputRef.current) {
        fileInputRef.current.value = '';
    }
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      {/* Sidebar - Responsive */}
      <Sidebar 
        user={LOCAL_USER} 
        history={history} 
        onSelectSession={handleSelectHistory}
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
      />

      {/* Main Container */}
      {/* md:ml-64 ensures space for sidebar on desktop, ml-0 on mobile */}
      <div className="flex-1 flex flex-col md:ml-64 transition-all w-full">
        
        {/* Header */}
        <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
            <div className="max-w-6xl mx-auto px-4 md:px-6 py-3 md:py-4 flex justify-between items-center">
            
            <div className="flex items-center gap-3">
                {/* Mobile Menu Button */}
                <button 
                    onClick={() => setIsMobileMenuOpen(true)}
                    className="md:hidden p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                    <Menu className="w-6 h-6" />
                </button>

                <div className="w-9 h-9 md:w-10 md:h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-indigo-200 shrink-0">
                    <PlayCircle className="w-5 h-5 md:w-6 md:h-6" />
                </div>
                <div className="overflow-hidden">
                    <h1 className="text-lg md:text-xl font-bold text-slate-900 tracking-tight truncate">B-Roll Gen</h1>
                    <p className="text-[10px] md:text-xs text-slate-500 font-medium truncate max-w-[150px] md:max-w-none">
                        {currentFileName ? currentFileName : "New Project"}
                    </p>
                </div>
            </div>
            
            <div className="flex items-center gap-2 md:gap-3">
                <button
                    onClick={handleNewProject}
                    className="flex items-center gap-2 px-3 py-2 md:px-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-xs md:text-sm font-medium shadow-sm"
                >
                    <Plus className="w-4 h-4" />
                    <span className="hidden md:inline">New Project</span>
                    <span className="md:hidden">New</span>
                </button>
                <button
                    onClick={() => setIsSettingsOpen(true)}
                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                    title="Settings"
                >
                    <Settings className="w-5 h-5" />
                </button>
            </div>
            </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 max-w-6xl w-full mx-auto px-4 md:px-6 py-6 md:py-8">
            
            {/* Description Paragraph (Only visible on empty state) */}
            {segments.length === 0 && (
                <div className="mb-8 text-center max-w-3xl mx-auto bg-indigo-50/50 p-6 rounded-2xl border border-indigo-100">
                    <p className="text-slate-700 text-base md:text-lg leading-relaxed font-medium">
                        Convierte tus guiones en planes visuales al instante. Sube tu archivo Word (.docx) y obtén sugerencias detalladas de imágenes y videos (B-Roll) que encajen perfectamente con tu historia.
                    </p>
                </div>
            )}

            {/* Error Banner */}
            {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-3 animate-fade-in text-sm md:text-base">
                <AlertCircle className="w-5 h-5 shrink-0" />
                {error}
            </div>
            )}

            {/* Empty State / Upload */}
            {segments.length === 0 && (
            <>
                <div className="mt-4 text-center p-8 md:p-12 border-2 border-dashed border-slate-300 rounded-2xl bg-white hover:bg-slate-50 transition-colors">
                    <div className="w-14 h-14 md:w-16 md:h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Upload className="w-7 h-7 md:w-8 md:h-8" />
                    </div>
                    <h2 className="text-xl md:text-2xl font-bold text-slate-800 mb-2">Sube tu Guion</h2>
                    <p className="text-slate-500 mb-6 md:mb-8 max-w-md mx-auto text-sm md:text-base">
                        Selecciona un archivo .docx. Extraeremos el texto y generaremos sugerencias visuales rigurosas.
                    </p>
                    <input
                        type="file"
                        accept=".docx"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        className="hidden"
                    />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full md:w-auto px-8 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium shadow-lg shadow-indigo-200 transition-all transform hover:-translate-y-1 active:scale-95"
                        disabled={status === 'PARSING'}
                    >
                        {status === 'PARSING' ? <div className="flex items-center justify-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Parsing...</div> : "Seleccionar Documento"}
                    </button>
                </div>
                
                {/* How to Guide (Rendered below upload box) */}
                <HowToGuide />
            </>
            )}

            {/* Dashboard */}
            {segments.length > 0 && (
            <div className="space-y-6 md:space-y-8">
                {/* Toolbar */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200 sticky top-20 z-20">
                    <div className="flex items-center gap-2 text-slate-600 text-sm md:text-base">
                        <FileText className="w-4 h-4 md:w-5 md:h-5" />
                        <span className="font-semibold">{segments.length} script segments</span>
                    </div>
                    
                    <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                        <button
                        onClick={handleGenerate}
                        disabled={status !== 'IDLE' || suggestions.length > 0}
                        className={`w-full sm:w-auto px-4 md:px-6 py-2.5 rounded-lg font-medium flex justify-center items-center gap-2 transition-colors text-sm md:text-base ${
                            suggestions.length > 0 
                            ? 'bg-emerald-100 text-emerald-700 cursor-default' 
                            : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-100'
                        }`}
                        >
                        {status === 'GENERATING' ? (
                            <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing...</>
                        ) : suggestions.length > 0 ? (
                            "Visuals Generated"
                        ) : (
                            "Generate Visuals"
                        )}
                        </button>

                        {suggestions.length > 0 && (
                        <button
                            onClick={handleDownload}
                            disabled={status === 'EXPORTING'}
                            className="w-full sm:w-auto px-4 md:px-6 py-2.5 rounded-lg font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 flex justify-center items-center gap-2 text-sm md:text-base"
                        >
                            {status === 'EXPORTING' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            Download (.md)
                        </button>
                        )}
                    </div>
                </div>

                <ScriptViewer segments={segments} suggestions={suggestions} />
            </div>
            )}
        </main>

        <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            config={config}
            onSave={(newConfig) => {
            setConfig(newConfig);
            setIsSettingsOpen(false);
            }}
        />
      </div>
    </div>
  );
}

export default App;