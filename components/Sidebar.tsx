import React from 'react';
import { HistorySession, UserProfile } from '../types';
import { History, Clock, FileVideo, User, X, Trash2 } from 'lucide-react';

interface Props {
  user: UserProfile;
  history: HistorySession[];
  onSelectSession: (session: HistorySession) => void;
  onDeleteSession: (sessionId: string) => void;
  isOpen: boolean;       
  onClose: () => void;   
}

const Sidebar: React.FC<Props> = ({ user, history, onSelectSession, onDeleteSession, isOpen, onClose }) => {
  // Mobile Overlay Classes
  const mobileClasses = `fixed inset-0 z-50 bg-slate-900 dark:bg-slate-950 transform transition-transform duration-300 ease-in-out ${
    isOpen ? 'translate-x-0' : '-translate-x-full'
  } md:translate-x-0 md:static md:block md:w-64 md:h-screen md:border-r md:border-slate-800 md:shadow-xl flex flex-col`;

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
            onClick={onClose}
        />
      )}

      <div className={mobileClasses}>
        
        {/* Header */}
        <div className="flex md:hidden justify-between items-center p-4 border-b border-slate-800 bg-slate-950">
            <span className="text-slate-100 font-bold flex items-center gap-2">
                <History className="w-5 h-5 text-indigo-500" />
                Historial
            </span>
            <button 
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded-full"
            >
                <X className="w-5 h-5" />
            </button>
        </div>

        {/* User Profile */}
        <div className="p-4 md:p-6 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center gap-4 mb-1">
               <div className="w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-900/50">
                   <User className="w-6 h-6" />
               </div>
            <div className="overflow-hidden flex-1">
              <p className="text-base font-bold text-white truncate">{user.name}</p>
              <p className="text-xs text-slate-400 truncate flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                Sesión Activa
              </p>
            </div>
          </div>
        </div>

        {/* History List */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-slate-900 dark:bg-slate-950">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2 pl-2">
              <History className="w-4 h-4" /> Proyectos Recientes
          </h3>
          
          {history.length === 0 ? (
              <div className="p-6 text-center border border-dashed border-slate-800 rounded-xl bg-slate-800/50">
                  <p className="text-sm text-slate-500 italic">Sin historial.</p>
              </div>
          ) : (
              <div className="space-y-3">
                  {history.map(session => (
                      <div
                          key={session.id}
                          className="group relative w-full text-left p-4 rounded-xl bg-slate-800/50 hover:bg-slate-800 transition-all border border-transparent hover:border-slate-700"
                      >
                          <div 
                            className="cursor-pointer"
                            onClick={() => {
                                onSelectSession(session);
                                onClose(); 
                            }}
                          >
                            <div className="flex items-center gap-3 text-indigo-300 mb-2">
                                <FileVideo className="w-4 h-4 shrink-0" />
                                <span className="text-sm font-bold truncate w-[140px]">{session.scriptName}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                <Clock className="w-3 h-3" />
                                {new Date(session.date).toLocaleDateString()}
                            </div>
                          </div>

                          <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                if(window.confirm('¿Estás seguro de que quieres eliminar este proyecto?')) {
                                    onDeleteSession(session.id);
                                }
                            }}
                            className="absolute top-3 right-3 p-2 text-slate-600 hover:text-red-400 hover:bg-slate-700 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                            title="Eliminar proyecto"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                      </div>
                  ))}
              </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 text-center text-xs text-slate-600 bg-slate-950">
            <p>Generador de B-Roll v1.2</p>
            <p className="opacity-50 mt-1">Modo Local Storage</p>
        </div>
      </div>
    </>
  );
};

export default Sidebar;