import React, { useState, useEffect } from 'react';
import { AppConfig } from '../types';
import { X, Key, ShieldCheck } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  config: AppConfig;
  onSave: (config: AppConfig) => void;
}

const SettingsModal: React.FC<Props> = ({ isOpen, onClose, config, onSave }) => {
  const [localConfig, setLocalConfig] = useState(config);

  useEffect(() => {
    setLocalConfig(config);
  }, [config]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-lg p-6 animate-fade-in border border-slate-200 dark:border-slate-700">
        <div className="flex justify-between items-center mb-6 border-b border-slate-200 dark:border-slate-700 pb-4">
          <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800 dark:text-white">
            <Key className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            Configuración
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="bg-blue-50 dark:bg-blue-900/30 p-3 rounded-lg text-sm text-blue-800 dark:text-blue-300 mb-4 border border-blue-100 dark:border-blue-800">
            <p className="font-semibold">Nota de Seguridad:</p>
            Las llaves se guardan en el "Local Storage" de tu navegador. Nunca se envían a servidores externos que no sean los de Google.
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Google Gemini API Key</label>
            <input
              type="password"
              className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-md p-2 focus:ring-2 focus:ring-indigo-500 outline-none"
              value={localConfig.geminiKey}
              onChange={(e) => setLocalConfig({ ...localConfig, geminiKey: e.target.value })}
              placeholder="Pegar clave AIzaSy..."
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Requerida para el análisis de los guiones.</p>
          </div>
        </div>

        <div className="mt-8 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => onSave(localConfig)}
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white rounded-lg transition-colors flex items-center gap-2 font-medium"
          >
            <ShieldCheck className="w-4 h-4" />
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;