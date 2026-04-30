import React, { useState, useRef } from 'react';
import { Resident, PgyLevel } from '../types';
import { Trash2, Plus, UserPlus, Upload, Pencil, Check, X, Download, FileText, Info } from 'lucide-react';
import { COHORT_COUNT } from '../constants';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Card, CardContent } from './ui/Card';
import { Badge } from './ui/Badge';

interface Props {
  residents: Resident[];
  setResidents: React.Dispatch<React.SetStateAction<Resident[]>>;
  activeYear: number;
}

export const ResidentManager: React.FC<Props> = ({ residents, setResidents, activeYear }) => {
  // New Resident State
  const [newResidentName, setNewResidentName] = useState('');
  const [newResidentStartYear, setNewResidentStartYear] = useState<number>(activeYear);
  
  // Edit State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editStartYear, setEditStartYear] = useState<number>(activeYear);

  // Delete Confirmation State
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAdd = () => {
    if (!newResidentName.trim()) return;
    const newId = `manual-${Date.now()}`;
    const newResident: Resident = {
      id: newId,
      name: newResidentName,
      level: 1, // Placeholder, calculated on-the-fly in schedule views
      startYear: newResidentStartYear,
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
    setEditStartYear(resident.startYear);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditName('');
    setEditStartYear(activeYear);
  };

  const saveEditing = () => {
    if (editingId) {
      setResidents(prev => prev.map(r => {
        if (r.id === editingId) {
          return {
            ...r,
            name: editName,
            startYear: editStartYear,
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
    const csvContent = `Name,Level
John Doe,1
Jane Smith,2
Robert Brown,3`;
    
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
        
        // Flexible format: Name, Level
        if (parts.length < 2) continue; 

        const name = parts[0];
        const cleanName = name.replace(/^"|"$/g, '');
        
        const levelStr = parts[1];
        const level = parseInt(levelStr) as PgyLevel;
        
        if (!cleanName || isNaN(level) || ![1, 2, 3].includes(level)) continue;

        newResidents.push({
            id: `imported-${Date.now()}-${idCounter++}`,
            name: cleanName,
            level: 1, // Placeholder
            startYear: activeYear - level + 1,
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
    <div className="p-6 max-w-4xl mx-auto">
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        accept=".csv" 
        className="hidden" 
      />

      <Card className="mb-8">
        <CardContent className="p-6">
        <div className="flex justify-between items-start mb-6">
            <div>
                 <h2 className="text-xl font-bold flex items-center gap-2 text-primary">
                    <UserPlus className="w-5 h-5" /> Manage Residents
                </h2>
                <p className="text-sm text-muted mt-1">Add residents manually or bulk import via CSV.</p>
            </div>
           
            <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={handleDownloadTemplate} className="gap-2">
                    <Download size={14} /> Download Template
                </Button>
                <Button variant="primary" size="sm" onClick={handleImportClick} className="gap-2">
                    <Upload size={14} /> Import CSV
                </Button>
            </div>
        </div>

        {/* Import Rules / Legend */}
        <div className="bg-light-blue/20 border border-light-blue/40 rounded-md p-4 mb-6 text-sm text-navy-dark flex gap-3 items-start">
             <Info className="w-5 h-5 text-blue shrink-0 mt-0.5" />
             <div>
                <div className="font-bold mb-1">CSV Format Guidelines:</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 text-navy/80 text-xs">
                    <ul className="list-disc list-inside space-y-1">
                        <li><strong>Column 1 (Name):</strong> Resident Full Name (Required).</li>
                        <li><strong>Column 2 (Level):</strong> PGY Level for current year (Required).</li>
                    </ul>
                    <ul className="list-disc list-inside space-y-1">
                        <li><strong>Column 3 (Cohort):</strong> 0-4 (Optional). 0=A, 1=B, etc.</li>
                        <li>If cohort is blank, it will be auto-assigned.</li>
                    </ul>
                </div>
                <div className="mt-2 text-xs font-mono bg-white/50 p-1.5 rounded border border-light-blue/40 inline-block text-blue-2-dark">
                    Example: "Dr. Smith, 1, 0"
                </div>
             </div>
        </div>
        
        <div className="flex gap-4 items-end flex-wrap border-t border-light-5 pt-6">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-primary mb-1">Name</label>
            <Input
              value={newResidentName}
              onChange={(e) => setNewResidentName(e.target.value)}
              placeholder="e.g. Dr. Smith"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-primary mb-1">Start Year</label>
            <Input
              type="number"
              value={newResidentStartYear}
              onChange={(e) => setNewResidentStartYear(Number(e.target.value))}
              className="w-32"
            />
          </div>
          <Button variant="primary" size="md" onClick={handleAdd} className="gap-2">
            <Plus size={16} /> Add
          </Button>
        </div>
        </CardContent>
      </Card>

      <Card className="mb-12">
        <div className="p-4 border-b border-light-5 bg-light-1 font-semibold text-primary grid grid-cols-12 gap-4">
            <div className="col-span-8">Name</div>
            <div className="col-span-2 text-center">Start Year</div>
            <div className="col-span-2 text-center">Actions</div>
        </div>
        <div className="overflow-visible min-h-[100px]">
            {residents.map(r => {
              const isEditing = editingId === r.id;
              
              return (
                <div key={r.id} className={`p-4 border-b border-light-5 last:border-0 grid grid-cols-12 gap-4 items-center ${isEditing ? 'bg-light-blue/20' : 'hover:bg-light-1'}`}>
                    {isEditing ? (
                      <>
                        <div className="col-span-8">
                          <Input 
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            autoFocus
                          />
                        </div>
                        <div className="col-span-2 text-center">
                          <Input 
                            type="number"
                            value={editStartYear}
                            onChange={(e) => setEditStartYear(Number(e.target.value))}
                            className="w-full"
                          />
                        </div>
                        <div className="col-span-2 text-center flex justify-center gap-2">
                           <Button variant="ghost" size="sm" onClick={saveEditing} className="text-green hover:text-green-dark hover:bg-lime-green/40" title="Save">
                             <Check size={16}/>
                           </Button>
                           <Button variant="ghost" size="sm" onClick={cancelEditing} className="text-muted hover:text-primary hover:bg-light-3" title="Cancel">
                             <X size={16}/>
                           </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="col-span-8 font-medium">{r.name}</div>
                        <div className="col-span-2 text-center">
                            <Badge variant="info">
                                {r.startYear}
                            </Badge>
                        </div>
                        <div className="col-span-2 text-center flex justify-center gap-2 items-center">
                            {deleteConfirmId === r.id ? (
                                <>
                                    <Button 
                                        variant="danger" size="sm"
                                        onClick={(e) => handleRemoveClick(e, r.id)}
                                        className="animate-pulse"
                                        title="Click again to confirm deletion"
                                    >
                                        Delete?
                                    </Button>
                                    <Button 
                                        variant="ghost" size="sm"
                                        onClick={handleCancelDelete}
                                        title="Cancel"
                                    >
                                        <X size={16} />
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <Button 
                                        variant="ghost" size="sm"
                                        onClick={() => startEditing(r)}
                                        title="Edit"
                                    >
                                        <Pencil size={16} />
                                    </Button>
                                    <Button 
                                        variant="ghost" size="sm"
                                        onClick={(e) => handleRemoveClick(e, r.id)}
                                        className="text-red hover:bg-red/10"
                                        title="Delete"
                                    >
                                        <Trash2 size={16} />
                                    </Button>
                                </>
                            )}
                        </div>
                      </>
                    )}
                </div>
              );
            })}
        </div>
      </Card>
    </div>
  );
};
