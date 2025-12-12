import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileText, Settings, Loader2, PlayCircle, Download, AlertCircle } from 'lucide-react';
import SettingsModal from './components/SettingsModal';
import ScriptViewer from './components/ScriptViewer';
import { parseDocx } from './services/docxService';
import { generateBrollPlan } from './services/geminiService';
import { initializeGoogleAuth, signInToGoogle, createBrollDoc } from './services/googleDocsService';
import { AppConfig, ScriptSegment, BrollSuggestion } from './types';

const INITIAL_CONFIG: AppConfig = {
  geminiKey: localStorage.getItem('br_geminiKey') || '',
  googleClientId: localStorage.getItem('br_googleClientId') || '',
  googleApiKey: localStorage.getItem('br_googleApiKey') || '',
};

function App() {
  const [config, setConfig] = useState<AppConfig>(INITIAL_CONFIG);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [segments, setSegments] = useState<ScriptSegment[]>([]);
  const [suggestions, setSuggestions] = useState<BrollSuggestion[]>([]);
  
  const [status, setStatus] = useState<'IDLE' | 'PARSING' | 'GENERATING' | 'EXPORTING'>('IDLE');
  const [error, setError] = useState<string | null>(null);
  const [exportUrl, setExportUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem('br_geminiKey', config.geminiKey);
    localStorage.setItem('br_googleClientId', config.googleClientId);
    localStorage.setItem('br_googleApiKey', config.googleApiKey);
  }, [config]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus('PARSING');
    setError(null);
    setSegments([]);
    setSuggestions([]);
    setExportUrl(null);

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
    setStatus('GENERATING');
    setError(null);

    try {
      // Chunking strategy could be implemented here for very long scripts
      const results = await generateBrollPlan(segments);
      setSuggestions(results);
    } catch (err: any) {
      setError(err.message || "AI Generation failed");
    } finally {
      setStatus('IDLE');
    }
  };

  const handleExport = async () => {
    if (!config.googleClientId || !config.googleApiKey) {
      setIsSettingsOpen(true);
      return;
    }

    setStatus('EXPORTING');
    try {
      await initializeGoogleAuth(config.googleClientId, config.googleApiKey);
      const signedIn = await signInToGoogle();
      
      if (!signedIn) {
        throw new Error("Google Sign-In failed or was cancelled.");
      }

      const docName = `B-Roll - ${new Date().toISOString().split('T')[0]}`;
      const { docUrl, stats } = await createBrollDoc(docName, segments, suggestions);
      
      setExportUrl(docUrl);
      console.log("Export stats:", stats);
      
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Export to Google Docs failed.");
    } finally {
      setStatus('IDLE');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-indigo-200">
               <PlayCircle className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">B-Roll Generator</h1>
              <p className="text-xs text-slate-500 font-medium">Script to Visuals Pipeline</p>
            </div>
          </div>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl mx-auto px-6 py-8 w-full">
        
        {/* Error Banner */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-3 animate-fade-in">
            <AlertCircle className="w-5 h-5 shrink-0" />
            {error}
          </div>
        )}

        {/* Empty State / Upload */}
        {segments.length === 0 && (
          <div className="mt-12 text-center p-12 border-2 border-dashed border-slate-300 rounded-2xl bg-white hover:bg-slate-50 transition-colors">
            <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Upload className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Upload your Script</h2>
            <p className="text-slate-500 mb-8 max-w-md mx-auto">
              Select a .docx file. We'll extract text and notes, then generate visual suggestions.
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
              {status === 'PARSING' ? <Loader2 className="w-5 h-5 animate-spin" /> : "Select Document"}
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
                    onClick={handleExport}
                    disabled={status === 'EXPORTING'}
                    className="px-6 py-2.5 rounded-lg font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    {status === 'EXPORTING' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    Export to Docs
                  </button>
                )}
              </div>
            </div>

            {exportUrl && (
              <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-3 text-emerald-800">
                  <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center">
                    <Download className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-bold block">Export Successful!</span>
                    <span className="text-sm">Your B-roll plan is ready in Google Docs.</span>
                  </div>
                </div>
                <a 
                  href={exportUrl} 
                  target="_blank" 
                  rel="noreferrer"
                  className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
                >
                  Open Document
                </a>
              </div>
            )}

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
  );
}

export default App;