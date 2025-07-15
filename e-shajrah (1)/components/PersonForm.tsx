
import React, { useState, useEffect, useMemo } from 'react';
import type { Person, Marriage } from '../types.ts';
import { Gender, MarriageStatus } from '../types.ts';
import { useFamilyTreeContext } from '../hooks/useFamilyTree.ts';
import Modal from './ui/Modal.tsx';
import Input from './ui/Input.tsx';
import Select from './ui/Select.tsx';
import Button from './ui/Button.tsx';
import { TrashIcon, ArrowUpIcon } from './ui/Icons.tsx';
import ImageEditor from './ImageEditor.tsx';
import SearchableSelect from './ui/SearchableSelect.tsx';
import { getFullName } from '../utils/personUtils.ts';

interface PersonFormProps {
  isOpen: boolean;
  onClose: () => void;
  personToEdit?: Person;
}

export default function PersonForm({ isOpen, onClose, personToEdit }: PersonFormProps) {
  const { people, addPerson, updatePerson, getPersonById } = useFamilyTreeContext();
  const [formData, setFormData] = useState<Partial<Person>>({});
  const [newSpouseId, setNewSpouseId] = useState('');
  
  const [editingImageSrc, setEditingImageSrc] = useState<string | null>(null);
  const [imageFilesToProcess, setImageFilesToProcess] = useState<File[]>([]);

  const initialFormState = {
    firstName: '',
    lastName: '',
    familyCast: '',
    gender: Gender.Male,
    parentIds: [],
    marriages: [],
    photos: [],
  };

  useEffect(() => {
    if (personToEdit) {
      setFormData(personToEdit);
    } else {
      setFormData(initialFormState);
    }
    // Reset spouse ID on form open/close
    setNewSpouseId('');
  }, [personToEdit, isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const target = e.target;
    const name = target.name;
    
    if (target instanceof HTMLInputElement && target.type === 'checkbox') {
        setFormData(prev => ({ ...prev, [name]: target.checked }));
    } else {
        setFormData(prev => ({ ...prev, [name]: target.value }));
    }
  };

  const handleParentChange = (value: string, parentIndex: number) => {
    const newParentIds = [...(formData.parentIds || [])];
    newParentIds[parentIndex] = value;
    if (newParentIds[0] && newParentIds[0] === newParentIds[1]) {
        alert("A person cannot be their own sibling's parent.");
        return;
    }
    setFormData(prev => ({ ...prev, parentIds: newParentIds }));
  };

  const handleMarriageChange = (index: number, field: keyof Marriage, value: string) => {
    const newMarriages = [...(formData.marriages || [])];
    newMarriages[index] = { ...newMarriages[index], [field]: value };
    setFormData(prev => ({ ...prev, marriages: newMarriages }));
  };
  
  const addMarriage = () => {
    if (!newSpouseId) return;
    const newMarriages = [...(formData.marriages || []), { spouseId: newSpouseId, status: MarriageStatus.Married }];
    setFormData(prev => ({ ...prev, marriages: newMarriages }));
    setNewSpouseId('');
  };

  const removeMarriage = (spouseId: string) => {
    const newMarriages = formData.marriages?.filter(m => m.spouseId !== spouseId);
    setFormData(prev => ({ ...prev, marriages: newMarriages }));
  };
  
  const processNextImage = (queue: File[]) => {
      if (queue.length === 0) {
          setEditingImageSrc(null);
          setImageFilesToProcess([]);
          return;
      }

      const nextFile = queue[0];
      const reader = new FileReader();
      reader.readAsDataURL(nextFile);
      reader.onload = (event) => {
          if(event.target?.result) {
            setEditingImageSrc(event.target.result as string);
          } else {
             const remainingFiles = queue.slice(1);
             setImageFilesToProcess(remainingFiles);
             processNextImage(remainingFiles);
          }
      };
      reader.onerror = () => {
          console.error("Error reading file");
          const remainingFiles = queue.slice(1);
          setImageFilesToProcess(remainingFiles);
          processNextImage(remainingFiles);
      }
  };


  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) {
      return;
    }
    
    const filesArray = Array.from(files);
    e.target.value = '';
    
    setImageFilesToProcess(filesArray);
    processNextImage(filesArray);
  };

  const handleEditorClose = () => {
      const remainingFiles = imageFilesToProcess.slice(1);
      setImageFilesToProcess(remainingFiles);
      processNextImage(remainingFiles);
  };
  
  const handleEditorSave = (croppedImage: string) => {
    setFormData(prev => ({
        ...prev,
        photos: [...(prev.photos || []), croppedImage],
    }));
    handleEditorClose();
  };


  const handleRemovePhoto = (index: number) => {
    setFormData(prev => ({
        ...prev,
        photos: prev.photos?.filter((_, i) => i !== index)
    }));
  };

  const handleSetDisplayPhoto = (index: number) => {
    if (!formData.photos || index === 0) return;
    const newPhotos = [...formData.photos];
    const [item] = newPhotos.splice(index, 1);
    newPhotos.unshift(item);
    setFormData(prev => ({ ...prev, photos: newPhotos }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.firstName) {
      alert('First Name is required.');
      return;
    }
    if (personToEdit) {
      updatePerson(personToEdit.id, formData);
    } else {
      addPerson(formData as Omit<Person, 'id' | 'childrenIds' | 'marriages'>);
    }
    onClose();
  };
  
  const potentialFathers = people.filter(p => p.gender === Gender.Male && p.id !== personToEdit?.id);
  const potentialMothers = people.filter(p => p.gender === Gender.Female && p.id !== personToEdit?.id);

  const potentialSpouses = useMemo(() => {
    const editorGender = formData.gender;

    return people.filter(p => {
        // Person being edited cannot be their own spouse
        if (p.id === personToEdit?.id) return false;
        // Person is already a spouse
        if(formData.marriages?.some(m => m.spouseId === p.id)) return false;

        if (editorGender === Gender.Male) return p.gender === Gender.Female;
        if (editorGender === Gender.Female) return p.gender === Gender.Male;
        // For 'Other', allow male or female spouses
        if (editorGender === Gender.Other) return p.gender === Gender.Male || p.gender === Gender.Female;
        
        return false;
    });
  }, [people, personToEdit, formData.gender, formData.marriages]);
  
  // The color of the spouse dropdown should reflect the gender of the people *in* the list.
  const spouseListGender = potentialSpouses.length > 0 ? potentialSpouses[0].gender : null;
  const spouseSelectClass =
    spouseListGender === Gender.Male
      ? 'bg-male dark:bg-male-dark border-male-border'
      : spouseListGender === Gender.Female
      ? 'bg-female dark:bg-female-dark border-female-border'
      : '';

  const genderClass =
    formData.gender === Gender.Male
      ? 'bg-male dark:bg-male-dark border-male-border'
      : formData.gender === Gender.Female
      ? 'bg-female dark:bg-female-dark border-female-border'
      : '';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={personToEdit ? `Edit ${getFullName(formData)}` : 'Add New Person'}>
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
             <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Personal Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input label="First Name" name="firstName" value={formData.firstName || ''} onChange={handleChange} required />
                <Input label="Last Name" name="lastName" value={formData.lastName || ''} onChange={handleChange} />
                <Input label="Family Cast" name="familyCast" value={formData.familyCast || ''} onChange={handleChange} />
            </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <Select label="Gender" name="gender" value={formData.gender || ''} onChange={handleChange} className={genderClass}>
                    {Object.values(Gender).map(g => <option key={g} value={g}>{g}</option>)}
                </Select>
                <Input label="Occupation" name="occupation" value={formData.occupation || ''} onChange={handleChange} />
            </div>
        </div>

        {/* Life Events */}
        <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Life Events</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input label="Birth Date" name="birthDate" type="date" value={formData.birthDate || ''} onChange={handleChange} />
                <Input label="Birth Place" name="birthPlace" value={formData.birthPlace || ''} onChange={handleChange} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                <Input label="Death Date" name="deathDate" type="date" value={formData.deathDate || ''} onChange={handleChange} />
                <Input label="Death Place" name="deathPlace" value={formData.deathPlace || ''} onChange={handleChange} />
                <Input label="Cause of Death" name="causeOfDeath" value={formData.causeOfDeath || ''} onChange={handleChange} />
            </div>
        </div>
        
        {/* Photo Upload */}
        <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Photos</h3>
             <div>
                <label htmlFor="photo-upload" className="sr-only">Upload photos</label>
                <div className="mt-1 p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-md">
                    <input 
                        type="file" 
                        id="photo-upload"
                        multiple 
                        accept="image/*"
                        onChange={handlePhotoUpload}
                        className="block w-full text-sm text-gray-500
                                file:mr-4 file:py-2 file:px-4
                                file:rounded-full file:border-0
                                file:text-sm file:font-semibold
                                file:bg-blue-50 dark:file:bg-blue-900/50
                                file:text-blue-700 dark:file:text-blue-300
                                hover:file:bg-blue-100"
                    />
                    <p className="text-xs text-gray-500 mt-1">Upload one or more images. After selection, an editor will open to crop and rotate.</p>
                </div>
            </div>

            {formData.photos && formData.photos.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mt-4">
                    {formData.photos.map((photo, index) => (
                        <div key={index} className="relative group aspect-square">
                            <img src={photo} alt={`Photo ${index + 1}`} className="w-full h-full object-cover rounded-md" />
                            {index === 0 && (
                                <span className="absolute top-1 left-1 bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded">Display Pic</span>
                            )}
                            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-60 transition-all flex items-center justify-center">
                                <div className="flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button type="button" onClick={() => handleRemovePhoto(index)} title="Remove Photo" className="p-1.5 bg-red-600 text-white rounded-full hover:bg-red-700 shadow-lg">
                                    <TrashIcon />
                                    </button>
                                    {index > 0 && (
                                        <button type="button" onClick={() => handleSetDisplayPhoto(index)} title="Make Display Picture" className="p-1.5 bg-blue-600 text-white rounded-full hover:bg-blue-700 shadow-lg">
                                            <ArrowUpIcon />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>


        {/* Additional Info */}
         <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Additional Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input label="Education" name="education" value={formData.education || ''} onChange={handleChange} />
                <Input label="Religion" name="religion" value={formData.religion || ''} onChange={handleChange} />
                <Input label="Residence" name="residence" value={formData.residence || ''} onChange={handleChange} />
                <Input label="Mobile Number" name="mobileNumber" value={formData.mobileNumber || ''} onChange={handleChange} />
                <Input label="Email" name="email" type="email" value={formData.email || ''} onChange={handleChange} />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mt-4">Notes / Biography</label>
                <textarea name="notes" value={formData.notes || ''} onChange={handleChange} rows={4} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"></textarea>
            </div>
        </div>
        
        {/* Family */}
        <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Family Relationships</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SearchableSelect
                    label="Father"
                    options={potentialFathers}
                    value={formData.parentIds?.[0] || ''}
                    onChange={(value) => handleParentChange(value, 0)}
                    className="bg-male dark:bg-male-dark border-male-border"
                    placeholder="Unknown"
                />
                <SearchableSelect
                    label="Mother"
                    options={potentialMothers}
                    value={formData.parentIds?.[1] || ''}
                    onChange={(value) => handleParentChange(value, 1)}
                    className="bg-female dark:bg-female-dark border-female-border"
                    placeholder="Unknown"
                />
            </div>
            
             <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Spouses</label>
                {formData.marriages?.map((marriage, index) => {
                    const spouse = getPersonById(marriage.spouseId);
                    return spouse ? (
                        <div key={index} className="flex items-center space-x-2 mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded-md">
                           <div className="flex-grow font-semibold">{getFullName(spouse)}</div>
                           
                           <div className="w-40">
                             <Select label="Status" value={marriage.status} onChange={(e) => handleMarriageChange(index, 'status', e.target.value)}>
                                {Object.values(MarriageStatus).map(s => <option key={s} value={s}>{s}</option>)}
                            </Select>
                           </div>
                           
                           <div className="w-48">
                            <Input label="Date" type="date" value={marriage.date || ''} onChange={(e) => handleMarriageChange(index, 'date', e.target.value)} />
                           </div>
                           
                           <div className="flex-grow">
                             <Input label="Place" placeholder="Place of marriage" value={marriage.place || ''} onChange={(e) => handleMarriageChange(index, 'place', e.target.value)} />
                           </div>

                            <button type="button" onClick={() => removeMarriage(marriage.spouseId)} className="p-2 text-red-500 hover:text-red-700 rounded-full hover:bg-red-100 dark:hover:bg-red-900/50">
                                <TrashIcon />
                            </button>
                        </div>
                    ) : null;
                })}
                
                <div className="flex items-end space-x-2 mt-4">
                    <div className="flex-grow">
                         <SearchableSelect
                            label="Add New Spouse"
                            options={potentialSpouses}
                            value={newSpouseId}
                            onChange={setNewSpouseId}
                            className={spouseSelectClass}
                            placeholder="-- Select a Spouse --"
                         />
                    </div>
                    <Button type="button" variant="secondary" onClick={addMarriage} disabled={!newSpouseId}>Add Spouse</Button>
                </div>
            </div>

             <div className="flex items-center mt-4">
                <input
                    id="isAdopted"
                    name="isAdopted"
                    type="checkbox"
                    checked={formData.isAdopted || false}
                    onChange={handleChange}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="isAdopted" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">
                    This person is adopted
                </label>
            </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end space-x-2 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit">Save Changes</Button>
        </div>
      </form>
       {editingImageSrc && (
            <ImageEditor 
                imageSrc={editingImageSrc}
                onClose={handleEditorClose}
                onSave={handleEditorSave}
            />
        )}
    </Modal>
  );
}