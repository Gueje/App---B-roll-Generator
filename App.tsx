import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileText, Settings, Loader2, PlayCircle, Download, AlertCircle, Plus, Menu, RotateCcw, Moon, Sun, Sliders, Palette, Monitor, Maximize } from 'lucide-react';
import SettingsModal from './components/SettingsModal';
import ScriptViewer from './components/ScriptViewer';
import Sidebar from './components/Sidebar';
import HowToGuide from './components/HowToGuide'; 
import CustomStyleModal from './components/CustomStyleModal';
import { parseDocx } from './services/docxService';
import { parsePdf } from './services/pdfService';
import { generateBrollPlan } from './services/geminiService';
import { downloadLocalFile } from './services/exportService';
import { saveSession, getHistory, deleteSession } from './services/historyService';
import { AppConfig, ScriptSegment, BrollSuggestion, UserProfile, HistorySession, CustomStyle } from './types';

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
  // Global State
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('theme') === 'dark';
  });

  // App State
  const [config, setConfig] = useState<AppConfig>(INITIAL_CONFIG);
  const [history, setHistory] = useState<HistorySession[]>([]);
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false); 
  const [isCustomStyleModalOpen, setIsCustomStyleModalOpen] = useState(false);

  const [segments, setSegments] = useState<ScriptSegment[]>([]);
  const [suggestions, setSuggestions] = useState<BrollSuggestion[]>([]);
  const [currentFileName, setCurrentFileName] = useState<string>('');
  
  const [customStyles, setCustomStyles] = useState<CustomStyle[]>(() => {
    const saved = localStorage.getItem('br_customStyles');
    return saved ? JSON.parse(saved) : [];
  });

  // Advanced Generation Options
  // Default to Auto-Detect for better initial results
  const [userStyle, setUserStyle] = useState("Auto-Detect");
  const [userTone, setUserTone] = useState("Auto-Detect");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [resolution, setResolution] = useState("4k");

  const [status, setStatus] = useState<'IDLE' | 'PARSING' | 'GENERATING' | 'EXPORTING'>('IDLE');
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Persistence
  useEffect(() => {
    localStorage.setItem('br_geminiKey', config.geminiKey);
  }, [config]);

  useEffect(() => {
    localStorage.setItem('br_customStyles', JSON.stringify(customStyles));
  }, [customStyles]);

  // Dark Mode Effect
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  // Load History on Mount
  useEffect(() => {
    const loadedHistory = getHistory(LOCAL_USER.email);
    setHistory(loadedHistory);
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement> | React.DragEvent) => {
    let file: File | undefined;
    
    if ('files' in e.target && e.target.files) {
      file = e.target.files[0];
    } else if ('dataTransfer' in e && e.dataTransfer.files) {
      file = e.dataTransfer.files[0];
    }

    if (!file) return;

    const isDocx = file.name.endsWith('.docx');
    const isPdf = file.name.endsWith('.pdf');

    if (!isDocx && !isPdf) {
      setError("Formato de archivo no soportado. Por favor sube un archivo .docx o .pdf");
      return;
    }

    setStatus('PARSING');
    setError(null);
    setSegments([]);
    setSuggestions([]);
    setCurrentFileName(file.name.replace(/\.(docx|pdf)$/, ''));

    try {
      const arrayBuffer = await file.arrayBuffer();
      let parsedSegments: ScriptSegment[] = [];
      
      if (isDocx) {
        parsedSegments = await parseDocx(arrayBuffer);
      } else {
        parsedSegments = await parsePdf(arrayBuffer);
      }
      
      if (parsedSegments.length === 0) {
        throw new Error("No se encontró texto legible en el documento.");
      }
      
      setSegments(parsedSegments);
      setStatus('IDLE');
    } catch (err: any) {
      setError(err.message || "Error al leer el archivo");
      setStatus('IDLE');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileUpload(e);
  };

  const handleGenerate = async () => {
    if (!config.geminiKey) {
        setIsSettingsOpen(true);
        setError("Por favor configura tu API Key de Gemini en los ajustes.");
        return;
    }

    setStatus('GENERATING');
    setError(null);

    try {
      // Find if userStyle is a custom style
      const customStyle = customStyles.find(s => s.id === userStyle);
      
      // Pass the key AND the new style/tone options
      const results = await generateBrollPlan(
        segments, 
        config.geminiKey, 
        customStyle ? "Custom" : userStyle, 
        userTone,
        aspectRatio,
        resolution,
        customStyle
      );
      setSuggestions(results);
      
      // Save to History
      saveSession(LOCAL_USER.email, currentFileName, segments, results);
      // Refresh history locally
      setHistory(getHistory(LOCAL_USER.email));

    } catch (err: any) {
      setError(err.message || "Falló la generación con IA");
    } finally {
      setStatus('IDLE');
    }
  };

  const handleRegenerate = () => {
      // Clears current suggestions to trigger re-run
      setSuggestions([]); 
      handleGenerate();
  };

  const handleDeleteSession = (sessionId: string) => {
    const updatedHistory = deleteSession(LOCAL_USER.email, sessionId);
    setHistory(updatedHistory);
    // If the currently viewed session is deleted, clear the view
    // Note: We don't strictly have a 'currentSessionId' state, but we check if segments match.
    // Simpler approach: Just keep current view, but next refresh it's gone from history.
  };

  const handleDownload = () => {
    setStatus('EXPORTING');
    try {
      const docName = `B-Roll - ${currentFileName}`;
      downloadLocalFile(docName, segments, suggestions);
      setTimeout(() => setStatus('IDLE'), 1000);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Error en descarga.");
      setStatus('IDLE');
    }
  };

  const handleSelectHistory = (session: HistorySession) => {
      setSegments(session.segments);
      setSuggestions(session.suggestions);
      setCurrentFileName(session.scriptName);
      setError(null);
      setIsMobileMenuOpen(false); 
  };

  const handleNewProject = () => {
    setSegments([]);
    setSuggestions([]);
    setCurrentFileName('');
    setStatus('IDLE');
    setError(null);
    // Reset options to default
    setUserStyle("Auto-Detect");
    setUserTone("Auto-Detect");
    if (fileInputRef.current) {
        fileInputRef.current.value = '';
    }
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors flex flex-col md:flex-row">
      {/* Sidebar - Responsive */}
      <Sidebar 
        user={LOCAL_USER} 
        history={history} 
        onSelectSession={handleSelectHistory}
        onDeleteSession={handleDeleteSession}
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
      />

      {/* Main Container */}
      <div className="flex-1 flex flex-col md:ml-64 transition-all w-full">
        
        {/* Header */}
        <header className="bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30 transition-colors">
            <div className="max-w-6xl mx-auto px-4 md:px-6 py-3 md:py-4 flex justify-between items-center">
            
            <div className="flex items-center gap-3">
                {/* Mobile Menu Button */}
                <button 
                    onClick={() => setIsMobileMenuOpen(true)}
                    className="md:hidden p-2 -ml-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                >
                    <Menu className="w-6 h-6" />
                </button>

                <div className="w-9 h-9 md:w-10 md:h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-indigo-200 dark:shadow-none shrink-0">
                    <PlayCircle className="w-5 h-5 md:w-6 md:h-6" />
                </div>
                <div className="overflow-hidden">
                    <h1 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white tracking-tight truncate">Generador B-Roll</h1>
                    <div className="flex items-center gap-2">
                        <p className="text-[10px] md:text-xs text-slate-500 dark:text-slate-400 font-medium truncate max-w-[150px] md:max-w-none">
                            {currentFileName ? currentFileName : "Nuevo Proyecto"}
                        </p>
                        {segments.length > 0 && (
                            <span className="text-[10px] md:text-xs px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 rounded-md font-bold border border-indigo-100 dark:border-indigo-800 shrink-0 animate-fade-in">
                                {segments.length} bloques
                            </span>
                        )}
                    </div>
                </div>
            </div>
            
            <div className="flex items-center gap-2 md:gap-3">
                 {/* Dark Mode Toggle */}
                 <button
                    onClick={() => setDarkMode(!darkMode)}
                    className="p-2 text-slate-400 hover:text-indigo-500 dark:hover:text-yellow-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
                >
                    {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                </button>

                <button
                    onClick={handleNewProject}
                    className="flex items-center gap-2 px-3 py-2 md:px-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-xs md:text-sm font-medium shadow-sm"
                >
                    <Plus className="w-4 h-4" />
                    <span className="hidden md:inline">Nuevo</span>
                    <span className="md:hidden">Nuevo</span>
                </button>
                <button
                    onClick={() => setIsSettingsOpen(true)}
                    className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
                    title="Configuración"
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
                <div className="mb-8 text-center max-w-3xl mx-auto bg-indigo-50/50 dark:bg-indigo-900/20 p-6 rounded-2xl border border-indigo-100 dark:border-indigo-900">
                    <p className="text-slate-700 dark:text-slate-300 text-base md:text-lg leading-relaxed font-medium">
                        Convierte tus guiones en planes visuales al instante. Sube tu archivo Word (.docx) o PDF (.pdf) y obtén sugerencias detalladas de imágenes y videos (B-Roll) que encajen perfectamente con tu historia.
                    </p>
                </div>
            )}

            {/* Error Banner */}
            {error && (
            <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg flex items-center gap-3 animate-fade-in text-sm md:text-base">
                <AlertCircle className="w-5 h-5 shrink-0" />
                {error}
            </div>
            )}

            {/* Empty State / Upload */}
            {segments.length === 0 && (
            <>
                <div 
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`mt-4 text-center p-8 md:p-12 border-2 border-dashed rounded-2xl transition-all ${
                        isDragging 
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 scale-[1.02]' 
                        : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                    }`}
                >
                    <div className="w-14 h-14 md:w-16 md:h-16 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Upload className="w-7 h-7 md:w-8 md:h-8" />
                    </div>
                    <h2 className="text-xl md:text-2xl font-bold text-slate-800 dark:text-white mb-2">Sube tu Guion</h2>
                    <p className="text-slate-500 dark:text-slate-400 mb-6 md:mb-8 max-w-md mx-auto text-sm md:text-base">
                        Arrastra y suelta o selecciona un archivo .docx o .pdf. Extraeremos el texto y generaremos sugerencias visuales rigurosas.
                    </p>
                    <input
                        type="file"
                        accept=".docx,.pdf"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        className="hidden"
                    />
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full md:w-auto px-8 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium shadow-lg shadow-indigo-200 dark:shadow-none transition-all transform hover:-translate-y-1 active:scale-95 flex items-center justify-center gap-2"
                            disabled={status === 'PARSING'}
                        >
                            {status === 'PARSING' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                            {status === 'PARSING' ? "Leyendo..." : "Subir Guion"}
                        </button>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full md:w-auto px-8 py-3 bg-white dark:bg-slate-700 text-slate-700 dark:text-white border border-slate-300 dark:border-slate-600 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-600 font-medium transition-all"
                            disabled={status === 'PARSING'}
                        >
                            Seleccionar Documento
                        </button>
                    </div>

                    {/* Custom Style Section */}
                    <div className="mt-8 pt-8 border-t border-slate-100 dark:border-slate-700">
                        <div className="flex flex-col items-center">
                            <button 
                                onClick={() => setIsCustomStyleModalOpen(true)}
                                className="flex items-center gap-2 px-6 py-3 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded-xl hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-all font-bold shadow-sm"
                            >
                                <Palette className="w-5 h-5" />
                                Crear estilo visual
                            </button>
                            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 max-w-sm">
                                Define un estilo personalizado con imágenes de referencia e instrucciones detalladas para que la IA lo use en tus proyectos.
                            </p>
                        </div>
                    </div>
                </div>
                
                {/* How to Guide (Rendered below upload box) */}
                <HowToGuide />
            </>
            )}

            {/* Dashboard */}
            {segments.length > 0 && (
            <div className="space-y-6 md:space-y-8">
                
                {/* Toolbar & Advanced Options */}
                <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 space-y-4 md:space-y-0">
                    
                    {/* Top Row: Info + Action Buttons */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300 text-sm md:text-base">
                            <FileText className="w-4 h-4 md:w-5 md:h-5" />
                            <span className="font-semibold">Configuración de Generación</span>
                        </div>
                        
                        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                            
                            {/* Regenerate Button (Only if visuals exist) */}
                            {suggestions.length > 0 && (
                                <button 
                                    onClick={handleRegenerate}
                                    disabled={status !== 'IDLE'}
                                    className="px-4 py-2.5 rounded-lg font-medium border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 flex items-center justify-center gap-2 text-sm md:text-base transition-colors"
                                    title="Volver a generar con nuevos ajustes"
                                >
                                    <RotateCcw className="w-4 h-4" />
                                    <span className="hidden md:inline">Regenerar</span>
                                </button>
                            )}

                            <button
                                onClick={handleGenerate}
                                disabled={status !== 'IDLE' || suggestions.length > 0}
                                className={`w-full sm:w-auto px-4 md:px-6 py-2.5 rounded-lg font-medium flex justify-center items-center gap-2 transition-colors text-sm md:text-base ${
                                    suggestions.length > 0 
                                    ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 cursor-default' 
                                    : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-100 dark:shadow-none'
                                }`}
                            >
                            {status === 'GENERATING' ? (
                                <><Loader2 className="w-4 h-4 animate-spin" /> Analizando...</>
                            ) : suggestions.length > 0 ? (
                                "Visuales Generados"
                            ) : (
                                "Generar Visuales"
                            )}
                            </button>

                            {suggestions.length > 0 && (
                            <button
                                onClick={handleDownload}
                                disabled={status === 'EXPORTING'}
                                className="w-full sm:w-auto px-4 md:px-6 py-2.5 rounded-lg font-medium border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex justify-center items-center gap-2 text-sm md:text-base"
                            >
                                {status === 'EXPORTING' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                Descargar (.md)
                            </button>
                            )}
                        </div>
                    </div>

                    {/* Advanced Options Row (Visible when not generated yet, or when user wants to see settings) */}
                    {suggestions.length === 0 && (
                        <div className="pt-4 border-t border-slate-100 dark:border-slate-700 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1 flex items-center gap-1">
                                    <Sliders className="w-3 h-3" /> Estilo Visual
                                </label>
                                <select 
                                    value={userStyle}
                                    onChange={(e) => setUserStyle(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg p-2 text-sm text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    <optgroup label="Básicos">
                                        <option value="Auto-Detect">✨ Auto-Detect (IA Decision)</option>
                                        <option value="Cinematic & High Quality">Cinematográfico (Default)</option>
                                        <option value="Documentary & Raw">Documental / Realista</option>
                                        <option value="Minimalist & Clean">Minimalista / Corporativo</option>
                                        <option value="Cyberpunk & Neon">Cyberpunk / Futurista</option>
                                        <option value="Vintage & Grainy">Vintage / Retro</option>
                                        <option value="Bright & Commercial">Comercial / Publicidad TV</option>
                                        <option value="Dark & Moody">Oscuro / Dramático</option>
                                    </optgroup>
                                    {customStyles.length > 0 && (
                                        <optgroup label="Mis Estilos">
                                            {customStyles.map(style => (
                                                <option key={style.id} value={style.id}>🎨 {style.name}</option>
                                            ))}
                                        </optgroup>
                                    )}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
                                    Tono Narrativo
                                </label>
                                <select 
                                    value={userTone}
                                    onChange={(e) => setUserTone(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg p-2 text-sm text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="Auto-Detect">✨ Auto-Detect (IA Decision)</option>
                                    <option value="Neutral">Neutral (Informativo)</option>
                                    <option value="Emotional & Touching">Emocional / Conmovedor</option>
                                    <option value="Energetic & Fast">Energético / Rápido</option>
                                    <option value="Professional & Serious">Profesional / Serio</option>
                                    <option value="Funny & Lighthearted">Divertido / Ligero</option>
                                    <option value="Suspenseful">Misterioso / Suspenso</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1 flex items-center gap-1">
                                    <Monitor className="w-3 h-3" /> Relación de aspecto
                                </label>
                                <select 
                                    value={aspectRatio}
                                    onChange={(e) => setAspectRatio(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg p-2 text-sm text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="16:9">16:9 (Horizontal)</option>
                                    <option value="9:16">9:16 (Vertical)</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1 flex items-center gap-1">
                                    <Maximize className="w-3 h-3" /> Resolución
                                </label>
                                <select 
                                    value={resolution}
                                    onChange={(e) => setResolution(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg p-2 text-sm text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="2k">2k</option>
                                    <option value="4k">4k</option>
                                    <option value="8k">8k</option>
                                </select>
                            </div>
                            <div className="lg:col-span-4 text-[10px] text-slate-400 dark:text-slate-500 italic text-center">
                                Nota: Los bloques se definen por las frases e ideas de tu documento.
                            </div>
                        </div>
                    )}
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

        <CustomStyleModal 
            isOpen={isCustomStyleModalOpen}
            onClose={() => setIsCustomStyleModalOpen(false)}
            onSave={(newStyle) => {
                setCustomStyles([...customStyles, newStyle]);
                setUserStyle(newStyle.id); // Automatically select the new style
            }}
        />
      </div>
    </div>
  );
}

export default App;