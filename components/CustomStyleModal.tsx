import React, { useState, useRef } from 'react';
import { X, Upload, Image as ImageIcon, Trash2, Save, Info } from 'lucide-react';
import { CustomStyle } from '../types';

interface CustomStyleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (style: CustomStyle) => void;
}

const CustomStyleModal: React.FC<CustomStyleModalProps> = ({ isOpen, onClose, onSave }) => {
  const [name, setName] = useState('');
  const [instruction, setInstruction] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    if (!name || !instruction) {
      alert("Por favor completa el nombre y la instrucción.");
      return;
    }

    const newStyle: CustomStyle = {
      id: `style-${Date.now()}`,
      name,
      instruction,
      imageReference: imagePreview || undefined
    };

    onSave(newStyle);
    // Reset
    setName('');
    setInstruction('');
    setImagePreview(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-800 w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-indigo-600">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <ImageIcon className="w-5 h-5" />
            Crear Nuevo Estilo Visual
          </h2>
          <button onClick={onClose} className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          
          {/* Name Input */}
          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 uppercase mb-2">
              Nombre del Estilo
            </label>
            <input 
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Zanahoria Mecánica, Cyberpunk Neon..."
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            />
          </div>

          {/* Image Upload */}
          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 uppercase mb-2">
              Imagen de Referencia (Opcional)
            </label>
            <div 
              onClick={() => fileInputRef.current?.click()}
              className={`relative group cursor-pointer border-2 border-dashed rounded-2xl p-4 transition-all flex flex-col items-center justify-center min-h-[150px] ${
                imagePreview 
                ? 'border-indigo-500 bg-indigo-50/30 dark:bg-indigo-900/20' 
                : 'border-slate-300 dark:border-slate-700 hover:border-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-700/50'
              }`}
            >
              {imagePreview ? (
                <div className="relative w-full h-full flex items-center justify-center">
                  <img src={imagePreview} alt="Preview" className="max-h-[200px] rounded-lg shadow-md" />
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setImagePreview(null);
                    }}
                    className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full shadow-lg hover:bg-red-600 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <Upload className="w-10 h-10 text-slate-400 group-hover:text-indigo-500 mb-2 transition-colors" />
                  <p className="text-sm text-slate-500 dark:text-slate-400 text-center">
                    Haz clic para subir una imagen que defina el estilo visual
                  </p>
                </>
              )}
              <input 
                type="file"
                ref={fileInputRef}
                onChange={handleImageUpload}
                accept="image/*"
                className="hidden"
              />
            </div>
          </div>

          {/* Instruction Textarea */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase">
                Instrucción de Estilo
              </label>
              <div className="group relative">
                <Info className="w-4 h-4 text-slate-400 cursor-help" />
                <div className="absolute bottom-full right-0 mb-2 w-64 p-3 bg-slate-800 text-white text-[10px] rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 border border-slate-700">
                  Describe detalladamente el estilo. La IA usará esto para generar los prompts de cada escena.
                </div>
              </div>
            </div>
            <textarea 
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="Describe cómo quieres que se vean los visuales..."
              rows={6}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all resize-none font-mono text-sm"
            />
            <p className="mt-2 text-[10px] text-slate-500 dark:text-slate-400 italic">
              Tip: Puedes usar variables como [INSERTA AQUÍ LA DESCRIPCIÓN] para que la IA sepa dónde poner el contexto de la escena.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-3 bg-slate-50 dark:bg-slate-900/50">
          <button 
            onClick={onClose}
            className="px-6 py-2.5 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors"
          >
            Cancelar
          </button>
          <button 
            onClick={handleSave}
            className="px-8 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 dark:shadow-none transition-all flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            Guardar Estilo
          </button>
        </div>
      </div>
    </div>
  );
};

export default CustomStyleModal;
