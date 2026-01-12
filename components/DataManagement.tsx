
import React, { useRef } from 'react';
import { Resident, AssignmentType } from '../types';
import { ScheduleSession } from '../App';
import {
    FileJson,
    Upload,
    Download,
    Loader2,
    Database,
    Info
} from 'lucide-react';

interface Props {
    residents: Resident[];
    schedules: ScheduleSession[];
    onImportJSON: (data: { residents: Resident[], schedules: ScheduleSession[] }) => void;
}

export const DataManagement: React.FC<Props> = ({
    residents,
    schedules,
    onImportJSON,
}) => {
    const jsonInputRef = useRef<HTMLInputElement>(null);

    const handleExportJSON = () => {
        try {
            const data = {
                residents,
                schedules,
                exportDate: new Date().toISOString(),
                version: "2.0"
            };
            const jsonString = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `residency_scheduler_backup_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            // Delay revocation to ensure browser handles the download stream
            setTimeout(() => URL.revokeObjectURL(url), 500);
        } catch (err) {
            console.error("Export JSON failed", err);
            alert("Failed to generate backup file.");
        }
    };

    const handleImportClick = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const content = event.target?.result as string;
                if (!content) return;

                const parsed = JSON.parse(content);
                if (parsed && parsed.residents && parsed.schedules) {
                    if (confirm("This will overwrite all current residents and all schedule versions. Are you sure you want to proceed?")) {
                        onImportJSON(parsed);
                        alert("Data restored successfully!");
                    }
                } else {
                    alert("Invalid file format. This JSON file does not appear to be a valid Residency Scheduler backup.");
                }
            } catch (err) {
                console.error("Import JSON failed", err);
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

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col max-w-2xl mx-auto">
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
            </div>
        </div>
    );
};
