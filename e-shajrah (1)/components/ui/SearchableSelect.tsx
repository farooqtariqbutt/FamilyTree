import React, { useState, useEffect, useRef } from 'react';
import type { Person } from '../../types.ts';
import { UserIcon } from './Icons.tsx';
import { getFullName } from '../../utils/personUtils.ts';

interface SearchableSelectProps {
  options: Person[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({ options, value, onChange, placeholder = 'Select an option', label, className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(opt => opt.id === value);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [wrapperRef]);
  
  const filteredOptions = options.filter(opt =>
    getFullName(opt).toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelect = (optionId: string) => {
    onChange(optionId);
    setSearchTerm('');
    setIsOpen(false);
  };
  
  const handleToggle = () => {
      setIsOpen(!isOpen);
      if(isOpen) {
          setSearchTerm('');
      }
  };

  return (
    <div className="relative w-full" ref={wrapperRef}>
        {label && <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>}
      <button
        type="button"
        className={`w-full p-2 border rounded bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-600 focus:ring-blue-500 focus:border-blue-500 text-left flex justify-between items-center ${className}`}
        onClick={handleToggle}
      >
        <span className="truncate">{selectedOption ? getFullName(selectedOption) : placeholder}</span>
        <span className="text-gray-400">▼</span>
      </button>

      {isOpen && (
        <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-y-auto">
          <div className="p-2 border-b border-gray-200 dark:border-gray-700">
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full p-2 border rounded bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600"
              autoFocus
            />
          </div>
          <ul>
             <li
                key="unknown-option"
                className="px-4 py-2 text-gray-500 italic hover:bg-blue-100 dark:hover:bg-blue-900/50 cursor-pointer"
                onClick={() => handleSelect('')}
              >
                {placeholder}
            </li>
            {filteredOptions.length > 0 ? filteredOptions.map(opt => (
              <li
                key={opt.id}
                className="px-4 py-2 hover:bg-blue-100 dark:hover:bg-blue-900/50 cursor-pointer flex items-center space-x-2"
                onClick={() => handleSelect(opt.id)}
              >
                 <div className="w-8 h-8 rounded-full flex-shrink-0 bg-gray-200 dark:bg-gray-700 overflow-hidden flex items-center justify-center">
                    {opt.photos?.[0] ? <img src={opt.photos[0]} alt={opt.firstName} className="w-full h-full object-cover" /> : <UserIcon />}
                 </div>
                 <span className="truncate">{getFullName(opt)}</span>
              </li>
            )) : <li className="px-4 py-2 text-gray-500">No results found.</li>}
          </ul>
        </div>
      )}
    </div>
  );
};

export default SearchableSelect;