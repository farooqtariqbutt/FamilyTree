



import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { useFamilyTree, FamilyTreeContext } from './hooks/useFamilyTree.ts';
import PeopleList from './components/PeopleList.tsx';
import { FamilyTreeView } from './components/FamilyTreeView.tsx';
import { ReportsView } from './components/ReportsView.tsx';
import FamilyTimelineView from './components/FamilyTimelineView.tsx';
import { MoonIcon, SunIcon, ArrowDownOnSquareIcon, DocumentArrowUpIcon, SaveIcon, ArrowUpTrayIcon, PlusIcon, TrashIcon } from './components/ui/Icons.tsx';
import Modal from './components/ui/Modal.tsx';
import Input from './components/ui/Input.tsx';
import Button from './components/ui/Button.tsx';
import PersonForm from './components/PersonForm.tsx';
import type { Person } from './types.ts';
import Tooltip from './components/ui/Tooltip.tsx';

const App = () => {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const familyTree = useFamilyTree();
  const [isNewTreeModalOpen, setIsNewTreeModalOpen] = useState(false);
  const [newTreeName, setNewTreeName] = useState('');
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [personToEdit, setPersonToEdit] = useState<Person | undefined>();
  
  const { isLoading, trees, activeTreeId, createNewTree, switchTree, deleteTree, importGedcom, exportGedcom, backupActiveTree, importBackup } = familyTree;

  useEffect(() => {
    const isDark = localStorage.getItem('darkMode') === 'true';
    setIsDarkMode(isDark);
  }, []);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('darkMode', 'true');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('darkMode', 'false');
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => {
    setIsDarkMode(prev => !prev);
  };
  
  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
        importGedcom(file);
        event.target.value = ''; // Reset file input
    }
  };

  const handleImportBackup = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
        importBackup(file);
        event.target.value = ''; // Reset file input
    }
  };

  const handleExport = () => {
    if (activeTreeId) {
        exportGedcom(activeTreeId);
    }
  };
  
  const handleCreateTree = () => {
      if (newTreeName.trim()) {
          createNewTree(newTreeName.trim());
          setNewTreeName('');
          setIsNewTreeModalOpen(false);
      } else {
          alert("Please enter a name for the tree.");
      }
  };
  
  const handleDeleteTree = () => {
      if(activeTreeId){
        deleteTree(activeTreeId);
        setIsDeleteModalOpen(false);
      }
  };

  const openPersonForm = (person?: Person) => {
    setPersonToEdit(person);
    setIsFormModalOpen(true);
  };

  const closePersonForm = () => {
    setIsFormModalOpen(false);
    setPersonToEdit(undefined);
  };
  
  if (isLoading) {
    return (
        <div className="flex items-center justify-center h-screen bg-gray-100 dark:bg-gray-900">
            <div className="text-center">
                <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto"></div>
                <p className="mt-4 text-lg text-gray-700 dark:text-gray-300">Loading Family Data...</p>
            </div>
        </div>
    );
  }

  return (
    <FamilyTreeContext.Provider value={familyTree}>
        <HashRouter>
            <div className="flex flex-col h-screen bg-gray-100 dark:bg-gray-800 font-sans">
                {/* Header */}
                <header className="bg-white dark:bg-gray-900 shadow-md p-3 flex items-center justify-between z-10 flex-shrink-0">
                    {/* Left side: Title and Tree Selector */}
                    <div className="flex items-center space-x-4">
                        <h1 className="text-xl font-bold text-blue-600 dark:text-blue-400">Digital Family Tree</h1>
                        <div className="flex items-center space-x-2 border-l border-gray-200 dark:border-gray-700 pl-4">
                           <select 
                                id="tree-select" 
                                value={activeTreeId || ''} 
                                onChange={e => switchTree(e.target.value)} 
                                className="p-2 border rounded bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-blue-500 focus:border-blue-500 text-sm disabled:opacity-50 disabled:cursor-not-allowed w-48"
                                disabled={!activeTreeId}
                            >
                                {Object.keys(trees).length > 0 ? (
                                    Object.keys(trees).map(treeId => <option key={treeId} value={treeId}>{trees[treeId].name}</option>)
                                ) : (
                                    <option value="">- No Active Tree -</option>
                                )}
                            </select>
                            <Tooltip text="New Tree">
                                <button onClick={() => setIsNewTreeModalOpen(true)} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer">
                                    <PlusIcon />
                                </button>
                            </Tooltip>
                            <Tooltip text="Save Backup (.json)">
                                <button onClick={backupActiveTree} disabled={!activeTreeId} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed">
                                    <SaveIcon />
                                </button>
                            </Tooltip>
                            <Tooltip text="Delete Active Tree">
                                <button 
                                    onClick={() => setIsDeleteModalOpen(true)} 
                                    disabled={!activeTreeId} 
                                    className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <TrashIcon />
                                </button>
                            </Tooltip>
                        </div>
                    </div>

                    {/* Middle: Navigation */}
                    <nav className="flex items-center space-x-2">
                        <NavItem to="/">All Individuals</NavItem>
                        <NavItem to="/tree">Family Tree</NavItem>
                        <NavItem to="/timeline">Family Timeline</NavItem>
                        <NavItem to="/reports">Reports & Stats</NavItem>
                    </nav>

                    {/* Right side: Actions */}
                    <div className="flex items-center space-x-2">
                         <Tooltip text="Import GEDCOM (.ged)">
                            <label htmlFor="gedcom-import" className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer">
                                <DocumentArrowUpIcon />
                                <input id="gedcom-import" type="file" accept=".ged" className="hidden" onChange={handleImport}/>
                            </label>
                        </Tooltip>
                        <Tooltip text="Export GEDCOM (.ged)">
                            <button onClick={handleExport} disabled={!activeTreeId} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed">
                                <ArrowDownOnSquareIcon />
                            </button>
                        </Tooltip>
                        <Tooltip text="Restore from Backup (.json)">
                            <label htmlFor="backup-import" className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer">
                                <ArrowUpTrayIcon />
                                <input id="backup-import" type="file" accept=".json" className="hidden" onChange={handleImportBackup}/>
                            </label>
                        </Tooltip>
                        <div className="border-l border-gray-200 dark:border-gray-700 h-6 mx-2"></div>
                        <Tooltip text={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
                            <button onClick={toggleDarkMode} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700">
                                {isDarkMode ? <SunIcon /> : <MoonIcon />}
                            </button>
                        </Tooltip>
                    </div>
                </header>


                {/* Main Content */}
                <main className="flex-1 p-6 overflow-auto">
                    <Routes>
                        <Route path="/" element={<PeopleList openPersonForm={openPersonForm} />} />
                        <Route path="/tree" element={<FamilyTreeView openPersonForm={openPersonForm} />} />
                        <Route path="/timeline" element={<FamilyTimelineView />} />
                        <Route path="/reports" element={<ReportsView />} />
                    </Routes>
                </main>
            </div>
        </HashRouter>
        
        {/* Modals */}
        <Modal isOpen={isNewTreeModalOpen} onClose={() => setIsNewTreeModalOpen(false)} title="Create New Family Tree">
            <div className="space-y-4">
                <Input
                    label="Tree Name"
                    id="new-tree-name"
                    value={newTreeName}
                    onChange={(e) => setNewTreeName(e.target.value)}
                    placeholder="e.g., 'My Paternal Lineage'"
                    autoFocus
                />
                <div className="flex justify-end space-x-2">
                    <Button variant="secondary" onClick={() => setIsNewTreeModalOpen(false)}>Cancel</Button>
                    <Button onClick={handleCreateTree}>Create Tree</Button>
                </div>
            </div>
        </Modal>

        <Modal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} title="Confirm Deletion">
            <div className="space-y-4">
                <p>Are you sure you want to delete the tree "{activeTreeId && trees[activeTreeId]?.name}"? This action cannot be undone.</p>
                <div className="flex justify-end space-x-2">
                    <Button variant="secondary" onClick={() => setIsDeleteModalOpen(false)}>Cancel</Button>
                    <Button variant="danger" onClick={handleDeleteTree}>Delete Tree</Button>
                </div>
            </div>
        </Modal>

        <PersonForm 
            isOpen={isFormModalOpen}
            onClose={closePersonForm}
            personToEdit={personToEdit}
        />
    </FamilyTreeContext.Provider>
  );
};

interface NavItemProps {
    to: string;
    children: React.ReactNode;
}

const NavItem: React.FC<NavItemProps> = ({ to, children }) => {
  const location = useLocation();
  const isActive = location.pathname === to;
  const activeClass = "bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300";
  const inactiveClass = "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700";

  return (
    <NavLink to={to} className={`px-4 py-2 rounded-md text-sm font-medium ${isActive ? activeClass : inactiveClass}`}>
      <span>{children}</span>
    </NavLink>
  );
};

export default App;