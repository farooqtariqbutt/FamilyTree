
import React, { useState, useMemo } from 'react';
import type { Person } from '../types.ts';
import { Gender } from '../types.ts';
import { useFamilyTreeContext } from '../hooks/useFamilyTree.ts';
import { calculateAge } from '../utils/dateUtils.ts';
import { PlusIcon, PencilIcon, TrashIcon, ArrowUpIcon, ArrowDownIcon } from './ui/Icons.tsx';
import Button from './ui/Button.tsx';
import Modal from './ui/Modal.tsx';
import { getFullName } from '../utils/personUtils.ts';

type SortKey = 'firstName' | 'birthDate' | 'deathDate';
type SortDirection = 'asc' | 'desc';

interface PeopleListProps {
  openPersonForm: (person?: Person) => void;
}

const PeopleList: React.FC<PeopleListProps> = ({ openPersonForm }) => {
    const { people, deletePerson } = useFamilyTreeContext();
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [personToDelete, setPersonToDelete] = useState<Person | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'firstName', direction: 'asc' });

    const handleAdd = () => {
        openPersonForm(undefined);
    };

    const handleEdit = (person: Person) => {
        openPersonForm(person);
    };

    const handleDelete = (person: Person) => {
        setPersonToDelete(person);
        setIsDeleteModalOpen(true);
    };
    
    const confirmDelete = () => {
        if (personToDelete) {
            deletePerson(personToDelete.id);
            setIsDeleteModalOpen(false);
            setPersonToDelete(null);
        }
    };
    
    const requestSort = (key: SortKey) => {
        let direction: SortDirection = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const sortedAndFilteredPeople = useMemo(() => {
        let sortableItems = [...people];
        if (searchTerm) {
            sortableItems = sortableItems.filter(p =>
                getFullName(p).toLowerCase().includes(searchTerm.toLowerCase())
            );
        }
        sortableItems.sort((a, b) => {
            const valA = a[sortConfig.key];
            const valB = b[sortConfig.key];

            if (valA === undefined || valA === null) return 1;
            if (valB === undefined || valB === null) return -1;
            
            if (valA < valB) {
                return sortConfig.direction === 'asc' ? -1 : 1;
            }
            if (valA > valB) {
                return sortConfig.direction === 'asc' ? 1 : -1;
            }
            return 0;
        });
        return sortableItems;
    }, [people, searchTerm, sortConfig]);
    
    const getSortIcon = (key: SortKey) => {
        if (sortConfig.key !== key) return null;
        return sortConfig.direction === 'asc' ? <ArrowUpIcon /> : <ArrowDownIcon />;
    };

    return (
        <div className="bg-white dark:bg-gray-900 shadow-lg rounded-xl p-6 h-full flex flex-col">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">All Individuals ({people.length})</h2>
                <Button onClick={handleAdd}>
                    <PlusIcon /> <span className="ml-2">Add Person</span>
                </Button>
            </div>
            <div className="mb-4">
                <input
                    type="text"
                    placeholder="Search by name..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full p-2 border rounded bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-600 focus:ring-blue-500 focus:border-blue-500"
                />
            </div>
            <div className="flex-grow overflow-auto">
                <table className="w-full text-left">
                    <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                        <tr>
                            {['Name', 'Born', 'Died', 'Age', 'Actions'].map((header, i) => {
                                const sortKey = i === 0 ? 'firstName' : i === 1 ? 'birthDate' : i === 2 ? 'deathDate' : null;
                                return (
                                <th key={header} className="p-3 text-sm font-semibold text-gray-600 dark:text-gray-300 tracking-wider">
                                     <div className="flex items-center space-x-1 cursor-pointer" onClick={() => sortKey && requestSort(sortKey as SortKey)}>
                                        <span>{header}</span>
                                        {sortKey && getSortIcon(sortKey as SortKey)}
                                    </div>
                                </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                        {sortedAndFilteredPeople.map(person => {
                             const genderClass = person.gender === Gender.Male 
                                ? 'bg-male dark:bg-male-dark border-l-4 border-male-border' 
                                : person.gender === Gender.Female 
                                ? 'bg-female dark:bg-female-dark border-l-4 border-female-border'
                                : 'border-l-4 border-gray-500';

                            return (
                                <tr key={person.id} className={genderClass}>
                                    <td className="p-3 whitespace-nowrap">
                                        <div 
                                            className="font-medium cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                            onClick={() => handleEdit(person)}
                                        >
                                            {getFullName(person)}
                                        </div>
                                        <div className="text-sm text-gray-500 dark:text-gray-400">{person.gender}</div>
                                    </td>
                                    <td className="p-3">{person.birthDate || 'N/A'}</td>
                                    <td className="p-3">{person.deathDate || 'N/A'}</td>
                                    <td className="p-3">{calculateAge(person.birthDate, person.deathDate)}</td>
                                    <td className="p-3">
                                        <div className="flex space-x-2">
                                            <button onClick={() => handleEdit(person)} className="p-1 text-gray-500 hover:text-blue-600 dark:hover:text-blue-400"><PencilIcon /></button>
                                            <button onClick={() => handleDelete(person)} className="p-1 text-gray-500 hover:text-red-600 dark:hover:text-red-400"><TrashIcon /></button>
                                        </div>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            {/* Delete Confirmation Modal */}
            <Modal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} title="Confirm Deletion">
                <div className="space-y-4">
                    <p>Are you sure you want to delete <strong>{getFullName(personToDelete)}</strong>? This will remove them from the tree and all associated relationships. This action cannot be undone.</p>
                    <div className="flex justify-end space-x-2">
                        <Button variant="secondary" onClick={() => setIsDeleteModalOpen(false)}>Cancel</Button>
                        <Button variant="danger" onClick={confirmDelete}>Delete Person</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default PeopleList;