import React from 'react';
import { X, Users, Download, RotateCcw, Plus, Database } from 'lucide-react';
import { Button } from './ui/Button';
import { ResidentManager } from './ResidentManager';
import { Resident } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  activeTab: 'residents' | 'backup' | 'reset';
  setActiveTab: (tab: 'residents' | 'backup' | 'reset') => void;
  residents: Resident[];
  setResidents: React.Dispatch<React.SetStateAction<Resident[]>>;
  activeYear: number;
  handleExportJSON: () => void;
  handleImportJSON: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleFactoryReset: () => void;
  onDeleteAllSchedules: () => void;
  onUnpinAllWeeks: () => void;
  onResetResidents: () => void;
}

export const SettingsOverlay: React.FC<Props> = ({
  isOpen,
  onClose,
  activeTab,
  setActiveTab,
  residents,
  setResidents,
  activeYear,
  handleExportJSON,
  handleImportJSON,
  handleFactoryReset,
  onDeleteAllSchedules,
  onUnpinAllWeeks,
  onResetResidents
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />
      
      {/* Panel */}
      <div className="relative w-full max-w-2xl bg-white shadow-2xl flex flex-col h-full animate-slide-in-right">
        {/* Header */}
        <div className="px-8 py-6 border-b border-light-5 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-6">
            <h2 className="text-xl font-black tracking-tight text-primary uppercase">Settings</h2>
            <nav className="flex gap-1 bg-light-1 p-1 rounded-xl">
              <button
                onClick={() => setActiveTab('residents')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'residents' ? 'bg-white text-blue shadow-sm' : 'text-muted hover:text-primary'}`}
              >
                Residents
              </button>
              <button
                onClick={() => setActiveTab('backup')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'backup' ? 'bg-white text-blue shadow-sm' : 'text-muted hover:text-primary'}`}
              >
                Backup
              </button>
              <button
                onClick={() => setActiveTab('reset')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'reset' ? 'bg-white text-blue shadow-sm' : 'text-muted hover:text-primary'}`}
              >
                Reset
              </button>
            </nav>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="rounded-full w-10 h-10 p-0 hover:bg-light-1">
            <X size={20} />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-light-1">
          {activeTab === 'residents' && (
            <div className="h-full">
              <ResidentManager residents={residents} setResidents={setResidents} activeYear={activeYear} />
            </div>
          )}
          
          {activeTab === 'backup' && (
            <div className="p-8 space-y-8">
              <div className="bg-white p-8 rounded-2xl shadow-sm border border-light-5">
                <h2 className="text-2xl font-black text-black flex items-center gap-3 mb-2">
                  <Download className="text-blue" />
                  System Backup
                </h2>
                <p className="text-muted font-medium">Export your data for safekeeping or import an existing backup file.</p>

                <div className="mt-8 grid grid-cols-1 gap-4">
                  <div className="p-6 bg-light-blue/20 border border-light-blue/40 rounded-xl space-y-4">
                    <h3 className="text-xs font-black text-blue uppercase tracking-widest">Export Data</h3>
                    <p className="text-sm text-muted">Download all residents and schedule versions into a single JSON file.</p>
                    <Button variant="primary" size="md" 
                      onClick={handleExportJSON}
                      className="w-full flex items-center justify-center gap-3 p-4 transition-all group" 
                    >
                      <Download size={18} className="group-hover:-translate-y-1 transition-transform" />
                      Download Backup (.json)
                    </Button>
                  </div>

                  <div className="p-6 bg-white border border-light-5 rounded-xl space-y-4">
                    <h3 className="text-xs font-black text-secondary uppercase tracking-widest">Import Data</h3>
                    <p className="text-sm text-muted">Upload a previously exported JSON file. <span className="text-red font-bold font-sans">Warning: This will overwrite your current data.</span></p>
                    <label className="w-full flex items-center justify-center gap-3 p-4 bg-light-2 text-primary rounded-lg font-bold hover:bg-light-3 transition-all cursor-pointer border border-dashed border-light-6">
                      <Plus size={18} />
                      Select Backup File
                      <input type="file" accept=".json" onChange={handleImportJSON} className="hidden" />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'reset' && (
            <div className="p-8 space-y-8">
              <div className="bg-white p-8 rounded-2xl shadow-sm border border-light-5">
                <h2 className="text-2xl font-black text-black flex items-center gap-3 mb-2">
                  <RotateCcw className="text-blue" />
                  System Reset
                </h2>
                <p className="text-muted font-medium">Clear specific parts of the system or perform a full factory reset.</p>

                <div className="mt-8 space-y-4">
                  <div className="p-4 border border-red/20 bg-red/10 rounded-xl space-y-4">
                    <h3 className="text-xs font-black text-red uppercase tracking-widest">Danger Zone</h3>

                    <Button
                      onClick={handleFactoryReset}
                      className="w-full flex items-center justify-between p-4 bg-white border border-red/40 rounded-lg text-red hover:bg-red hover:text-white transition-all group font-bold"
                    >
                      <span className="flex items-center gap-3"><RotateCcw size={18} /> Full Factory Reset</span>
                      <span className="text-[10px] uppercase opacity-50 group-hover:opacity-100">Wipe All</span>
                    </Button>

                    <Button
                      onClick={onResetResidents}
                      className="w-full flex items-center justify-between p-4 bg-white border border-light-5 rounded-lg text-primary hover:border-red/40 hover:text-red transition-all group font-bold"
                    >
                      <span className="flex items-center gap-3"><Users size={18} /> Reset Residents</span>
                      <span className="text-[10px] uppercase opacity-50">Set to Default</span>
                    </Button>

                    <Button
                      onClick={onDeleteAllSchedules}
                      className="w-full flex items-center justify-between p-4 bg-white border border-light-5 rounded-lg text-primary hover:border-red/40 hover:text-red transition-all group font-bold"
                    >
                      <span className="flex items-center gap-3"><Database size={18} /> Delete All Schedules</span>
                      <span className="text-[10px] uppercase opacity-50">Clear Versions</span>
                    </Button>

                    <Button
                      onClick={onUnpinAllWeeks}
                      className="w-full flex items-center justify-between p-4 bg-white border border-light-5 rounded-lg text-primary hover:border-blue/40 hover:text-blue transition-all group font-bold"
                    >
                      <span className="flex items-center gap-3"><Plus size={18} /> Unpin All Weeks</span>
                      <span className="text-[10px] uppercase opacity-50">Unlock All</span>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
