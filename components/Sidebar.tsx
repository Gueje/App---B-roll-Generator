import React from 'react';
import { HistorySession, UserProfile } from '../types';
import { History, Clock, FileVideo, User } from 'lucide-react';

interface Props {
  user: UserProfile;
  history: HistorySession[];
  onSelectSession: (session: HistorySession) => void;
}

const Sidebar: React.FC<Props> = ({ user, history, onSelectSession }) => {
  return (
    <div className="w-64 bg-slate-900 text-slate-300 flex flex-col h-screen fixed left-0 top-0 border-r border-slate-800 shadow-xl z-50">
      
      {/* User Profile (Local) */}
      <div className="p-4 border-b border-slate-800 bg-slate-950">
        <div className="flex items-center gap-3 mb-3">
             <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-white font-bold">
                 <User className="w-5 h-5" />
             </div>
          <div className="overflow-hidden">
            <p className="text-sm font-bold text-white truncate">{user.name}</p>
            <p className="text-xs text-slate-500 truncate">Local Session</p>
          </div>
        </div>
      </div>

      {/* History List */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
            <History className="w-4 h-4" /> Generation History
        </h3>
        
        {history.length === 0 ? (
            <p className="text-xs text-slate-600 italic">No history found.</p>
        ) : (
            <div className="space-y-2">
                {history.map(session => (
                    <button
                        key={session.id}
                        onClick={() => onSelectSession(session)}
                        className="w-full text-left p-3 rounded-lg hover:bg-slate-800 transition-colors group border border-transparent hover:border-slate-700"
                    >
                        <div className="flex items-center gap-2 text-indigo-400 mb-1">
                            <FileVideo className="w-3 h-3" />
                            <span className="text-xs font-semibold truncate w-full">{session.scriptName}</span>
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-slate-500">
                            <Clock className="w-3 h-3" />
                            {new Date(session.date).toLocaleDateString()} {new Date(session.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </div>
                    </button>
                ))}
            </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-slate-800 text-center text-xs text-slate-600">
        Local Browser Storage
      </div>
    </div>
  );
};

export default Sidebar;