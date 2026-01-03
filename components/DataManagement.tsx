
import React, { useRef } from 'react';
import { Resident, AssignmentType } from '../types';
import { ScheduleSession } from '../App';
import { 
  FileJson, 
  Upload, 
  Download, 
  FileSpreadsheet, 
  Loader2, 
  Database,
  Info,
  AlertCircle
} from 'lucide-react';

interface Props {
  residents: Resident[];
  schedules: ScheduleSession[];
  onImportJSON: (data: { residents: Resident[], schedules: ScheduleSession[] }) => void;
  onExportXLSX: () => Promise<void>;
  isExportingXLSX: boolean;
  activeScheduleName?: string;
}

export const DataManagement: React.FC<Props> = ({ 
  residents, 
  schedules, 
  onImportJSON, 
  onExportXLSX, 
  isExportingXLSX,
  activeScheduleName
}) => {
  const jsonInputRef = useRef<HTMLInputElement>(null);

  const handleExportJSON = () => {
    const data = {
        residents,
        schedules,
        exportDate: new Date().toISOString(),
        version: "2.0"
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `residency_scheduler_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportClick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const parsed = JSON.parse(event.target?.result as string);
            if (parsed.residents && parsed.schedules) {
                if (confirm("This will overwrite all current residents and all schedule versions. Are you sure you want to proceed?")) {
                    onImportJSON(parsed);
                    alert("Data restored successfully!");
                }
            } else {
                alert("Invalid file format. This JSON file does not appear to be a Residency Scheduler backup.");
            }
        } catch (err) {
            alert("Error parsing JSON file. Please ensure it is a valid backup file.");
        }
    };
    reader.readAsText(file);
    if (jsonInputRef.current) jsonInputRef.current.value = '';
  };

  return (
    <div className="p-8 h-full overflow-y-auto bg-gray-50 pb-32">
      <div className="max-w-4xl mx-auto space-y-8">
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <Database className="w-6 h-6 text-blue-600" />
                Data Management & Persistence
            </h2>
            <p className="mt-2 text-gray-600">
                Manage your residency database. You can back up your entire environment to a JSON file or export specific schedules to Excel for distribution.
            </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* JSON Section */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                        <FileJson size={24} />
                    </div>
                    <div>
                        <h3 className="font-bold text-gray-800">System Backup (JSON)</h3>
                        <p className="text-xs text-gray-500">Full persistence: residents + all schedule versions</p>
                    </div>
                </div>
                
                <div className="space-y-3 flex-1">
                    <button 
                        onClick={handleExportJSON}
                        className="w-full flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors group"
                    >
                        <div className="flex items-center gap-3">
                            <Download size={18} className="text-gray-400 group-hover:text-indigo-600" />
                            <span className="text-sm font-medium">Download Backup File</span>
                        </div>
                        <span className="text-[10px] text-gray-400 font-mono">.json</span>
                    </button>

                    <button 
                        onClick={() => jsonInputRef.current?.click()}
                        className="w-full flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors group"
                    >
                        <div className="flex items-center gap-3">
                            <Upload size={18} className="text-gray-400 group-hover:text-indigo-600" />
                            <span className="text-sm font-medium">Restore from Backup</span>
                        </div>
                        <span className="text-[10px] text-gray-400 font-mono">.json</span>
                    </button>
                    <input type="file" ref={jsonInputRef} onChange={handleImportClick} accept=".json" className="hidden" />
                </div>

                <div className="mt-6 bg-blue-50 p-4 rounded-lg flex gap-3 items-start">
                    <Info size={16} className="text-blue-500 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-blue-800 leading-relaxed">
                        JSON files are the only way to move your data between browsers or computers. 
                        <strong> Always download a backup after making significant changes.</strong>
                    </p>
                </div>
            </div>

            {/* Excel Section */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
                        <FileSpreadsheet size={24} />
                    </div>
                    <div>
                        <h3 className="font-bold text-gray-800">Printable Schedule (XLSX)</h3>
                        <p className="text-xs text-gray-500">Formatted spreadsheet for the active version</p>
                    </div>
                </div>

                <div className="flex-1 space-y-4">
                    <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                        <div className="text-[10px] text-gray-400 uppercase font-bold mb-1">Active Target:</div>
                        <div className="text-sm font-bold text-gray-700 truncate">
                            {activeScheduleName || 'No active schedule'}
                        </div>
                    </div>

                    <button 
                        onClick={onExportXLSX}
                        disabled={isExportingXLSX || !activeScheduleName}
                        className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 disabled:cursor-not-allowed text-white rounded-lg font-bold flex items-center justify-center gap-3 shadow-md transition-all active:scale-95"
                    >
                        {isExportingXLSX ? <Loader2 size={20} className="animate-spin" /> : <Download size={20} />}
                        Export Current to Excel
                    </button>
                </div>

                <div className="mt-6 bg-amber-50 p-4 rounded-lg flex gap-3 items-start">
                    <AlertCircle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-amber-800 leading-relaxed">
                        XLSX exports contain coloring and labeling suitable for printing, but 
                        <strong> cannot be imported back into the system.</strong> Use JSON for backups.
                    </p>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};
