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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 animate-fade-in">
        <div className="flex justify-between items-center mb-6 border-b pb-4">
          <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800">
            <Key className="w-5 h-5 text-indigo-600" />
            API Configuration
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-800 mb-4">
            <p className="font-semibold">Security Note:</p>
            Keys are stored in your browser's local storage only. They are never sent to our servers.
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Google Gemini API Key</label>
            <input
              type="password"
              className="w-full border border-slate-300 rounded-md p-2 focus:ring-2 focus:ring-indigo-500 outline-none"
              value={localConfig.geminiKey}
              onChange={(e) => setLocalConfig({ ...localConfig, geminiKey: e.target.value })}
              placeholder="AIzaSy..."
            />
            <p className="text-xs text-slate-500 mt-1">Required for analyzing scripts.</p>
          </div>
        </div>

        <div className="mt-8 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(localConfig)}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 font-medium"
          >
            <ShieldCheck className="w-4 h-4" />
            Save & Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;