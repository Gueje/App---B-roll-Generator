import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileText, Settings, Loader2, PlayCircle, Download, AlertCircle, Plus } from 'lucide-react';
import SettingsModal from './components/SettingsModal';
import ScriptViewer from './components/ScriptViewer';
import Sidebar from './components/Sidebar';
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
      const results = await generateBrollPlan(segments);
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
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <Sidebar 
        user={LOCAL_USER} 
        history={history} 
        onSelectSession={handleSelectHistory}
      />

      <div className="flex-1 flex flex-col ml-64 transition-all">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
            <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                <PlayCircle className="w-6 h-6" />
                </div>
                <div>
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">B-Roll Generator</h1>
                <p className="text-xs text-slate-500 font-medium">
                    {currentFileName ? `Project: ${currentFileName}` : "New Project"}
                </p>
                </div>
            </div>
            
            <div className="flex items-center gap-3">
                <button
                    onClick={handleNewProject}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium shadow-sm"
                >
                    <Plus className="w-4 h-4" />
                    New Project
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

        {/* Main Content */}
        <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8">
            
            {/* Description Paragraph */}
            <div className="mb-8 text-center max-w-3xl mx-auto bg-indigo-50/50 p-6 rounded-2xl border border-indigo-100">
                <p className="text-slate-700 text-lg leading-relaxed font-medium">
                    Convierte tus guiones en planes visuales al instante. Sube tu archivo Word (.docx) y obtén sugerencias detalladas de imágenes y videos (B-Roll) que encajen perfectamente con tu historia, manteniendo un estilo visual único y coherente.
                </p>
            </div>

            {/* Error Banner */}
            {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-3 animate-fade-in">
                <AlertCircle className="w-5 h-5 shrink-0" />
                {error}
            </div>
            )}

            {/* Empty State / Upload */}
            {segments.length === 0 && (
            <div className="mt-4 text-center p-12 border-2 border-dashed border-slate-300 rounded-2xl bg-white hover:bg-slate-50 transition-colors">
                <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Upload className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold text-slate-800 mb-2">Sube tu Guion</h2>
                <p className="text-slate-500 mb-8 max-w-md mx-auto">
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
                className="px-8 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium shadow-lg shadow-indigo-200 transition-all transform hover:-translate-y-1"
                disabled={status === 'PARSING'}
                >
                {status === 'PARSING' ? <Loader2 className="w-5 h-5 animate-spin" /> : "Seleccionar Documento"}
                </button>
            </div>
            )}

            {/* Dashboard */}
            {segments.length > 0 && (
            <div className="space-y-8">
                {/* Toolbar */}
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                <div className="flex items-center gap-2 text-slate-600">
                    <FileText className="w-5 h-5" />
                    <span className="font-semibold">{segments.length} script segments found</span>
                </div>
                
                <div className="flex gap-3">
                    <button
                    onClick={handleGenerate}
                    disabled={status !== 'IDLE' || suggestions.length > 0}
                    className={`px-6 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-colors ${
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
                        className="px-6 py-2.5 rounded-lg font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 flex items-center gap-2"
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