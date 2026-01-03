
import React, { useState, useRef } from 'react';
import { Resident, PgyLevel } from '../types';
import { Trash2, Plus, UserPlus, Upload, Pencil, Check, X, Download, FileText, Info } from 'lucide-react';
import { COHORT_COUNT } from '../constants';

interface Props {
  residents: Resident[];
  setResidents: React.Dispatch<React.SetStateAction<Resident[]>>;
}

export const ResidentManager: React.FC<Props> = ({ residents, setResidents }) => {
  // New Resident State
  const [newResidentName, setNewResidentName] = useState('');
  const [newResidentLevel, setNewResidentLevel] = useState<PgyLevel>(1);
  const [newResidentCohort, setNewResidentCohort] = useState<number>(0);
  
  // Edit State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editLevel, setEditLevel] = useState<PgyLevel>(1);
  const [editCohort, setEditCohort] = useState<number>(0);

  // Delete Confirmation State
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAdd = () => {
    if (!newResidentName.trim()) return;
    const newId = `manual-${Date.now()}`;
    const newResident: Resident = {
      id: newId,
      name: newResidentName,
      level: newResidentLevel,
      cohort: newResidentCohort,
      avoidResidentIds: [],
    };
    setResidents(prev => [...prev, newResident]);
    setNewResidentName('');
  };

  const handleRemoveClick = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (deleteConfirmId === id) {
        // Confirmed, delete now
        setResidents(prev => prev.filter(r => r.id !== id));
        setDeleteConfirmId(null);
    } else {
        // First click, show confirm
        setDeleteConfirmId(id);
        // Cancel any editing if active
        setEditingId(null);
    }
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDeleteConfirmId(null);
  };

  const startEditing = (resident: Resident) => {
    setDeleteConfirmId(null);
    setEditingId(resident.id);
    setEditName(resident.name);
    setEditLevel(resident.level);
    setEditCohort(resident.cohort);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditName('');
    setEditLevel(1);
    setEditCohort(0);
  };

  const saveEditing = () => {
    if (editingId) {
      setResidents(prev => prev.map(r => {
        if (r.id === editingId) {
          return {
            ...r,
            name: editName,
            level: editLevel,
            cohort: editCohort
          };
        }
        return r;
      }));
      cancelEditing();
    }
  };

  const handleImportClick = () => {
    if (fileInputRef.current) {
        fileInputRef.current.value = ''; // Ensure change event fires even for same file
        fileInputRef.current.click();
    }
  };

  const handleDownloadTemplate = () => {
    const csvContent = `Name,Level,Cohort
John Doe,1,0
Jane Smith,2,1
Robert Brown,3,2
Alice Johnson,1,
David Wilson,2,4`;
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'resident_template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      processCSV(text);
    };
    reader.readAsText(file);
  };

  const processCSV = (text: string) => {
    const lines = text.split(/\r?\n/); // Handle both CRLF and LF
    const newResidents: Resident[] = [];
    
    // Check for header row
    let startIndex = 0;
    const firstLineLower = lines[0].trim().toLowerCase();
    if (firstLineLower.startsWith('name') || firstLineLower.includes('level') || firstLineLower.includes('cohort')) {
        startIndex = 1;
    }

    let idCounter = 1;

    for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const parts = line.split(',').map(p => p.trim());
        
        // Flexible format: 
        // 1. Name, Level, Cohort
        // 2. Name, Level (Cohort auto-assigned)
        if (parts.length < 2) continue; 

        const name = parts[0];
        const cleanName = name.replace(/^"|"$/g, '');
        
        const levelStr = parts[1];
        const level = parseInt(levelStr) as PgyLevel;
        
        if (!cleanName || isNaN(level) || ![1, 2, 3].includes(level)) continue;

        let cohort = 0;
        if (parts[2]) {
            const parsedCohort = parseInt(parts[2]);
            if (!isNaN(parsedCohort) && parsedCohort >= 0 && parsedCohort < COHORT_COUNT) {
                cohort = parsedCohort;
            } else {
                 cohort = (newResidents.length) % COHORT_COUNT;
            }
        } else {
             // Auto distribute
             cohort = (newResidents.length) % COHORT_COUNT;
        }

        newResidents.push({
            id: `imported-${Date.now()}-${idCounter++}`,
            name: cleanName,
            level,
            cohort,
            avoidResidentIds: []
        });
    }

    if (newResidents.length > 0) {
        if(confirm(`Successfully parsed ${newResidents.length} residents.\n\nDo you want to REPLACE your current list with these residents?\n(Cancel to abort import)`)) {
            setResidents(newResidents);
            alert(`Imported ${newResidents.length} residents successfully.`);
        }
    } else {
        alert("Import Failed: No valid residents found in the file.\n\nPlease ensure your CSV matches the template:\nName, Level (1-3), Cohort (0-4)");
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto pb-64">
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        accept=".csv" 
        className="hidden" 
      />

      <div className="bg-white rounded-lg shadow-sm border p-6 mb-8">
        <div className="flex justify-between items-start mb-6">
            <div>
                 <h2 className="text-xl font-bold flex items-center gap-2 text-gray-800">
                    <UserPlus className="w-5 h-5" /> Manage Residents
                </h2>
                <p className="text-sm text-gray-500 mt-1">Add residents manually or bulk import via CSV.</p>
            </div>
           
            <div className="flex gap-2">
                <button
                    onClick={handleDownloadTemplate}
                    className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 px-3 py-1.5 rounded hover:bg-gray-50 transition-colors"
                >
                    <Download size={14} /> Download Template
                </button>
                <button
                    onClick={handleImportClick}
                    className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 border border-blue-200 px-3 py-1.5 rounded hover:bg-blue-50 transition-colors"
                >
                    <Upload size={14} /> Import CSV
                </button>
            </div>
        </div>

        {/* Import Rules / Legend */}
        <div className="bg-blue-50 border border-blue-100 rounded-md p-4 mb-6 text-sm text-blue-900 flex gap-3 items-start">
             <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
             <div>
                <div className="font-bold mb-1">CSV Format Guidelines:</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 text-blue-800/80 text-xs">
                    <ul className="list-disc list-inside space-y-1">
                        <li><strong>Column 1 (Name):</strong> Resident Full Name (Required).</li>
                        <li><strong>Column 2 (Level):</strong> PGY Level (1, 2, or 3) (Required).</li>
                    </ul>
                    <ul className="list-disc list-inside space-y-1">
                        <li><strong>Column 3 (Cohort):</strong> 0-4 (Optional). 0=A, 1=B, etc.</li>
                        <li>If cohort is blank, it will be auto-assigned.</li>
                    </ul>
                </div>
                <div className="mt-2 text-xs font-mono bg-white/50 p-1.5 rounded border border-blue-100 inline-block text-blue-700">
                    Example: "Dr. Smith, 1, 0"
                </div>
             </div>
        </div>
        
        <div className="flex gap-4 items-end flex-wrap border-t pt-6">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={newResidentName}
              onChange={(e) => setNewResidentName(e.target.value)}
              className="w-full border border-gray-300 rounded-md p-2 focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="e.g. Dr. Smith"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">PGY Level</label>
            <select
              value={newResidentLevel}
              onChange={(e) => setNewResidentLevel(Number(e.target.value) as PgyLevel)}
              className="border border-gray-300 rounded-md p-2 w-24 bg-white"
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cohort</label>
            <select
              value={newResidentCohort}
              onChange={(e) => setNewResidentCohort(Number(e.target.value))}
              className="border border-gray-300 rounded-md p-2 w-24 bg-white"
            >
              {[0,1,2,3,4].map(c => (
                <option key={c} value={c}>{String.fromCharCode(65 + c)}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleAdd}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center gap-2"
          >
            <Plus size={16} /> Add
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border mb-12">
        <div className="p-4 border-b bg-gray-50 font-semibold text-gray-700 grid grid-cols-12 gap-4">
            <div className="col-span-6">Name</div>
            <div className="col-span-2 text-center">Level</div>
            <div className="col-span-2 text-center">Cohort</div>
            <div className="col-span-2 text-center">Actions</div>
        </div>
        <div className="overflow-visible min-h-[100px]">
            {residents.map(r => {
              const isEditing = editingId === r.id;
              
              return (
                <div key={r.id} className={`p-4 border-b last:border-0 grid grid-cols-12 gap-4 items-center ${isEditing ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                    {isEditing ? (
                      <>
                        <div className="col-span-6">
                          <input 
                            type="text" 
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full border border-blue-300 rounded px-2 py-1 focus:ring-2 focus:ring-blue-200 outline-none"
                            autoFocus
                          />
                        </div>
                        <div className="col-span-2 text-center">
                          <select
                            value={editLevel}
                            onChange={(e) => setEditLevel(Number(e.target.value) as PgyLevel)}
                            className="border border-blue-300 rounded px-1 py-1 text-sm bg-white"
                          >
                            <option value={1}>PGY-1</option>
                            <option value={2}>PGY-2</option>
                            <option value={3}>PGY-3</option>
                          </select>
                        </div>
                        <div className="col-span-2 text-center">
                          <select
                            value={editCohort}
                            onChange={(e) => setEditCohort(Number(e.target.value))}
                            className="border border-blue-300 rounded px-1 py-1 text-sm bg-white"
                          >
                            {[0,1,2,3,4].map(c => (
                              <option key={c} value={c}>{String.fromCharCode(65 + c)}</option>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-2 text-center flex justify-center gap-2">
                           <button onClick={saveEditing} className="text-green-600 hover:text-green-800 p-1 bg-green-100 rounded hover:bg-green-200" title="Save">
                             <Check size={16}/>
                           </button>
                           <button onClick={cancelEditing} className="text-gray-500 hover:text-gray-700 p-1 bg-gray-200 rounded hover:bg-gray-300" title="Cancel">
                             <X size={16}/>
                           </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="col-span-6 font-medium">{r.name}</div>
                        <div className="col-span-2 text-center">
                            <span className={`px-2 py-1 rounded text-xs font-bold 
                                ${r.level === 1 ? 'bg-green-100 text-green-800' : r.level === 2 ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>
                                PGY-{r.level}
                            </span>
                        </div>
                        <div className="col-span-2 text-center font-mono">
                            {String.fromCharCode(65 + r.cohort)}
                        </div>
                        <div className="col-span-2 text-center flex justify-center gap-2 items-center">
                            {deleteConfirmId === r.id ? (
                                <>
                                    <button 
                                        onClick={(e) => handleRemoveClick(e, r.id)}
                                        className="bg-red-600 text-white px-2 py-1 rounded text-xs hover:bg-red-700 animate-pulse font-medium shadow-sm whitespace-nowrap"
                                        title="Click again to confirm deletion"
                                    >
                                        Delete?
                                    </button>
                                    <button 
                                        onClick={handleCancelDelete}
                                        className="text-gray-500 hover:text-gray-700 p-1 rounded hover:bg-gray-100"
                                        title="Cancel"
                                    >
                                        <X size={16} />
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button 
                                        onClick={() => startEditing(r)}
                                        className="text-blue-500 hover:text-blue-700 p-1 rounded hover:bg-blue-50"
                                        title="Edit"
                                    >
                                        <Pencil size={16} />
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={(e) => handleRemoveClick(e, r.id)}
                                        className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50"
                                        title="Delete"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </>
                            )}
                        </div>
                      </>
                    )}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
};
