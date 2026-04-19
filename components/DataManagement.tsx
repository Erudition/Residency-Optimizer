
import React, { useRef } from 'react';
import { Resident, AssignmentType } from '../types';
import { ScheduleSession } from '../App';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
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
        <div className="p-8 h-full overflow-y-auto bg-light-1 pb-32">
            <div className="max-w-4xl mx-auto space-y-8">

                <div className="bg-white p-6 rounded-xl shadow-sm border border-light-5">
                    <h2 className="text-xl font-bold text-primary flex items-center gap-2">
                        <Database className="w-6 h-6 text-blue" />
                        Data Management & Persistence
                    </h2>
                    <p className="mt-2 text-secondary">
                        Manage your residency database. You can back up your entire environment to a JSON file or export specific schedules to Excel for distribution.
                    </p>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-light-5 flex flex-col max-w-2xl mx-auto">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-light-purple/30 rounded-lg text-purple-2">
                            <FileJson size={24} />
                        </div>
                        <div>
                            <h3 className="font-bold text-primary">System Backup (JSON)</h3>
                            <p className="text-xs text-muted">Full persistence: residents + all schedule versions</p>
                        </div>
                    </div>

                    <div className="space-y-3 flex-1">
                        <Button
                            onClick={handleExportJSON}
                            className="w-full flex items-center justify-between p-3 border rounded-lg hover:bg-light-1 transition-colors group"
                        >
                            <div className="flex items-center gap-3">
                                <Download size={18} className="text-muted group-hover:text-purple-2" />
                                <span className="text-sm font-medium">Download Backup File</span>
                            </div>
                            <span className="text-[10px] text-muted font-mono">.json</span>
                        </Button>

                        <Button
                            onClick={() => jsonInputRef.current?.click()}
                            className="w-full flex items-center justify-between p-3 border rounded-lg hover:bg-light-1 transition-colors group"
                        >
                            <div className="flex items-center gap-3">
                                <Upload size={18} className="text-muted group-hover:text-purple-2" />
                                <span className="text-sm font-medium">Restore from Backup</span>
                            </div>
                            <span className="text-[10px] text-muted font-mono">.json</span>
                        </Button>
                        <input type="file" ref={jsonInputRef} onChange={handleImportClick} accept=".json" className="hidden" />
                    </div>

                    <div className="mt-6 bg-light-blue/20 p-4 rounded-lg flex gap-3 items-start">
                        <Info size={16} className="text-blue shrink-0 mt-0.5" />
                        <p className="text-[11px] text-navy leading-relaxed">
                            JSON files are the only way to move your data between browsers or computers.
                            <strong> Always download a backup after making significant changes.</strong>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
