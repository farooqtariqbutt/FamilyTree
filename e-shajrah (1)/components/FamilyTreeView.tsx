
import React, { useMemo, useState, useRef, useEffect } from 'react';
import type { Person } from '../types.ts';
import { Gender } from '../types.ts';
import { useFamilyTreeContext } from '../hooks/useFamilyTree.ts';
import { MaleSymbolIcon, FemaleSymbolIcon, UserIcon, PlusIcon, MinusIcon, PrintIcon, SpinnerIcon, ArrowUpIcon, ArrowDownIcon, ChevronLeftIcon, ChevronRightIcon, PencilIcon } from './ui/Icons.tsx';
import Button from './ui/Button.tsx';
import Tooltip from './ui/Tooltip.tsx';
import { generatePdf } from '../utils/pdfUtils.ts';
import SearchableSelect from './ui/SearchableSelect.tsx';
import { getFullName } from '../utils/personUtils.ts';

// Helper function to get siblings
const getSiblings = (person: Person, allPeople: Person[]): Person[] => {
    if (!person.parentIds || person.parentIds.length === 0) {
        return [];
    }
    const parentIdSet = new Set(person.parentIds.filter(id => id));
    if (parentIdSet.size === 0) return [];

    return allPeople.filter(p => {
        if (p.id === person.id) return false;
        if (!p.parentIds) return false;
        return p.parentIds.some(pid => parentIdSet.has(pid));
    }).sort((a, b) => {
        const dateA = a.birthDate ? new Date(a.birthDate).getTime() : Infinity;
        const dateB = b.birthDate ? new Date(b.birthDate).getTime() : Infinity;
        if (dateA === Infinity && dateB === Infinity) return 0;
        return dateA - dateB;
    });
};

const NodeCard: React.FC<{
  person: Person;
  isSpouse?: boolean;
  onEdit: (p: Person) => void;
  onToggleAncestors: (p: Person) => void;
  onNavigateToFamily: (p: Person) => void;
  onToggleChildren: () => void;
  onToggleSiblings: (p: Person) => void;
  childrenVisible: boolean;
  siblingsVisible: boolean;
  ancestorsVisible: boolean;
  hasChildrenToShow: boolean;
  isChildCard?: boolean;
  isSiblingCard?: boolean;
  isFocalChild?: boolean;
}> = ({ person, isSpouse = false, onEdit, onToggleAncestors, onNavigateToFamily, onToggleChildren, onToggleSiblings, childrenVisible, siblingsVisible, ancestorsVisible, hasChildrenToShow, isChildCard = false, isSiblingCard = false, isFocalChild = false }) => {
    const genderClass = person.gender === Gender.Male
        ? 'border-male-border bg-male dark:bg-male-dark'
        : person.gender === Gender.Female
        ? 'border-female-border bg-female dark:bg-female-dark'
        : 'border-gray-500';

    const hasParents = person.parentIds?.some(id => !!id);
    const { people } = useFamilyTreeContext();
    const hasSiblings = getSiblings(person, people).length > 0;

    const buttonBaseClass = "bg-gray-100 dark:bg-gray-700 rounded-full p-1 shadow-lg hover:bg-gray-200 dark:hover:bg-gray-600 hover:scale-110 transition-transform";

    return (
        <div id={`person-card-${person.id}`} className="relative mt-2 mx-2">
            <div
                className={`p-3 rounded-lg shadow-md border-2 ${genderClass} w-64 flex-shrink-0 flex space-x-3 items-center`}
            >
                <div className="flex-shrink-0 w-20 h-24 rounded-md flex items-center justify-center bg-gray-200 dark:bg-gray-700 overflow-hidden">
                    {person.photos?.[0] ? <img src={person.photos[0]} alt={`${person.firstName}`} className="w-full h-full object-cover" />
                        : (
                            <>
                                {person.gender === Gender.Male && <MaleSymbolIcon />}
                                {person.gender === Gender.Female && <FemaleSymbolIcon />}
                                {person.gender !== Gender.Male && person.gender !== Gender.Female && <UserIcon />}
                            </>
                        )}
                </div>
                <div className="flex-grow text-left text-xs overflow-hidden">
                    <h3 className="font-bold text-sm truncate leading-tight">{getFullName(person)}</h3>
                    <div className="mt-1 space-y-1 text-gray-700 dark:text-gray-300">
                        <div><span className="font-semibold">Born:</span> {person.birthDate || 'Unknown'}</div>
                        {person.deathDate && <div><span className="font-semibold">Died:</span> {person.deathDate}</div>}
                    </div>
                </div>
            </div>

            <div className="absolute -top-2 -right-2 z-20">
                <Tooltip text="Edit Person">
                    <button onClick={() => onEdit(person)} className={buttonBaseClass}>
                        <PencilIcon />
                    </button>
                </Tooltip>
            </div>
            {hasParents && !isSpouse && !isChildCard && !isSiblingCard && (
                 <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                     <Tooltip text={ancestorsVisible ? "Hide Ancestors" : "Show Ancestors"}>
                        <button onClick={() => onToggleAncestors(person)} className={buttonBaseClass}>
                            {ancestorsVisible ? <MinusIcon /> : <ArrowUpIcon />}
                        </button>
                     </Tooltip>
                 </div>
            )}
            {isFocalChild && (
                 <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                     <Tooltip text="Hide Ancestors">
                        <button onClick={() => onToggleAncestors(person)} className={buttonBaseClass}>
                            <MinusIcon />
                        </button>
                     </Tooltip>
                 </div>
            )}
            {hasChildrenToShow && !isSpouse && (
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 z-10">
                    <Tooltip text={childrenVisible ? "Hide Children" : "Show Children"}>
                        <button onClick={onToggleChildren} className={buttonBaseClass}>
                            {childrenVisible ? <MinusIcon /> : <ArrowDownIcon />}
                        </button>
                    </Tooltip>
                </div>
            )}
            {hasSiblings && !isSpouse && !isChildCard && !isSiblingCard && (
                 <div className="absolute top-1/2 left-0 -translate-y-1/2 -translate-x-1/2 z-10">
                     <Tooltip text={siblingsVisible ? "Hide Siblings" : "Show Siblings"}>
                        <button onClick={() => onToggleSiblings(person)} className={buttonBaseClass}>
                            {siblingsVisible ? <MinusIcon /> : <ChevronLeftIcon />}
                        </button>
                     </Tooltip>
                 </div>
            )}
            {isSpouse && (
                 <div className="absolute top-1/2 right-0 -translate-y-1/2 translate-x-1/2 z-10">
                     <Tooltip text="Focus on This Person's Family">
                        <button onClick={() => onNavigateToFamily(person)} className={buttonBaseClass}>
                            <ChevronRightIcon />
                        </button>
                     </Tooltip>
                 </div>
            )}
        </div>
    );
};

interface FamilyNodeProps {
    personId: string;
    onEdit: (p: Person) => void;
    onToggleAncestors: (p: Person) => void;
    onNavigateToFamily: (p: Person) => void;
    onToggleChildren: (p: Person) => void;
    onSwitchSpouse: (personId: string, direction: 'next' | 'prev') => void;
    onToggleSiblings: (p: Person) => void;
    processedIds: Set<string>;
    allPeople: Person[];
    siblingsVisibleFor: string | null;
    childrenVisibleFor: Set<string>;
    ancestorsVisibleFor: Set<string>;
    activeSpouseIndices: Map<string, number>;
    isChildCard?: boolean;
    isFocalChildNode?: boolean;
}

const FamilyNode: React.FC<FamilyNodeProps> = ({
    personId, onEdit, onToggleAncestors, onNavigateToFamily, onToggleChildren, onSwitchSpouse, onToggleSiblings,
    processedIds, allPeople, siblingsVisibleFor, childrenVisibleFor, ancestorsVisibleFor, activeSpouseIndices, isChildCard = false, isFocalChildNode = false
}) => {
    const { getPersonById } = useFamilyTreeContext();
    const person = getPersonById(personId);

    if (!person || processedIds.has(personId)) return null;

    const primaryPerson = person;
    const activeSpouseIndex = activeSpouseIndices.get(primaryPerson.id) || 0;
    const currentMarriage = primaryPerson.marriages?.[activeSpouseIndex];
    const spouse = currentMarriage ? getPersonById(currentMarriage.spouseId) : undefined;
    
    const shouldShowSiblings = siblingsVisibleFor === person.id;
    const siblings = shouldShowSiblings ? getSiblings(person, allPeople) : [];

    const displayableChildren = (primaryPerson.childrenIds || [])
        ?.map(id => getPersonById(id))
        .filter((c): c is Person => !!c)
        .filter(child => {
            const childParents = new Set(child.parentIds || []);
            if (!childParents.has(primaryPerson.id)) {
                return false;
            }
            if (spouse) {
                return childParents.has(spouse.id);
            }
            const otherParentId = child.parentIds?.find(pId => pId !== primaryPerson.id);
            if(otherParentId) {
                const otherParent = getPersonById(otherParentId);
                if (otherParent && primaryPerson.marriages?.some(m => m.spouseId === otherParentId)) {
                    return false;
                }
            }
            return true;
        })
        .sort((a, b) => (a.birthDate || '').localeCompare(b.birthDate || '')) || [];
    
    const hasChildrenToShow = displayableChildren.length > 0;
    const areChildrenExplicitlyToggled = childrenVisibleFor.has(primaryPerson.id);
    
    // Check if we navigated up from one of the children.
    const navigatedUpFromChild = displayableChildren.find(child => ancestorsVisibleFor.has(child.id));

    // Decide which children to render. If explicitly toggled, show all.
    // Otherwise, if we came up from a child, show only that child to maintain the ancestry line.
    const childrenToRender = areChildrenExplicitlyToggled
        ? displayableChildren
        : (navigatedUpFromChild ? [navigatedUpFromChild] : []);

    const areAncestorsVisible = ancestorsVisibleFor.has(person.id);
    const parentId = person.parentIds?.find(id => !!id);
    const parent = parentId ? getPersonById(parentId) : undefined;

    // Accumulate processed IDs to prevent recursion loops.
    const newProcessedIds = new Set(processedIds);
    newProcessedIds.add(primaryPerson.id);
    if (spouse) {
        newProcessedIds.add(spouse.id);
    }

    const coupleWrapperClasses = spouse ? "p-4 border-2 border-dashed border-gray-400 dark:border-gray-600 rounded-xl" : "";

    return (
        <div className="flex flex-col items-center">
            {/* Ancestor branch */}
            {areAncestorsVisible && parent && (
                <div className="flex flex-col items-center">
                    <FamilyNode
                        personId={parent.id}
                        allPeople={allPeople}
                        onEdit={onEdit}
                        onToggleAncestors={onToggleAncestors}
                        onNavigateToFamily={onNavigateToFamily}
                        onToggleChildren={onToggleChildren}
                        onSwitchSpouse={onSwitchSpouse}
                        onToggleSiblings={onToggleSiblings}
                        processedIds={newProcessedIds}
                        siblingsVisibleFor={siblingsVisibleFor}
                        childrenVisibleFor={childrenVisibleFor}
                        ancestorsVisibleFor={ancestorsVisibleFor}
                        activeSpouseIndices={activeSpouseIndices}
                        isChildCard={false}
                    />
                    <div className="h-10 w-px bg-gray-400 dark:bg-gray-600"></div>
                </div>
            )}

            <div className="flex items-start">
                 {/* Siblings group */}
                {shouldShowSiblings && siblings.length > 0 && (
                     <div className="flex items-center pr-4">
                        <div className="flex flex-row-reverse space-x-4 space-x-reverse p-4 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl">
                            {siblings.map(sib => (
                                <NodeCard
                                    key={sib.id}
                                    person={sib}
                                    onEdit={onEdit}
                                    onToggleAncestors={onToggleAncestors}
                                    onNavigateToFamily={onNavigateToFamily}
                                    onToggleChildren={() => onToggleChildren(sib)}
                                    onToggleSiblings={onToggleSiblings}
                                    childrenVisible={childrenVisibleFor.has(sib.id)}
                                    siblingsVisible={siblingsVisibleFor === sib.id}
                                    ancestorsVisible={ancestorsVisibleFor.has(sib.id)}
                                    hasChildrenToShow={!!sib.childrenIds?.length}
                                    isChildCard={isChildCard}
                                    isSiblingCard={true}
                                />
                            ))}
                        </div>
                         <div className="w-8 h-px bg-gray-400 dark:bg-gray-600"></div>
                     </div>
                )}

                <div className="flex flex-col items-center">
                    <div className={coupleWrapperClasses}>
                        <div className="flex items-center justify-center">
                            <NodeCard
                                person={primaryPerson}
                                onEdit={onEdit}
                                onToggleAncestors={onToggleAncestors}
                                onNavigateToFamily={onNavigateToFamily}
                                onToggleChildren={() => onToggleChildren(primaryPerson)}
                                onToggleSiblings={onToggleSiblings}
                                childrenVisible={areChildrenExplicitlyToggled}
                                siblingsVisible={shouldShowSiblings}
                                ancestorsVisible={areAncestorsVisible}
                                hasChildrenToShow={hasChildrenToShow}
                                isChildCard={isChildCard}
                                isFocalChild={isFocalChildNode}
                            />
                            {spouse && (
                                <>
                                    <div className="flex items-center justify-center flex-col w-28 text-center px-2">
                                        <div className="text-xs text-gray-500 dark:text-gray-400">
                                            <div>{currentMarriage?.status || 'Married'}</div>
                                            <div>{currentMarriage?.date || ''}</div>
                                        </div>
                                        {primaryPerson.marriages && primaryPerson.marriages.length > 1 && (
                                            <div className="flex items-center space-x-2 mt-1">
                                                <Tooltip text="Previous Spouse">
                                                    <button onClick={() => onSwitchSpouse(primaryPerson.id, 'prev')} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"><ChevronLeftIcon /></button>
                                                </Tooltip>
                                                <span className="text-xs font-mono">
                                                    {activeSpouseIndex + 1}/{primaryPerson.marriages.length}
                                                </span>
                                                <Tooltip text="Next Spouse">
                                                    <button onClick={() => onSwitchSpouse(primaryPerson.id, 'next')} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"><ChevronRightIcon /></button>
                                                </Tooltip>
                                            </div>
                                        )}
                                    </div>
                                    <NodeCard
                                        person={spouse}
                                        isSpouse={true}
                                        onEdit={onEdit}
                                        onToggleAncestors={onToggleAncestors}
                                        onNavigateToFamily={onNavigateToFamily}
                                        onToggleChildren={() => onToggleChildren(spouse)}
                                        onToggleSiblings={onToggleSiblings}
                                        childrenVisible={childrenVisibleFor.has(spouse.id)}
                                        siblingsVisible={siblingsVisibleFor === spouse.id}
                                        ancestorsVisible={ancestorsVisibleFor.has(spouse.id)}
                                        hasChildrenToShow={false}
                                        isChildCard={isChildCard}
                                    />
                                </>
                            )}
                        </div>
                    </div>
                    {/* Children Row with connecting lines */}
                    {childrenToRender.length > 0 && (
                        <div className="pt-10 relative">
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 h-5 w-px bg-gray-400 dark:bg-gray-600"></div>
                            
                            <div className="flex justify-center">
                                <div className="flex flex-row items-start">
                                    {childrenToRender.map((child, index) => (
                                        <div key={child.id} className="relative flex flex-col items-center px-4">
                                            <div className="absolute bottom-full left-0 right-0 h-10">
                                                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-5 w-px bg-gray-400 dark:bg-gray-600"></div>
                                                 {childrenToRender.length > 1 && (
                                                    <div className={`absolute bottom-5 h-px bg-gray-400 dark:bg-gray-600 ${
                                                        index === 0 ? 'left-1/2 w-1/2' : index === childrenToRender.length - 1 ? 'right-1/2 w-1/2' : 'w-full'
                                                    }`}></div>
                                                )}
                                            </div>
                                            <FamilyNode
                                                personId={child.id}
                                                allPeople={allPeople}
                                                onEdit={onEdit}
                                                onToggleAncestors={onToggleAncestors}
                                                onNavigateToFamily={onNavigateToFamily}
                                                onToggleChildren={onToggleChildren}
                                                onSwitchSpouse={onSwitchSpouse}
                                                onToggleSiblings={onToggleSiblings}
                                                processedIds={newProcessedIds}
                                                siblingsVisibleFor={siblingsVisibleFor}
                                                childrenVisibleFor={childrenVisibleFor}
                                                ancestorsVisibleFor={ancestorsVisibleFor}
                                                activeSpouseIndices={activeSpouseIndices}
                                                isChildCard={true}
                                                isFocalChildNode={navigatedUpFromChild?.id === child.id}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export const FamilyTreeView: React.FC<{ openPersonForm: (p: Person) => void; }> = ({ openPersonForm }) => {
    const { people, getPersonById, treeViewConfig, configureTreeView } = useFamilyTreeContext();
    const treeContainerRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [zoom, setZoom] = useState(1);

    const [focusedPersonId, setFocusedPersonId] = useState<string | null>(null);
    const [childrenVisibleFor, setChildrenVisibleFor] = useState<Set<string>>(new Set());
    const [siblingsVisibleFor, setSiblingsVisibleFor] = useState<string | null>(null);
    const [ancestorsVisibleFor, setAncestorsVisibleFor] = useState<Set<string>>(new Set());
    const [activeSpouseIndices, setActiveSpouseIndices] = useState<Map<string, number>>(new Map());

    const renderRootId = useMemo(() => {
        if (!focusedPersonId) return null;
        const focusedPerson = getPersonById(focusedPersonId);
        if (!focusedPerson) return null;

        let renderRootPerson = focusedPerson;

        const isAncestorPathVisible = ancestorsVisibleFor.has(focusedPerson.id);
        if (isAncestorPathVisible && focusedPerson.parentIds) {
            const parent = focusedPerson.parentIds.map(id => getPersonById(id)).find(p => p);
            if (parent && childrenVisibleFor.has(parent.id)) {
                renderRootPerson = parent;
            }
        }
        
        let finalRoot = renderRootPerson;
        let current = renderRootPerson;
        while(ancestorsVisibleFor.has(current.id) && current.parentIds) {
            const parent = current.parentIds.map(id => getPersonById(id)).find(p => p);
            if (parent) {
                finalRoot = parent;
                current = parent;
            } else {
                break;
            }
        }
        return finalRoot.id;
    }, [focusedPersonId, getPersonById, ancestorsVisibleFor, childrenVisibleFor]);
    
    const scrollToCard = (personId: string) => {
        setTimeout(() => {
            const cardElement = document.getElementById(`person-card-${personId}`);
            cardElement?.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
                inline: 'center',
            });
        }, 100);
    };

    useEffect(() => {
        if (treeViewConfig) {
            // Set the root and clear all other visibility states
            handleRootPersonChange(treeViewConfig.rootId);
            // Now, set the children visibility based on the provided path
            setChildrenVisibleFor(new Set(treeViewConfig.visiblePath));
            
            // Wait for DOM to update then scroll
            setTimeout(() => {
                scrollToCard(treeViewConfig.rootId);
            }, 100);

            // Reset the config so it doesn't trigger again on re-renders
            configureTreeView(null);
        }
    }, [treeViewConfig, configureTreeView]);


    useEffect(() => {
        if (renderRootId) {
            scrollToCard(renderRootId);
        }
    }, [renderRootId]);

    const handleRootPersonChange = (personId: string) => {
        setFocusedPersonId(personId);
        setChildrenVisibleFor(new Set());
        setSiblingsVisibleFor(null);
        setAncestorsVisibleFor(new Set());
    };

    const handleEdit = (person: Person) => openPersonForm(person);

    const handleToggleAncestors = (person: Person) => {
        setAncestorsVisibleFor(prev => {
            const newSet = new Set(prev);
            if (newSet.has(person.id)) {
                newSet.delete(person.id);
            } else {
                if (siblingsVisibleFor === person.id) {
                    setSiblingsVisibleFor(null);
                }
                newSet.add(person.id);
            }
            return newSet;
        });
        scrollToCard(person.id);
    };

    const handleToggleChildren = (person: Person) => {
        const isOpeningChildren = !childrenVisibleFor.has(person.id);

        if (isOpeningChildren && siblingsVisibleFor) {
            const personWithVisibleSiblings = getPersonById(siblingsVisibleFor);
            if (personWithVisibleSiblings?.parentIds?.includes(person.id)) {
                setSiblingsVisibleFor(null);
            }
        }

        setChildrenVisibleFor(prev => {
            const newSet = new Set(prev);
            if (newSet.has(person.id)) {
                newSet.delete(person.id);
            } else {
                newSet.add(person.id);
            }
            return newSet;
        });
        scrollToCard(person.id);
    };

    const handleNavigateToFamily = (person: Person) => {
        handleRootPersonChange(person.id);
    };
    
    const handleToggleSiblings = (person: Person) => {
        setSiblingsVisibleFor(prev => (prev === person.id ? null : person.id));
        scrollToCard(person.id);
    };

    const handleSwitchSpouse = (personId: string, direction: 'next' | 'prev') => {
        const person = getPersonById(personId);
        if (!person || !person.marriages || person.marriages.length <= 1) return;

        setActiveSpouseIndices(prev => {
            const newMap = new Map(prev);
            const currentIndex = newMap.get(personId) || 0;
            const numSpouses = person.marriages!.length;
            let nextIndex;

            if (direction === 'next') {
                nextIndex = (currentIndex + 1) % numSpouses;
            } else {
                nextIndex = (currentIndex - 1 + numSpouses) % numSpouses;
            }

            newMap.set(personId, nextIndex);
            return newMap;
        });
    };

    const handleDownloadReport = async () => {
        if (!treeContainerRef.current) return;
        const personForFilename = getPersonById(focusedPersonId || renderRootId || '');
        if (!personForFilename) {
            alert("Please select a person to generate a report.");
            return;
        }
    
        setIsGeneratingPdf(true);
        
        const fileName = `Family_Tree_for_${getFullName(personForFilename)}`;
        
        const printableElement = document.createElement('div');
        printableElement.style.position = 'absolute';
        printableElement.style.left = '-9999px';
        printableElement.style.width = '297mm'; // A4 landscape
        printableElement.style.padding = '20px';
        printableElement.style.backgroundColor = 'white';
        printableElement.style.color = 'black';
        printableElement.style.fontFamily = 'sans-serif';
    
        const reportTitle = `<h1 style="font-size: 28px; font-weight: bold; text-align: center; margin-bottom: 20px;">Family Tree for ${getFullName(personForFilename)}</h1>`;
        printableElement.innerHTML = reportTitle;
    
        const treeClone = treeContainerRef.current.cloneNode(true) as HTMLElement;
        printableElement.appendChild(treeClone);
    
        document.body.appendChild(printableElement);
    
        try {
            await generatePdf(printableElement, fileName, 'l');
        } catch (error) {
            console.error("Error generating family tree PDF:", error);
            alert("Sorry, an error occurred while generating the PDF report.");
        } finally {
            if (document.body.contains(printableElement)) {
                document.body.removeChild(printableElement);
            }
            setIsGeneratingPdf(false);
        }
    };

    const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.1, 2));
    const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.1, 0.3));
    const handleResetZoom = () => setZoom(1);
    
    if (people.length === 0) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center p-8 bg-gray-50 dark:bg-gray-800 rounded-lg shadow-md">
                    <h3 className="text-xl font-semibold">Your Family Tree is Empty</h3>
                    <p className="mt-2 text-gray-600 dark:text-gray-400">
                        Start by adding a person from the "All Individuals" page.
                    </p>
                    <div className="mt-4">
                        <UserIcon />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white dark:bg-gray-900 shadow-lg rounded-xl h-full flex flex-col relative">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center no-print">
                 <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex-shrink-0">Family Tree View</h2>
                 <div className="flex-grow mx-6 max-w-md">
                    <SearchableSelect
                        options={people}
                        value={focusedPersonId || ''}
                        onChange={handleRootPersonChange}
                        placeholder="Select a person to start the tree"
                    />
                 </div>
                 <Button onClick={handleDownloadReport} disabled={isGeneratingPdf || !renderRootId}>
                    {isGeneratingPdf ? <SpinnerIcon /> : <PrintIcon />}
                    <span className="ml-2 hidden sm:inline">{isGeneratingPdf ? 'Generating...' : 'Download Report'}</span>
                 </Button>
            </div>

            <div className="absolute top-20 right-6 z-10 flex flex-col items-center space-y-2 no-print">
                <Tooltip text="Zoom In">
                    <button onClick={handleZoomIn} className="p-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-full shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                        <PlusIcon />
                    </button>
                </Tooltip>
                <Tooltip text="Zoom Out">
                    <button onClick={handleZoomOut} className="p-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-full shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                        <MinusIcon />
                    </button>
                </Tooltip>
                <Tooltip text="Reset Zoom">
                    <button onClick={handleResetZoom} className="px-3 py-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-full shadow-lg text-sm font-bold hover:bg-gray-100 dark:hover:bg-gray-700">
                        1x
                    </button>
                </Tooltip>
            </div>

            <div className="flex-grow overflow-auto p-8" ref={scrollContainerRef}>
                <div ref={treeContainerRef} 
                     className="inline-block min-w-full"
                     style={{
                        transform: `scale(${zoom})`,
                        transformOrigin: 'top center',
                        transition: 'transform 0.2s ease-out'
                     }}
                >
                {renderRootId ? (
                    <FamilyNode 
                        personId={renderRootId} 
                        onEdit={handleEdit}
                        onToggleAncestors={handleToggleAncestors}
                        onNavigateToFamily={handleNavigateToFamily}
                        onToggleChildren={handleToggleChildren}
                        onSwitchSpouse={handleSwitchSpouse}
                        onToggleSiblings={handleToggleSiblings}
                        processedIds={new Set()}
                        allPeople={people}
                        siblingsVisibleFor={siblingsVisibleFor}
                        childrenVisibleFor={childrenVisibleFor}
                        ancestorsVisibleFor={ancestorsVisibleFor}
                        activeSpouseIndices={activeSpouseIndices}
                    />
                ) : (
                    <div className="flex items-center justify-center h-full pt-16">
                        <div className="text-center p-8">
                            <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-200">Select a person to begin</h3>
                            <p className="mt-2 text-gray-500 dark:text-gray-400">
                                Use the search bar above to find an individual and start building the tree.
                            </p>
                        </div>
                    </div>
                )}
                </div>
            </div>
        </div>
    );
};
