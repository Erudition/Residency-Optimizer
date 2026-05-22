import React, { createContext, useContext, ReactNode } from 'react';
import { ProgramData } from '../services/api/client';

const ProgramDataContext = createContext<ProgramData | null>(null);

export const ProgramDataProvider: React.FC<{
  programData: ProgramData;
  children: ReactNode;
}> = ({ programData, children }) => {
  return (
    <ProgramDataContext.Provider value={programData}>
      {children}
    </ProgramDataContext.Provider>
  );
};

export const useProgramData = (): ProgramData => {
  const context = useContext(ProgramDataContext);
  if (!context) {
    throw new Error('useProgramData must be used within a ProgramDataProvider');
  }
  return context;
};
