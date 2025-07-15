
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Person, Statistics } from '../types.ts';
import { Gender } from '../types.ts';
import { useFamilyTreeContext } from '../hooks/useFamilyTree.ts';
import { getLifespanInMonths, formatLifespan, calculateAge } from '../utils/dateUtils.ts';
import { generateLifeStory, translateText } from '../services/geminiService.ts';
import Button from './ui/Button.tsx';
import Modal from './ui/Modal.tsx';
import { MaleSymbolIcon, FemaleSymbolIcon, UserIcon, ChevronLeftIcon, ChevronRightIcon, GraveIcon, PrintIcon, SpinnerIcon } from './ui/Icons.tsx';
import { generatePdf } from '../utils/pdfUtils.ts';
import SearchableSelect from './ui/SearchableSelect.tsx';
import { getFullName } from '../utils/personUtils.ts';
import { findRelationship, type Relationship } from '../utils/relationshipUtils.ts';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import autoTable from 'jspdf-autotable';

// --- Reusable Helper Functions for Relationship Traversal ---

const getAncestorsHierarchically = (person: Person, allPeople: Person[]): { person: Person, level: number }[] => {
    const results: { person: Person, level: number }[] = [];
    if (!person.parentIds) return results;

    const queue: { personId: string; level: number }[] = (person.parentIds || []).map(id => ({ personId: id, level: 1 }));
    const visited = new Set<string>();
    const getPersonById = (id: string) => allPeople.find(p => p.id === id);

    while (queue.length > 0) {
        // Using BFS ensures we process by generation level.
        const { personId, level } = queue.shift()!;
        if (!personId || visited.has(personId)) continue;
        visited.add(personId);

        const p = getPersonById(personId);
        if (p) {
            results.push({ person: p, level });
            p.parentIds?.forEach(parentId => {
                if (!visited.has(parentId)) {
                    queue.push({ personId: parentId, level: level + 1 });
                }
            });
        }
    }
    return results;
};

const getDescendants = (person: Person, allPeople: Person[]): Person[] => {
    const descendants: Person[] = [];
    if (!person.childrenIds) return descendants;
    
    const queue = [...person.childrenIds];
    const visited = new Set<string>();

    while (queue.length > 0) {
        const personId = queue.shift()!;
        if (visited.has(personId) || !personId) continue;
        
        visited.add(personId);

        const p = allPeople.find(ap => ap.id === personId);
        if (p) {
            descendants.push(p);
            p.childrenIds?.forEach(childId => {
                if (!visited.has(childId)) {
                    queue.push(childId);
                }
            });
        }
    }
    return descendants;
};

const getDescendantsWithRelationship = (person: Person, allPeople: Person[]): { person: Person, relationship: string, generation: number }[] => {
    const results: { person: Person, relationship: string, generation: number }[] = [];
    if (!person.childrenIds) return results;

    const queue: { personId: string; generation: number }[] = person.childrenIds.map(id => ({ personId: id, generation: 1 }));
    const visited = new Set<string>();

    const getPersonById = (id: string) => allPeople.find(p => p.id === id);

    while (queue.length > 0) {
        const { personId, generation } = queue.shift()!;
        if (!personId || visited.has(personId)) continue;
        visited.add(personId);

        const p = getPersonById(personId);
        if (p) {
            let relationship = '';
            if (generation === 1) {
                relationship = p.gender === Gender.Male ? 'Son' : p.gender === Gender.Female ? 'Daughter' : 'Child';
            } else if (generation === 2) {
                relationship = p.gender === Gender.Male ? 'Grandson' : p.gender === Gender.Female ? 'Granddaughter' : 'Grandchild';
            } else { // generation > 2
                const prefix = 'Great-'.repeat(generation - 2);
                relationship = p.gender === Gender.Male ? `${prefix}Grandson` : p.gender === Gender.Female ? `${prefix}Granddaughter` : `${prefix}Grandchild`;
            }
            
            results.push({ person: p, relationship, generation });
            
            p.childrenIds?.forEach(childId => {
                if (!visited.has(childId)) {
                    queue.push({ personId: childId, generation: generation + 1 });
                }
            });
        }
    }
    return results;
};


const getAncestorsWithRelationship = (person: Person, allPeople: Person[]): { person: Person, relationship: string }[] => {
    const results: { person: Person, relationship: string }[] = [];
    if (!person.parentIds) return results;

    const getPersonById = (id: string) => allPeople.find(p => p.id === id);

    const queue: { personId: string; generation: number; lineage: 'Paternal' | 'Maternal' | null }[] = [];
    const visited = new Set<string>();

    // Initialize queue with lineage based on the gender of the person's parents
    (person.parentIds || []).forEach(parentId => {
        const parent = getPersonById(parentId);
        if (parent) {
            let lineage: 'Paternal' | 'Maternal' | null = null;
            if (parent.gender === Gender.Male) lineage = 'Paternal';
            else if (parent.gender === Gender.Female) lineage = 'Maternal';
            queue.push({ personId: parentId, generation: 1, lineage });
        }
    });

    while (queue.length > 0) {
        const { personId, generation, lineage } = queue.shift()!;
        if (!personId || visited.has(personId)) continue;
        visited.add(personId);

        const p = getPersonById(personId);
        if (p) {
            let relationship: string;
            let lineageSuffix = '';
            
            if (generation > 1 && lineage) {
                lineageSuffix = ` (${lineage})`;
            }

            if (generation === 1) {
                relationship = p.gender === Gender.Male ? 'Father' : p.gender === Gender.Female ? 'Mother' : 'Parent';
            } else if (generation === 2) {
                relationship = p.gender === Gender.Male ? 'Grandfather' : p.gender === Gender.Female ? 'Grandmother' : 'Grandparent';
            } else { // generation > 2
                const prefix = 'Great-'.repeat(generation - 2);
                relationship = p.gender === Gender.Male ? `${prefix}Grandfather` : p.gender === Gender.Female ? `${prefix}Grandmother` : `${prefix}Grandparent`;
            }
            
            results.push({ person: p, relationship: `${relationship}${lineageSuffix}` });
            
            p.parentIds?.forEach(parentId => {
                if (!visited.has(parentId)) {
                    queue.push({ personId: parentId, generation: generation + 1, lineage: lineage });
                }
            });
        }
    }
    return results;
};

const getSiblingsWithRelationship = (person: Person, allPeople: Person[]): { person: Person, relationship: string }[] => {
    if (!person.parentIds || person.parentIds.length === 0) {
        return [];
    }
    const parentIdSet = new Set(person.parentIds.filter(id => id));
    if (parentIdSet.size === 0) return [];

    return allPeople.filter(p => {
        if (p.id === person.id) return false;
        if (!p.parentIds) return false;
        return p.parentIds.some(pid => parentIdSet.has(pid));
    })
    .map(sibling => ({
        person: sibling,
        relationship: sibling.gender === Gender.Male ? 'Brother' : sibling.gender === Gender.Female ? 'Sister' : 'Sibling'
    }));
};


// --- Report Generators ---

const StatsAndChartsGenerator = () => {
    const { people } = useFamilyTreeContext();
    const statsContainerRef = useRef<HTMLDivElement>(null);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

    const stats = useMemo<Statistics>(() => {
        const totalPeople = people.length;
        const maleCount = people.filter(p => p.gender === Gender.Male).length;
        const femaleCount = people.filter(p => p.gender === Gender.Female).length;
        
        const lifespansInMonths = people
            .map(p => getLifespanInMonths(p.birthDate, p.deathDate))
            .filter((months): months is number => months !== null && months > 0);
        
        const avgLifespanMonths = lifespansInMonths.length > 0 ? lifespansInMonths.reduce((a, b) => a + b, 0) / lifespansInMonths.length : 0;
        const averageLifespan = formatLifespan(avgLifespanMonths);

        let oldestLivingPerson: Person | undefined;
        let oldestPersonEver: Person | undefined;
        
        let maxAgeLiving = -1;
        let maxAgeEver = -1;
        
        people.forEach(p => {
            const ageString = calculateAge(p.birthDate, p.deathDate);
            if(ageString === 'N/A') return;

            const ageInTotalMonths = (parseInt(ageString.split(' ')[0]) * 12) + parseInt(ageString.split(' ')[2]);

            if (p.deathDate) {
                if (ageInTotalMonths > maxAgeEver) {
                    maxAgeEver = ageInTotalMonths;
                    oldestPersonEver = p;
                }
            } else {
                 if (ageInTotalMonths > maxAgeLiving) {
                    maxAgeLiving = ageInTotalMonths;
                    oldestLivingPerson = p;
                }
                if (ageInTotalMonths > maxAgeEver) {
                    maxAgeEver = ageInTotalMonths;
                    oldestPersonEver = p;
                }
            }
        });

        return { totalPeople, maleCount, femaleCount, averageLifespan, oldestLivingPerson, oldestPersonEver };
    }, [people]);

    const handleDownloadReport = async () => {
        if (!statsContainerRef.current) return;
    
        setIsGeneratingPdf(true);
        
        const fileName = 'Family_Statistics_Report';
        
        const printableElement = document.createElement('div');
        printableElement.style.position = 'absolute';
        printableElement.style.left = '-9999px';
        printableElement.style.width = '210mm';
        printableElement.style.padding = '20px';
        printableElement.style.backgroundColor = 'white';
        printableElement.style.color = 'black';
        printableElement.style.fontFamily = 'sans-serif';
    
        const reportTitleHtml = `<h1 style="font-size: 28px; font-weight: bold; text-align: center; margin-bottom: 20px;">Family Statistics Report</h1>`;
        printableElement.innerHTML = reportTitleHtml;
    
        const statsClone = statsContainerRef.current.cloneNode(true) as HTMLElement;
        printableElement.appendChild(statsClone);
    
        document.body.appendChild(printableElement);
    
        try {
            await generatePdf(printableElement, fileName);
        } catch (error) {
            console.error("Error generating stats PDF:", error);
            alert("Sorry, an error occurred while generating the PDF report.");
        } finally {
            if (document.body.contains(printableElement)) {
                document.body.removeChild(printableElement);
            }
            setIsGeneratingPdf(false);
        }
    };

    if (people.length === 0) {
        return (
            <div className="report-container">
                <h3 className="text-xl font-semibold mb-4">Family Statistics</h3>
                <p className="text-gray-500">Add people to the tree to see statistics.</p>
            </div>
        );
    }
    
    return (
        <div className="report-container">
            <div className="flex justify-between items-start">
                 <h3 className="text-xl font-semibold mb-4">Family Statistics</h3>
                 <Button onClick={handleDownloadReport} disabled={isGeneratingPdf}>
                    {isGeneratingPdf ? <SpinnerIcon /> : <PrintIcon />}
                    <span className="ml-2 hidden sm:inline">{isGeneratingPdf ? 'Generating...' : 'Download Report'}</span>
                 </Button>
            </div>
            
            <div ref={statsContainerRef}>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    <div className="bg-blue-100 dark:bg-blue-900/50 p-4 rounded-lg">
                        <h4 className="font-bold text-blue-800 dark:text-blue-200">Total Individuals</h4>
                        <p className="text-3xl font-bold text-blue-600 dark:text-blue-300">{stats.totalPeople}</p>
                    </div>
                    <div className="bg-indigo-100 dark:bg-indigo-900/50 p-4 rounded-lg">
                        <h4 className="font-bold text-indigo-800 dark:text-indigo-200">Gender Ratio</h4>
                        <p className="text-xl font-semibold text-indigo-600 dark:text-indigo-300">
                            {stats.maleCount} Male / {stats.femaleCount} Female
                        </p>
                    </div>
                    <div className="bg-green-100 dark:bg-green-900/50 p-4 rounded-lg">
                        <h4 className="font-bold text-green-800 dark:text-green-200">Average Lifespan</h4>
                        <p className="text-xl font-semibold text-green-600 dark:text-green-300">{stats.averageLifespan}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg">
                        <h4 className="font-semibold mb-2">Oldest Living Person</h4>
                        {stats.oldestLivingPerson ? (
                             <div className="flex items-center space-x-3">
                                {stats.oldestLivingPerson.photos?.[0] && <img src={stats.oldestLivingPerson.photos[0]} alt="" className="w-12 h-12 rounded-full object-cover" />}
                                <div>
                                    <p className="font-bold">{getFullName(stats.oldestLivingPerson)}</p>
                                    <p className="text-sm">{calculateAge(stats.oldestLivingPerson.birthDate)}</p>
                                </div>
                            </div>
                        ) : <p className="text-sm text-gray-500">N/A</p>}
                    </div>
                     <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg">
                        <h4 className="font-semibold mb-2">Oldest Person Ever (Deceased)</h4>
                        {stats.oldestPersonEver && stats.oldestPersonEver.deathDate ? (
                             <div className="flex items-center space-x-3">
                                {stats.oldestPersonEver.photos?.[0] && <img src={stats.oldestPersonEver.photos[0]} alt="" className="w-12 h-12 rounded-full object-cover" />}
                                <div>
                                    <p className="font-bold">{getFullName(stats.oldestPersonEver)}</p>
                                    <p className="text-sm">{calculateAge(stats.oldestPersonEver.birthDate, stats.oldestPersonEver.deathDate)}</p>
                                </div>
                            </div>
                        ) : <p className="text-sm text-gray-500">N/A</p>}
                    </div>
                </div>
            </div>
        </div>
    );
};

const LifeStoryGenerator = () => {
    const { people, getPersonById } = useFamilyTreeContext();
    const [personId, setPersonId] = useState('');
    const [story, setStory] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isTranslating, setIsTranslating] = useState(false);
    const [targetLanguage, setTargetLanguage] = useState('Urdu');
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const lifeStoryReportRef = useRef<HTMLDivElement>(null);

    const handleGenerate = useCallback(async () => {
        if (!personId) return;
        const person = people.find(p => p.id === personId);
        if (!person) return;

        setIsLoading(true);
        setStory('');

        const parents = person.parentIds?.map(id => getPersonById(id)).filter(p => p) || [];
        const spouses = person.marriages?.map(m => getPersonById(m.spouseId)).filter(p => p) || [];
        const children = person.childrenIds?.map(id => getPersonById(id)).filter(p => p) || [];

        const lifeStory = await generateLifeStory(person, { parents, spouses, children });
        setStory(lifeStory);
        setIsLoading(false);
    }, [personId, people, getPersonById]);

    useEffect(() => {
        if (personId) {
            handleGenerate();
        } else {
            setStory('');
        }
    }, [personId, handleGenerate]);
    
    const handleTranslate = async () => {
        if (!story || !targetLanguage) return;
        setIsTranslating(true);
        const translatedStory = await translateText(story, targetLanguage);
        setStory(translatedStory);
        setIsTranslating(false);
    };

    const handleDownloadLifeStoryReport = async () => {
        if (!lifeStoryReportRef.current || !selectedPerson) return;
    
        setIsGeneratingPdf(true);
        const fileName = `Life_Story_for_${getFullName(selectedPerson)}`;
        
        const printableElement = document.createElement('div');
        printableElement.style.position = 'absolute';
        printableElement.style.left = '-9999px';
        printableElement.style.width = '210mm';
        printableElement.style.padding = '20px';
        printableElement.style.backgroundColor = 'white';
        printableElement.style.color = 'black';
        printableElement.style.fontFamily = 'sans-serif';

        const reportTitle = `<h1 style="font-size: 28px; font-weight: bold; text-align: center; margin-bottom: 20px;">Life Story Report</h1>`;
        printableElement.innerHTML = reportTitle;
    
        const contentClone = lifeStoryReportRef.current.cloneNode(true) as HTMLElement;
        // Remove elements that shouldn't be in the PDF from the clone
        contentClone.querySelectorAll('.no-print').forEach(el => {
            (el as HTMLElement).style.display = 'none';
        });
        printableElement.appendChild(contentClone);

        document.body.appendChild(printableElement);

        try {
            await generatePdf(printableElement, fileName, 'p');
        } catch (error) {
            console.error("Error generating life story PDF:", error);
            alert("Sorry, an error occurred while generating the PDF report.");
        } finally {
            if (document.body.contains(printableElement)) {
                document.body.removeChild(printableElement);
            }
            setIsGeneratingPdf(false);
        }
    };

    const selectedPerson = people.find(p => p.id === personId);

    return (
        <div className="report-container">
            <h3 className="text-xl font-semibold mb-4">AI-Powered Life Story Generator</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Select a person and let our AI assistant craft a biographical narrative based on their recorded life events.
            </p>
            <div className="flex items-end space-x-2 mb-4">
                <div className="flex-grow max-w-sm">
                    <SearchableSelect
                        label="Select Person"
                        options={people}
                        value={personId}
                        onChange={setPersonId}
                        placeholder="Select a person to generate a story"
                    />
                </div>
                {story && (
                    <Button onClick={handleDownloadLifeStoryReport} disabled={isGeneratingPdf} variant="secondary">
                        {isGeneratingPdf ? <SpinnerIcon /> : <PrintIcon />}
                        <span className="ml-2 hidden sm:inline">{isGeneratingPdf ? 'Generating...' : 'Download Report'}</span>
                    </Button>
                )}
            </div>

            <div ref={lifeStoryReportRef}>
                {(isLoading || story) && selectedPerson && (
                     <div className={`p-4 border rounded-lg animate-fadeIn ${
                        selectedPerson.gender === Gender.Male ? 'bg-male dark:bg-male-dark' :
                        selectedPerson.gender === Gender.Female ? 'bg-female dark:bg-female-dark' :
                        'bg-gray-50 dark:bg-gray-800/50'
                     }`}>
                        <div className="flex items-center space-x-4 pb-4 mb-4 border-b border-gray-200 dark:border-gray-700">
                           {selectedPerson.photos?.[0] && <img src={selectedPerson.photos[0]} alt={getFullName(selectedPerson)} className="w-16 h-20 rounded-md object-cover" />}
                           <div>
                             <h4 className="text-lg font-bold">Life Story for {getFullName(selectedPerson)}</h4>
                             <p className="text-sm text-gray-500">{selectedPerson.birthDate} - {selectedPerson.deathDate || 'Present'}</p>
                           </div>
                        </div>
                        {isLoading && (
                            <div className="flex items-center space-x-2 text-gray-500">
                                <SpinnerIcon /> <span>Generating narrative, please wait...</span>
                            </div>
                        )}
                        {story && (
                            <div>
                                <p className="whitespace-pre-wrap leading-relaxed">{story}</p>
                                 <div className="flex items-end space-x-2 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 no-print">
                                     <div className="flex-grow max-w-xs">
                                         <label htmlFor="language" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Translate to:</label>
                                         <select id="language" value={targetLanguage} onChange={e => setTargetLanguage(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md">
                                            <option>Urdu</option>
                                            <option>English</option>
                                            <option>Spanish</option>
                                            <option>French</option>
                                            <option>German</option>
                                            <option>Arabic</option>
                                         </select>
                                     </div>
                                    <Button onClick={handleTranslate} disabled={isTranslating || !targetLanguage}>
                                        {isTranslating ? <SpinnerIcon /> : null}
                                        <span className="ml-2">{isTranslating ? 'Translating...' : 'Translate'}</span>
                                    </Button>
                                 </div>
                            </div>
                        )}
                     </div>
                )}
            </div>
        </div>
    );
};

const RelationshipFinder = () => {
    const { people } = useFamilyTreeContext();
    const navigate = useNavigate();
    const [person1Id, setPerson1Id] = useState('');
    const [person2Id, setPerson2Id] = useState('');
    const [relationship, setRelationship] = useState<Relationship | null>(null);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const relationshipReportRef = useRef<HTMLDivElement>(null);

    const handleFindRelationship = useCallback(() => {
        if (!person1Id || !person2Id) {
            return;
        }
        if (person1Id === person2Id) {
            setRelationship({ type: 'none', description: 'Please select two different people.' });
            return;
        }
        const rel = findRelationship(person1Id, person2Id, people);
        setRelationship(rel);
    }, [person1Id, person2Id, people]);

    useEffect(() => {
        if (person1Id && person2Id) {
            handleFindRelationship();
        } else {
            setRelationship(null);
        }
    }, [person1Id, person2Id, handleFindRelationship]);
    
    const handleDownloadRelationshipReport = async () => {
        if (!relationshipReportRef.current || !person1 || !person2) return;
        
        setIsGeneratingPdf(true);
        const fileName = `Relationship_Report_${getFullName(person1)}_${getFullName(person2)}`;

        const printableElement = document.createElement('div');
        printableElement.style.position = 'absolute';
        printableElement.style.left = '-9999px';
        printableElement.style.padding = '20px';
        printableElement.style.backgroundColor = 'white';
        printableElement.style.color = 'black';
        printableElement.style.fontFamily = 'sans-serif';
        printableElement.style.width = '210mm';

        const reportTitle = `<h1 style="font-size: 28px; font-weight: bold; text-align: center; margin-bottom: 20px;">Relationship Report</h1>`;
        printableElement.innerHTML = reportTitle;

        const contentClone = relationshipReportRef.current.cloneNode(true) as HTMLElement;
        printableElement.appendChild(contentClone);

        document.body.appendChild(printableElement);

        try {
            await generatePdf(printableElement, fileName, 'p');
        } catch (error) {
            console.error("Error generating relationship PDF:", error);
            alert("Sorry, an error occurred while generating the PDF report.");
        } finally {
            if (document.body.contains(printableElement)) {
                document.body.removeChild(printableElement);
            }
            setIsGeneratingPdf(false);
        }
    };

    const handleViewOnTree = (personId: string, path: string[]) => {
        navigate('/tree');
        // This relies on a mechanism in the tree view to accept this configuration
        // In useFamilyTreeContext, we can add a state for this
        // For now, this is a placeholder for the navigation logic.
        console.log("Navigating to tree for", personId, "with path", path);
    };
    
    const person1 = people.find(p => p.id === person1Id);
    const person2 = people.find(p => p.id === person2Id);

    const PersonCard = ({ person }: { person: Person }) => {
        const genderClass = person.gender === Gender.Male ? 'bg-male dark:bg-male-dark' : person.gender === Gender.Female ? 'bg-female dark:bg-female-dark' : 'bg-gray-100 dark:bg-gray-800';
        return (
            <div className={`flex items-center space-x-3 p-3 rounded-lg ${genderClass}`}>
                {person.photos?.[0] ? 
                    <img src={person.photos[0]} className="w-12 h-16 rounded-md object-cover" alt={getFullName(person)} /> : 
                    <div className="w-12 h-16 rounded-md bg-gray-200 dark:bg-gray-700 flex items-center justify-center"><UserIcon/></div>
                }
                <div>
                    <p className="font-bold">{getFullName(person)}</p>
                    <p className="text-xs text-gray-500">{person.birthDate || 'Unknown'}</p>
                </div>
            </div>
        );
    };
    
    return (
        <div className="report-container">
            <h3 className="text-xl font-semibold mb-4">Relationship Finder</h3>
             <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Select two individuals from your tree to discover how they are related.
            </p>
            <div className="flex items-end space-x-2 mb-4">
                 <div className="flex-grow max-w-sm">
                    <SearchableSelect
                        label="Person 1"
                        options={people}
                        value={person1Id}
                        onChange={setPerson1Id}
                        placeholder="Select first person"
                    />
                </div>
                <div className="flex-grow max-w-sm">
                     <SearchableSelect
                        label="Person 2"
                        options={people}
                        value={person2Id}
                        onChange={setPerson2Id}
                        placeholder="Select second person"
                    />
                </div>
                {relationship && (
                    <Button onClick={handleDownloadRelationshipReport} disabled={isGeneratingPdf} variant="secondary">
                       {isGeneratingPdf ? <SpinnerIcon /> : <PrintIcon />}
                       <span className="ml-2 hidden sm:inline">{isGeneratingPdf ? 'Generating...' : 'Download Report'}</span>
                    </Button>
                )}
            </div>
            
            {relationship && person1 && person2 && (
                <div ref={relationshipReportRef} className="mt-6 p-4 border rounded-lg bg-gray-50 dark:bg-gray-800/50 animate-fadeIn">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <PersonCard person={person1} />
                        <PersonCard person={person2} />
                    </div>
                    <div className="text-center p-4 bg-white dark:bg-gray-900 rounded-lg">
                        <h4 className="text-lg font-bold text-blue-600 dark:text-blue-400">{relationship.description}</h4>
                    </div>

                    {relationship.type === 'blood' && (
                        <div className="mt-4 text-sm text-gray-600 dark:text-gray-300">
                             <p className="mb-2">The closest common ancestor is <strong>{getFullName(relationship.lca)}</strong>.</p>
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <h5 className="font-semibold">Path from {getFullName(person1)}:</h5>
                                    <p>{relationship.path1.map(p => getFullName(p)).join(' → ')}</p>
                                </div>
                                <div>
                                    <h5 className="font-semibold">Path from {getFullName(person2)}:</h5>
                                    <p>{relationship.path2.map(p => getFullName(p)).join(' → ')}</p>
                                </div>
                             </div>
                        </div>
                    )}
                     {relationship.type === 'path' && (
                        <div className="mt-4 text-sm text-gray-600 dark:text-gray-300">
                             <h5 className="font-semibold">Full Relationship Path:</h5>
                             <p>{relationship.path.map(p => getFullName(p)).join(' → ')}</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

type DescendantReportData = {
    rootPerson: Person;
    descendants: { person: Person, relationship: string, generation: number }[];
};

const DescendantReportGenerator: React.FC = () => {
    const { people, getPersonById, configureTreeView } = useFamilyTreeContext();
    const navigate = useNavigate();
    const [personId, setPersonId] = useState('');
    const [descendantReportData, setDescendantReportData] = useState<DescendantReportData | null>(null);
    const descendantReportRef = useRef<HTMLDivElement>(null);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

    const handleGenerateDescendantReport = useCallback(() => {
        if (!personId) return;
        const person = getPersonById(personId);
        if (person) {
            const descendants = getDescendantsWithRelationship(person, people);
            
            const sortedDescendants = descendants.sort((a, b) => {
                if (a.generation !== b.generation) return a.generation - b.generation;
                const dateA = a.person.birthDate ? new Date(a.person.birthDate).getTime() : Infinity;
                const dateB = b.person.birthDate ? new Date(b.person.birthDate).getTime() : Infinity;
                if (dateA === Infinity && dateB === Infinity) return getFullName(a.person).localeCompare(getFullName(b.person));
                return dateA - dateB;
            });

            setDescendantReportData({ rootPerson: person, descendants: sortedDescendants });
        }
    }, [personId, getPersonById, people]);

    useEffect(() => {
        if (personId) {
            handleGenerateDescendantReport();
        } else {
            setDescendantReportData(null);
        }
    }, [personId, handleGenerateDescendantReport]);
    
    const handleDownloadDescendantReport = async () => {
        if (!descendantReportRef.current || !descendantReportData) return;
        
        setIsGeneratingPdf(true);
        const { rootPerson } = descendantReportData;
        const fileName = `Descendant_Report_for_${getFullName(rootPerson)}`;
        
        const printableElement = document.createElement('div');
        printableElement.style.position = 'absolute';
        printableElement.style.left = '-9999px';
        printableElement.style.width = '210mm';
        printableElement.style.padding = '20px';
        printableElement.style.backgroundColor = 'white';
        printableElement.style.color = 'black';
        printableElement.style.fontFamily = 'sans-serif';

        const reportTitle = `<h1 style="font-size: 28px; font-weight: bold; text-align: center; margin-bottom: 20px;">Descendant Report</h1>`;
        printableElement.innerHTML = reportTitle;

        const contentClone = descendantReportRef.current.cloneNode(true) as HTMLElement;
        printableElement.appendChild(contentClone);

        document.body.appendChild(printableElement);

        try {
            await generatePdf(printableElement, fileName, 'p');
        } catch (error) {
            console.error("Error generating descendant report PDF:", error);
            alert("Sorry, an error occurred while generating the PDF report.");
        } finally {
            if (document.body.contains(printableElement)) {
                document.body.removeChild(printableElement);
            }
            setIsGeneratingPdf(false);
        }
    };

    const handleViewOnTree = (personId: string) => {
        if (!descendantReportData) return;
        
        const queue: { personId: string; path: string[] }[] = [{ personId: descendantReportData.rootPerson.id, path: [descendantReportData.rootPerson.id] }];
        const visited = new Set<string>([descendantReportData.rootPerson.id]);
        let finalPath: string[] | null = null;
        
        while(queue.length > 0) {
            const { personId: currentId, path } = queue.shift()!;
            if (currentId === personId) {
                finalPath = path;
                break;
            }
            const currentPerson = getPersonById(currentId);
            currentPerson?.childrenIds?.forEach(childId => {
                if (!visited.has(childId)) {
                    visited.add(childId);
                    queue.push({ personId: childId, path: [...path, childId] });
                }
            })
        }

        if (finalPath) {
             configureTreeView({ rootId: descendantReportData.rootPerson.id, visiblePath: finalPath });
             navigate('/tree');
        } else {
            alert("Could not construct path to person on the tree.");
        }
    };

    return (
        <div className="report-container">
            <h3 className="text-xl font-semibold mb-4">Descendant Report</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Select an individual to generate a list of all their known descendants.
            </p>
            <div className="flex items-end space-x-2 mb-4 no-print">
                <div className="flex-grow max-w-sm">
                    <SearchableSelect
                        label="Select Person"
                        options={people}
                        value={personId}
                        onChange={setPersonId}
                        placeholder="Select an ancestor"
                    />
                </div>
                {descendantReportData && (
                     <Button onClick={handleDownloadDescendantReport} disabled={isGeneratingPdf}>
                         {isGeneratingPdf ? <SpinnerIcon /> : <PrintIcon />}
                         <span className="ml-2 hidden sm:inline">{isGeneratingPdf ? 'Generating...' : 'Download Report'}</span>
                     </Button>
                )}
            </div>

            {descendantReportData && (
                <div ref={descendantReportRef} className="animate-fadeIn">
                    <div className={`p-4 border rounded-lg mb-6 ${
                        descendantReportData.rootPerson.gender === Gender.Male ? 'bg-male dark:bg-male-dark' :
                        descendantReportData.rootPerson.gender === Gender.Female ? 'bg-female dark:bg-female-dark' :
                        'bg-gray-50 dark:bg-gray-800/50'
                    }`}>
                        <h4 className="text-lg font-semibold mb-2">Report for: {getFullName(descendantReportData.rootPerson)}</h4>
                        <div className="flex items-start space-x-4">
                            <div className="flex-shrink-0 w-24 h-32 rounded-md flex items-center justify-center bg-gray-200 dark:bg-gray-700 overflow-hidden">
                                {descendantReportData.rootPerson.photos?.[0] ? <img src={descendantReportData.rootPerson.photos[0]} alt={getFullName(descendantReportData.rootPerson)} className="w-full h-full object-cover" />
                                    : (
                                        <>
                                            {descendantReportData.rootPerson.gender === Gender.Male && <MaleSymbolIcon />}
                                            {descendantReportData.rootPerson.gender === Gender.Female && <FemaleSymbolIcon />}
                                            {descendantReportData.rootPerson.gender !== Gender.Male && descendantReportData.rootPerson.gender !== Gender.Female && <UserIcon />}
                                        </>
                                    )}
                            </div>
                            <div className="text-sm">
                                <p><strong>Born:</strong> {descendantReportData.rootPerson.birthDate || 'N/A'} {descendantReportData.rootPerson.birthPlace && `in ${descendantReportData.rootPerson.birthPlace}`}</p>
                                {descendantReportData.rootPerson.deathDate && <p><strong>Died:</strong> {descendantReportData.rootPerson.deathDate} {descendantReportData.rootPerson.deathPlace && `in ${descendantReportData.rootPerson.deathPlace}`}</p>}
                                <p className="mt-2">Total Descendants Found: {descendantReportData.descendants.length}</p>
                            </div>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                           <thead className="bg-gray-100 dark:bg-gray-800">
                                <tr>
                                    {['Name', 'Relationship', 'Birth Date', 'Death Date', 'Age'].map(header =>
                                        <th key={header} className="p-3 font-semibold text-gray-600 dark:text-gray-300 tracking-wider">{header}</th>
                                    )}
                                     <th className="p-3 font-semibold text-gray-600 dark:text-gray-300 tracking-wider no-print">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                                {descendantReportData.descendants.map(({person, relationship}) => {
                                    const genderClass = person.gender === Gender.Male ? 'bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100' : person.gender === Gender.Female ? 'bg-pink-50 dark:bg-pink-900/20 hover:bg-pink-100' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50';
                                    return (
                                    <tr key={person.id} className={genderClass}>
                                        <td className="p-3 font-medium">{getFullName(person)}</td>
                                        <td className="p-3">{relationship}</td>
                                        <td className="p-3">{person.birthDate || 'N/A'}</td>
                                        <td className="p-3">{person.deathDate || 'N/A'}</td>
                                        <td className="p-3">{calculateAge(person.birthDate, person.deathDate)}</td>
                                        <td className="p-3 no-print">
                                            <Button size="sm" variant="secondary" onClick={() => handleViewOnTree(person.id)}>View on Tree</Button>
                                        </td>
                                    </tr>
                                )})}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

const AncestorReportGenerator = () => {
    const { people, getPersonById } = useFamilyTreeContext();
    const [personId, setPersonId] = useState('');
    const [ancestorReportData, setAncestorReportData] = useState<{ rootPerson: Person, ancestors: { person: Person, relationship: string }[] } | null>(null);
    const ancestorReportRef = useRef<HTMLDivElement>(null);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

    const handleGenerateAncestorReport = useCallback(() => {
        if (!personId) return;
        const person = getPersonById(personId);
        if (person) {
            const ancestors = getAncestorsWithRelationship(person, people);
            setAncestorReportData({ rootPerson: person, ancestors });
        }
    }, [personId, getPersonById, people]);

    useEffect(() => {
        if (personId) {
            handleGenerateAncestorReport();
        } else {
            setAncestorReportData(null);
        }
    }, [personId, handleGenerateAncestorReport]);
    
     const handleDownloadAncestorReport = async () => {
        if (!ancestorReportRef.current || !ancestorReportData) return;
        
        setIsGeneratingPdf(true);
        const { rootPerson } = ancestorReportData;
        const fileName = `Ancestor_Report_for_${getFullName(rootPerson)}`;
        
        const printableElement = document.createElement('div');
        printableElement.style.position = 'absolute';
        printableElement.style.left = '-9999px';
        printableElement.style.width = '210mm';
        printableElement.style.padding = '20px';
        printableElement.style.backgroundColor = 'white';
        printableElement.style.color = 'black';
        printableElement.style.fontFamily = 'sans-serif';

        const reportTitle = `<h1 style="font-size: 28px; font-weight: bold; text-align: center; margin-bottom: 20px;">Ancestor Report</h1>`;
        printableElement.innerHTML = reportTitle;

        const contentClone = ancestorReportRef.current.cloneNode(true) as HTMLElement;
        printableElement.appendChild(contentClone);

        document.body.appendChild(printableElement);

        try {
            await generatePdf(printableElement, fileName, 'p');
        } catch (error) {
            console.error("Error generating ancestor report PDF:", error);
            alert("Sorry, an error occurred while generating the PDF report.");
        } finally {
            if (document.body.contains(printableElement)) {
                document.body.removeChild(printableElement);
            }
            setIsGeneratingPdf(false);
        }
    };

    return (
        <div className="report-container">
            <h3 className="text-xl font-semibold mb-4">Ancestor Report</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Select an individual to generate a list of all their known direct ancestors.
            </p>
            <div className="flex items-end space-x-2 mb-4 no-print">
                <div className="flex-grow max-w-sm">
                    <SearchableSelect
                        label="Select Person"
                        options={people}
                        value={personId}
                        onChange={setPersonId}
                        placeholder="Select a person"
                    />
                </div>
                {ancestorReportData && (
                     <Button onClick={handleDownloadAncestorReport} disabled={isGeneratingPdf}>
                         {isGeneratingPdf ? <SpinnerIcon /> : <PrintIcon />}
                         <span className="ml-2 hidden sm:inline">{isGeneratingPdf ? 'Generating...' : 'Download Report'}</span>
                     </Button>
                )}
            </div>

            {ancestorReportData && (
                 <div ref={ancestorReportRef} className="animate-fadeIn">
                    <div className={`p-4 border rounded-lg mb-6 ${
                        ancestorReportData.rootPerson.gender === Gender.Male ? 'bg-male dark:bg-male-dark' :
                        ancestorReportData.rootPerson.gender === Gender.Female ? 'bg-female dark:bg-female-dark' :
                        'bg-gray-50 dark:bg-gray-800/50'
                    }`}>
                        <h4 className="text-lg font-semibold mb-2">Report for: {getFullName(ancestorReportData.rootPerson)}</h4>
                         <div className="flex items-start space-x-4">
                            <div className="flex-shrink-0 w-24 h-32 rounded-md flex items-center justify-center bg-gray-200 dark:bg-gray-700 overflow-hidden">
                                {ancestorReportData.rootPerson.photos?.[0] ? <img src={ancestorReportData.rootPerson.photos[0]} alt={getFullName(ancestorReportData.rootPerson)} className="w-full h-full object-cover" />
                                    : (
                                        <>
                                            {ancestorReportData.rootPerson.gender === Gender.Male && <MaleSymbolIcon />}
                                            {ancestorReportData.rootPerson.gender === Gender.Female && <FemaleSymbolIcon />}
                                            {ancestorReportData.rootPerson.gender !== Gender.Male && ancestorReportData.rootPerson.gender !== Gender.Female && <UserIcon />}
                                        </>
                                    )}
                            </div>
                            <div className="text-sm">
                                <p><strong>Born:</strong> {ancestorReportData.rootPerson.birthDate || 'N/A'} {ancestorReportData.rootPerson.birthPlace && `in ${ancestorReportData.rootPerson.birthPlace}`}</p>
                                {ancestorReportData.rootPerson.deathDate && <p><strong>Died:</strong> {ancestorReportData.rootPerson.deathDate} {ancestorReportData.rootPerson.deathPlace && `in ${ancestorReportData.rootPerson.deathPlace}`}</p>}
                                <p className="mt-2">Total Ancestors Found: {ancestorReportData.ancestors.length}</p>
                            </div>
                        </div>
                    </div>
                    
                    <div className="overflow-x-auto">
                         <table className="w-full text-left text-sm">
                            <thead className="bg-gray-100 dark:bg-gray-800">
                                <tr>
                                    {['Name', 'Relationship', 'Birth Date', 'Death Date', 'Age'].map(header =>
                                        <th key={header} className="p-3 font-semibold text-gray-600 dark:text-gray-300 tracking-wider">{header}</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                                {ancestorReportData.ancestors.map(({ person, relationship }) => {
                                    const genderClass = person.gender === Gender.Male ? 'bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100' : person.gender === Gender.Female ? 'bg-pink-50 dark:bg-pink-900/20 hover:bg-pink-100' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50';
                                    return (
                                    <tr key={person.id} className={genderClass}>
                                        <td className="p-3 font-medium">{getFullName(person)}</td>
                                        <td className="p-3">{relationship}</td>
                                        <td className="p-3">{person.birthDate || 'N/A'}</td>
                                        <td className="p-3">{person.deathDate || 'N/A'}</td>
                                        <td className="p-3">{calculateAge(person.birthDate, person.deathDate)}</td>
                                    </tr>
                                )})}
                            </tbody>
                        </table>
                    </div>
                 </div>
            )}
        </div>
    );
};

interface LifeEvent {
    date: string;
    age: string;
    event: string;
    type: 'birth' | 'death' | 'marriage';
    details: string;
    relationship: string;
}

const EventReportGenerator = () => {
    const { people, getPersonById } = useFamilyTreeContext();
    const [selectedPersonId, setSelectedPersonId] = useState<string>('');
    const [reportPerson, setReportPerson] = useState<Person | null>(null);
    const eventReportRef = useRef<HTMLDivElement>(null);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

    useEffect(() => {
        if (selectedPersonId) {
            const person = people.find(p => p.id === selectedPersonId);
            setReportPerson(person || null);
        } else {
            setReportPerson(null);
        }
    }, [selectedPersonId, people]);

    const lifeEvents = useMemo<LifeEvent[]>(() => {
        if (!reportPerson?.birthDate) return [];

        const personStartDate = new Date(reportPerson.birthDate);
        const personEndDate = reportPerson.deathDate ? new Date(reportPerson.deathDate) : new Date();

        const isWithinLifespan = (eventDateStr: string | undefined): boolean => {
            if (!eventDateStr) return false;
            const eventDate = new Date(eventDateStr);
            return eventDate >= personStartDate && eventDate <= personEndDate;
        };

        const events: LifeEvent[] = [];

        // 1. Self events
        events.push({
            date: reportPerson.birthDate,
            age: '0 years, 0 months',
            event: 'Birth',
            type: 'birth',
            details: `Birth of Self${reportPerson.birthPlace ? ` in ${reportPerson.birthPlace}` : ''}`,
            relationship: 'Self'
        });
        reportPerson.marriages?.forEach(marriage => {
            if (isWithinLifespan(marriage.date)) {
                const spouse = getPersonById(marriage.spouseId);
                events.push({
                    date: marriage.date!,
                    age: calculateAge(reportPerson.birthDate, marriage.date),
                    event: 'Marriage',
                    type: 'marriage',
                    details: `Married ${spouse ? getFullName(spouse) : 'Unknown'}${marriage.place ? ` in ${marriage.place}` : ''}`,
                    relationship: 'Self'
                });
            }
        });
        if (reportPerson.deathDate && isWithinLifespan(reportPerson.deathDate)) {
            events.push({
                date: reportPerson.deathDate,
                age: calculateAge(reportPerson.birthDate, reportPerson.deathDate),
                event: 'Death',
                type: 'death',
                details: `Death of Self${reportPerson.deathPlace ? ` in ${reportPerson.deathPlace}` : ''}`,
                relationship: 'Self'
            });
        }

        // 2. Ancestor deaths
        const ancestors = getAncestorsHierarchically(reportPerson, people);
        ancestors.forEach(({ person: ancestor, level }) => {
            if (level > 2) return; // Only parents (1) and grandparents (2)
            if (isWithinLifespan(ancestor.deathDate)) {
                let relationship = level === 1 
                    ? (ancestor.gender === Gender.Male ? 'Father' : 'Mother') 
                    : (ancestor.gender === Gender.Male ? 'Grandfather' : 'Grandmother');
                events.push({
                    date: ancestor.deathDate!,
                    age: calculateAge(reportPerson.birthDate, ancestor.deathDate),
                    event: 'Death',
                    type: 'death',
                    details: `Death of ${getFullName(ancestor)}`,
                    relationship: relationship
                });
            }
        });

        // 3. Siblings events
        const siblings = getSiblingsWithRelationship(reportPerson, people);
        siblings.forEach(({ person: sibling, relationship }) => {
            if (isWithinLifespan(sibling.birthDate)) {
                events.push({ date: sibling.birthDate!, age: calculateAge(reportPerson.birthDate, sibling.birthDate), event: 'Birth', type: 'birth', details: `Birth of ${getFullName(sibling)}`, relationship });
            }
            sibling.marriages?.forEach(marriage => {
                if (isWithinLifespan(marriage.date)) {
                    const spouse = getPersonById(marriage.spouseId);
                    events.push({ date: marriage.date!, age: calculateAge(reportPerson.birthDate, marriage.date), event: 'Marriage', type: 'marriage', details: `Marriage of ${getFullName(sibling)} to ${spouse ? getFullName(spouse) : 'Unknown'}`, relationship });
                }
            });
            if (isWithinLifespan(sibling.deathDate)) {
                events.push({ date: sibling.deathDate!, age: calculateAge(reportPerson.birthDate, sibling.deathDate), event: 'Death', type: 'death', details: `Death of ${getFullName(sibling)}`, relationship });
            }
        });
        
        // 4. Descendants events
        const descendants = getDescendantsWithRelationship(reportPerson, people);
        descendants.forEach(({ person: descendant, relationship }) => {
            if (isWithinLifespan(descendant.birthDate)) {
                events.push({ date: descendant.birthDate!, age: calculateAge(reportPerson.birthDate, descendant.birthDate), event: 'Birth', type: 'birth', details: `Birth of ${getFullName(descendant)}`, relationship });
            }
            descendant.marriages?.forEach(marriage => {
                if (isWithinLifespan(marriage.date)) {
                    const spouse = getPersonById(marriage.spouseId);
                    events.push({ date: marriage.date!, age: calculateAge(reportPerson.birthDate, marriage.date), event: 'Marriage', type: 'marriage', details: `Marriage of ${getFullName(descendant)} to ${spouse ? getFullName(spouse) : 'Unknown'}`, relationship });
                }
            });
            if (isWithinLifespan(descendant.deathDate)) {
                events.push({ date: descendant.deathDate!, age: calculateAge(reportPerson.birthDate, descendant.deathDate), event: 'Death', type: 'death', details: `Death of ${getFullName(descendant)}`, relationship });
            }
        });

        // 5. Uncles/Aunts marriages
        const parents = (reportPerson.parentIds || []).map(id => getPersonById(id)).filter((p): p is Person => !!p);
        parents.forEach(parent => {
            const parentSiblings = getSiblingsWithRelationship(parent, people);
            parentSiblings.forEach(({person: uncleAunt}) => {
                const relationship = uncleAunt.gender === Gender.Male ? 'Uncle' : 'Aunt';
                 uncleAunt.marriages?.forEach(marriage => {
                    if (isWithinLifespan(marriage.date)) {
                        const spouse = getPersonById(marriage.spouseId);
                        events.push({
                            date: marriage.date!,
                            age: calculateAge(reportPerson.birthDate, marriage.date),
                            event: 'Marriage',
                            type: 'marriage',
                            details: `Marriage of ${getFullName(uncleAunt)} to ${spouse ? getFullName(spouse) : 'Unknown'}`,
                            relationship: relationship
                        });
                    }
                });
            });
        });

        return events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [reportPerson, people, getPersonById]);
    
    const handleDownloadEventReport = async () => {
        if (!reportPerson) return;
    
        setIsGeneratingPdf(true);
        const fileName = `Life_Events_for_${getFullName(reportPerson)}`;
        
        const doc = new jsPDF('p', 'mm', 'a4');
        const summaryCardEl = document.getElementById('summary-card');
        const pageHeight = doc.internal.pageSize.getHeight();
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 10;
        
        if (!summaryCardEl) {
            alert('Could not find summary card to print.');
            setIsGeneratingPdf(false);
            return;
        }

        try {
            // 1. Pre-render the summary card to an image
            const summaryCanvas = await html2canvas(summaryCardEl, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff',
                onclone: (clonedDoc) => {
                    clonedDoc.documentElement.classList.remove('dark');
                    const style = clonedDoc.createElement('style');
                    style.innerHTML = `
                        body, body * { 
                            color: #1f2937 !important; 
                            -webkit-print-color-adjust: exact !important;
                            print-color-adjust: exact !important;
                        }
                        #summary-card { font-size: 12pt !important; line-height: 1.5 !important; }
                        #summary-card h4 { font-size: 14pt !important; }
                        #summary-card .text-sm { font-size: 12pt !important; }
                        .bg-male { background-color: #eff6ff !important; }
                        .bg-female { background-color: #fce7f3 !important; }
                        .bg-gray-50 { background-color: #f9fafb !important; }
                        * { box-shadow: none !important; animation: none !important; transition: none !important; }
                    `;
                    clonedDoc.head.appendChild(style);
                }
            });
            const summaryImgData = summaryCanvas.toDataURL('image/jpeg', 1.0);
            const summaryImgProps = doc.getImageProperties(summaryImgData);
            const summaryImgWidth = pageWidth - margin * 2;
            const summaryImgHeight = (summaryImgProps.height * summaryImgWidth) / summaryImgProps.width;

            // 2. Prepare table data
            const tableColumns = ['Age', 'Date', 'Event', 'Details', 'Relationship'];
            const tableRows = lifeEvents.map(event => [event.age, event.date, event.event, event.details, event.relationship]);
            const headerHeight = 15 + summaryImgHeight + 5; // Title + summary + space

            // 3. Use autoTable with hooks for row styling
            autoTable(doc, {
                head: [tableColumns],
                body: tableRows,
                startY: headerHeight,
                theme: 'grid',
                headStyles: { fillColor: [59, 130, 246] }, // Tailwind blue-600
                didDrawPage: (data) => {
                    // Add header to every page
                    doc.setFontSize(18);
                    doc.setFont('helvetica', 'bold');
                    doc.text('Timeline of Life Events', margin, 15);
                    doc.addImage(summaryImgData, 'JPEG', margin, 20, summaryImgWidth, summaryImgHeight);
                },
                didParseCell: (data) => {
                    const event = lifeEvents[data.row.index];
                    if (event) {
                        const eventColor = {
                            birth: [209, 250, 229], // bg-green-100
                            death: [254, 226, 226], // bg-red-100
                            marriage: [254, 249, 195], // bg-yellow-100
                        }[event.type];
                        if (eventColor) {
                            data.cell.styles.fillColor = eventColor as [number, number, number];
                        }
                    }
                },
                margin: { top: 20 + summaryImgHeight + 5 } // Top margin for pages after the first
            });

            // 4. Add footer to all pages
            const pageCount = (doc as any).internal.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                doc.setFontSize(8);
                doc.setTextColor(150);
                const dateTime = new Date().toLocaleString();
                doc.text(dateTime, margin, pageHeight - margin + 5);
                const pageNumText = `Page ${i} of ${pageCount}`;
                const textWidth = doc.getStringUnitWidth(pageNumText) * doc.getFontSize() / doc.internal.scaleFactor;
                doc.text(pageNumText, pageWidth - margin - textWidth, pageHeight - margin + 5);
            }
    
            doc.save(`${fileName.replace(/\s/g, '_')}.pdf`);

        } catch (error) {
            console.error("Error generating event report PDF:", error);
            alert("Sorry, an error occurred while generating the PDF report.");
        } finally {
            setIsGeneratingPdf(false);
        }
    };

    return (
        <div className="report-container">
            <h3 className="text-xl font-semibold mb-4">Timeline of Life Events</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Select a person to see a detailed timeline of significant events within their lifespan.
            </p>
            <div className="flex items-end space-x-2 mb-4 no-print">
                <div className="flex-grow max-w-sm">
                    <SearchableSelect
                        label="Select Person"
                        options={people}
                        value={selectedPersonId}
                        onChange={setSelectedPersonId}
                        placeholder="Select a person"
                    />
                </div>
                {reportPerson && (
                    <Button onClick={handleDownloadEventReport} disabled={isGeneratingPdf}>
                        {isGeneratingPdf ? <SpinnerIcon /> : <PrintIcon />}
                        <span className="ml-2 hidden sm:inline">{isGeneratingPdf ? 'Generating...' : 'Download Report'}</span>
                    </Button>
                )}
            </div>

            {reportPerson ? (
                <div ref={eventReportRef}>
                    <div className={`p-4 border rounded-lg mb-6 ${
                        reportPerson.gender === Gender.Male ? 'bg-male dark:bg-male-dark' :
                        reportPerson.gender === Gender.Female ? 'bg-female dark:bg-female-dark' :
                        'bg-gray-50 dark:bg-gray-800/50'
                    }`} id="summary-card">
                        <div className="flex items-start space-x-4">
                            <div className="flex-shrink-0 w-24 h-32 rounded-md flex items-center justify-center bg-gray-200 dark:bg-gray-700 overflow-hidden">
                                {reportPerson.photos?.[0] ? <img src={reportPerson.photos[0]} alt={getFullName(reportPerson)} className="w-full h-full object-cover" />
                                    : (
                                        <>
                                            {reportPerson.gender === Gender.Male && <MaleSymbolIcon />}
                                            {reportPerson.gender === Gender.Female && <FemaleSymbolIcon />}
                                            {reportPerson.gender !== Gender.Male && reportPerson.gender !== Gender.Female && <UserIcon />}
                                        </>
                                    )}
                            </div>
                            <div className="text-sm">
                                <h4 className="text-lg font-semibold mb-2">{getFullName(reportPerson)}</h4>
                                <p><strong>Born:</strong> {reportPerson.birthDate || 'N/A'}{reportPerson.birthPlace ? ` in ${reportPerson.birthPlace}` : ''}</p>
                                {reportPerson.deathDate && <p><strong>Died:</strong> {reportPerson.deathDate}{reportPerson.deathPlace ? ` in ${reportPerson.deathPlace}` : ''}</p>}
                            </div>
                        </div>
                    </div>
                    {lifeEvents.length > 0 ? (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-gray-100 dark:bg-gray-800">
                                    <tr>
                                        {['Age', 'Date', 'Event', 'Details', 'Relationship'].map(header =>
                                            <th key={header} className="p-3 font-semibold text-gray-600 dark:text-gray-300 tracking-wider">{header}</th>
                                        )}
                                    </tr>
                                </thead>
                                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                                    {lifeEvents.map((event, index) => {
                                        const eventColorClass = {
                                            birth: 'bg-green-100 dark:bg-green-900/50',
                                            death: 'bg-red-100 dark:bg-red-900/50',
                                            marriage: 'bg-yellow-100 dark:bg-yellow-900/50',
                                        }[event.type];
                                        return (
                                        <tr key={index} className={eventColorClass}>
                                            <td className="p-3">{event.age}</td>
                                            <td className="p-3">{event.date}</td>
                                            <td className="p-3 font-semibold">{event.event}</td>
                                            <td className="p-3">{event.details}</td>
                                            <td className="p-3">{event.relationship}</td>
                                        </tr>
                                    )})}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p className="text-gray-500 mt-4">No significant life events found for {getFullName(reportPerson)} within their lifespan.</p>
                    )}
                </div>
            ) : (
                <p className="text-gray-500">Please select a person and click 'Generate' to view their life event timeline.</p>
            )}
        </div>
    );
};

const DeathReportGenerator = () => {
    const { people } = useFamilyTreeContext();
    const [page, setPage] = useState(0);
    const peoplePerPage = 10;
    const deathReportRef = useRef<HTMLDivElement>(null);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

    const deceasedPeople = useMemo(() => {
        return people
            .filter(p => p.deathDate)
            .sort((a, b) => new Date(a.deathDate!).getTime() - new Date(b.deathDate!).getTime());
    }, [people]);

    const paginatedPeople = deceasedPeople.slice(page * peoplePerPage, (page + 1) * peoplePerPage);
    const totalPages = Math.ceil(deceasedPeople.length / peoplePerPage);

    const handleDownloadDeathReport = async () => {
        if (!deathReportRef.current) return;
    
        setIsGeneratingPdf(true);
        
        const fileName = 'Death_Report';
        
        const printableElement = document.createElement('div');
        printableElement.style.position = 'absolute';
        printableElement.style.left = '-9999px';
        printableElement.style.width = '210mm';
        printableElement.style.padding = '20px';
        printableElement.style.backgroundColor = 'white';
        printableElement.style.color = 'black';
        printableElement.style.fontFamily = 'sans-serif';
    
        const reportTitle = `<h1 style="font-size: 28px; font-weight: bold; text-align: center; margin-bottom: 20px;">Death Report</h1>`;
        printableElement.innerHTML = reportTitle;
    
        // We need to print all pages, not just the visible one.
        // We'll create a new table with all the data.
        const originalTable = deathReportRef.current.querySelector('table');
        const allDataTable = document.createElement('table');
        allDataTable.className = originalTable ? originalTable.className : 'w-full text-left text-sm';
        
        const thead = originalTable?.querySelector('thead')?.cloneNode(true);
        if(thead) allDataTable.appendChild(thead);
        
        const tbody = document.createElement('tbody');
        const originalTbody = originalTable?.querySelector('tbody');
        tbody.className = originalTbody ? originalTbody.className : 'bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700';
        
        deceasedPeople.forEach(person => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="p-3 font-medium">${getFullName(person)}</td>
                <td class="p-3">${person.birthDate || 'N/A'}</td>
                <td class="p-3">${person.deathDate || 'N/A'}</td>
                <td class="p-3">${calculateAge(person.birthDate, person.deathDate)}</td>
                <td class="p-3">${person.deathPlace || 'N/A'}</td>
                <td class="p-3">${person.causeOfDeath || 'N/A'}</td>
            `;
            tbody.appendChild(tr);
        });
        allDataTable.appendChild(tbody);
        
        printableElement.appendChild(allDataTable);
        
        document.body.appendChild(printableElement);
    
        try {
            await generatePdf(printableElement, fileName);
        } catch (error) {
            console.error("Error generating death report PDF:", error);
            alert("Sorry, an error occurred while generating the PDF report.");
        } finally {
            if (document.body.contains(printableElement)) {
                document.body.removeChild(printableElement);
            }
            setIsGeneratingPdf(false);
        }
    };
    
    return (
        <div className="report-container">
            <div className="flex justify-between items-start">
                <div>
                    <h3 className="text-xl font-semibold mb-2">Death Report</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                        A list of all deceased individuals recorded in this family tree.
                    </p>
                </div>
                {deceasedPeople.length > 0 && (
                     <Button onClick={handleDownloadDeathReport} disabled={isGeneratingPdf}>
                         {isGeneratingPdf ? <SpinnerIcon /> : <PrintIcon />}
                         <span className="ml-2 hidden sm:inline">{isGeneratingPdf ? 'Generating...' : 'Download Report'}</span>
                     </Button>
                )}
            </div>
            {deceasedPeople.length > 0 ? (
                <div ref={deathReportRef}>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-100 dark:bg-gray-800">
                                <tr>
                                    {['Name', 'Birth Date', 'Death Date', 'Age at Death', 'Place of Death', 'Cause of Death'].map(header =>
                                        <th key={header} className="p-3 font-semibold text-gray-600 dark:text-gray-300 tracking-wider">{header}</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                                {paginatedPeople.map(person => {
                                    const genderClass = person.gender === Gender.Male ? 'bg-male dark:bg-male-dark' : person.gender === Gender.Female ? 'bg-female dark:bg-female-dark' : '';
                                    return (
                                    <tr key={person.id} className={genderClass}>
                                        <td className="p-3 font-medium">{getFullName(person)}</td>
                                        <td className="p-3">{person.birthDate || 'N/A'}</td>
                                        <td className="p-3">{person.deathDate || 'N/A'}</td>
                                        <td className="p-3">{calculateAge(person.birthDate, person.deathDate)}</td>
                                        <td className="p-3">{person.deathPlace || 'N/A'}</td>
                                        <td className="p-3">{person.causeOfDeath || 'N/A'}</td>
                                    </tr>
                                )})}
                            </tbody>
                        </table>
                    </div>
                    {totalPages > 1 && (
                        <div className="flex justify-between items-center mt-4 text-sm no-print">
                            <Button onClick={() => setPage(p => p - 1)} disabled={page === 0}>Previous</Button>
                            <span>Page {page + 1} of {totalPages}</span>
                            <Button onClick={() => setPage(p => p + 1)} disabled={page === totalPages - 1}>Next</Button>
                        </div>
                    )}
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center p-8 bg-gray-50 dark:bg-gray-800/50 rounded-lg text-center">
                    <GraveIcon />
                    <p className="mt-2 text-gray-500">No deaths have been recorded in this family tree.</p>
                </div>
            )}
        </div>
    );
};


export const ReportsView = () => {
    const { people } = useFamilyTreeContext();
    const [activeTab, setActiveTab] = useState('stats');
    const tabs = [
        { id: 'stats', name: 'Statistics' },
        { id: 'life-story', name: 'Life Story AI' },
        { id: 'relationship', name: 'Relationship Finder' },
        { id: 'descendants', name: 'Descendants' },
        { id: 'ancestors', name: 'Ancestors' },
        { id: 'events', name: 'Life Events' },
        { id: 'deaths', name: 'Deaths' },
    ];
    
    return (
        <div className="bg-white dark:bg-gray-900 shadow-lg rounded-xl h-full flex flex-col">
            <div className="p-6 pb-0">
                <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Reports & Statistics</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Analyze and explore your family data through various reports.</p>
                <div className="mt-4 border-b border-gray-200 dark:border-gray-700">
                    <nav className="-mb-px flex space-x-6 overflow-x-auto" aria-label="Tabs">
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`${
                                    activeTab === tab.id
                                        ? 'border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-300'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:border-gray-600'
                                } whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm`}
                            >
                                {tab.name}
                            </button>
                        ))}
                    </nav>
                </div>
            </div>
            <div className="flex-grow p-6 overflow-auto">
                {people.length === 0 && activeTab !== 'stats' ? (
                     <div className="text-center p-8 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <h3 className="text-xl font-semibold">Your Family Tree is Empty</h3>
                        <p className="mt-2 text-gray-600 dark:text-gray-400">
                            Add individuals to your tree to generate reports.
                        </p>
                    </div>
                ) : (
                    <>
                        {activeTab === 'stats' && <StatsAndChartsGenerator />}
                        {activeTab === 'life-story' && <LifeStoryGenerator />}
                        {activeTab === 'relationship' && <RelationshipFinder />}
                        {activeTab === 'descendants' && <DescendantReportGenerator />}
                        {activeTab === 'ancestors' && <AncestorReportGenerator />}
                        {activeTab === 'events' && <EventReportGenerator />}
                        {activeTab === 'deaths' && <DeathReportGenerator />}
                    </>
                )}
            </div>
        </div>
    );
};
