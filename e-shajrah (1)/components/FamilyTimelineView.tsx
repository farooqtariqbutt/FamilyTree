
import React, { useMemo, useRef, useState } from 'react';
import { useFamilyTreeContext } from '../hooks/useFamilyTree.ts';
import { Gender, Person } from '../types.ts';
import Button from './ui/Button.tsx';
import { PrintIcon, SpinnerIcon } from './ui/Icons.tsx';
import { generatePdf } from '../utils/pdfUtils.ts';
import SearchableSelect from './ui/SearchableSelect.tsx';
import { getFullName } from '../utils/personUtils.ts';

const FamilyTimelineChart: React.FC<{people: Person[]}> = ({ people }) => {
    const chartData = useMemo(() => {
        if (people.length === 0) return null;
        
        const peopleWithData = people
            .filter(p => p.birthDate)
            .map(p => ({
                ...p,
                birthYear: new Date(p.birthDate!).getFullYear(),
                deathYear: p.deathDate ? new Date(p.deathDate).getFullYear() : new Date().getFullYear(),
                fullName: getFullName(p)
            }))
            .sort((a, b) => a.fullName.localeCompare(b.fullName));

        if (peopleWithData.length === 0) return null;

        const minYear = Math.min(...peopleWithData.map(p => p.birthYear));
        const maxYear = Math.max(...peopleWithData.map(p => p.deathYear));
        
        return { people: peopleWithData, minYear: Math.floor(minYear / 10) * 10, maxYear: Math.ceil(maxYear / 10) * 10 };
    }, [people]);

    if (!chartData) {
        return <p className="text-gray-500">No individuals with birth dates to display on the timeline.</p>;
    }

    const { people: chartPeople, minYear, maxYear } = chartData;

    const chartHeight = 600;
    const leftMargin = 50;
    const rightMargin = 20;
    const topMargin = 20;
    const bottomMargin = 120; // Increased for rotated text
    const personLaneWidth = 60; // Space for each person's bar and label
    const chartWidth = chartPeople.length * personLaneWidth;
    const totalWidth = chartWidth + leftMargin + rightMargin;
    const totalHeight = chartHeight + topMargin + bottomMargin;

    const yearRange = maxYear - minYear;
    const yearToY = (year: number) => topMargin + ((year - minYear) / yearRange) * chartHeight;

    const yearTicks = [];
    for (let year = minYear; year <= maxYear; year += (yearRange > 200 ? 20 : 10)) {
        yearTicks.push(year);
    }

    return (
        <svg width={totalWidth} height={totalHeight} className="font-sans">
            {/* Y-axis (Years) */}
            <g className="text-xs text-gray-500 dark:text-gray-400">
                {yearTicks.map(year => (
                    <g key={year}>
                        <line x1={leftMargin} y1={yearToY(year)} x2={totalWidth - rightMargin} y2={yearToY(year)} className="stroke-current text-gray-200 dark:text-gray-700" strokeWidth="0.5" strokeDasharray="2,2"/>
                        <text x={leftMargin - 8} y={yearToY(year)} dy="0.32em" textAnchor="end">{year}</text>
                    </g>
                ))}
            </g>

            {/* X-axis (Full Names) */}
            <g className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                 {chartPeople.map((person, i) => {
                     const x = leftMargin + (i * personLaneWidth) + (personLaneWidth / 2);
                     const y = totalHeight - bottomMargin + 15;
                     return (
                        <text 
                            key={person.id} 
                            x={x} 
                            y={y}
                            textAnchor="end"
                            transform={`rotate(-45, ${x}, ${y})`}
                        >
                          {person.fullName}
                        </text>
                     )
                 })}
            </g>

            {/* Data Bars */}
            <g>
                {chartPeople.map((person, i) => {
                    const y1 = yearToY(person.birthYear);
                    const y2 = yearToY(person.deathYear);
                    const barX = leftMargin + (i * personLaneWidth) + (personLaneWidth / 2);
                    const colorClass = person.gender === Gender.Male ? 'text-blue-500' : 'text-pink-500';

                    return (
                        <g key={person.id} className={`${colorClass} opacity-70 hover:opacity-100 transition-opacity`}>
                            <title>{`${person.fullName} (${person.birthYear}-${person.deathYear === new Date().getFullYear() ? 'Present' : person.deathYear})`}</title>
                            <line
                                x1={barX} y1={y1}
                                x2={barX} y2={y2}
                                stroke="currentColor"
                                strokeWidth="8"
                                strokeLinecap="round"
                            />
                        </g>
                    )
                })}
            </g>
        </svg>
    );
}

// --- Reusable Helper Functions for Relationship Traversal (aligned with ReportsView) ---

const getAncestors = (person: Person, allPeople: Person[]): Person[] => {
    const ancestors: Person[] = [];
    if (!person.parentIds) return ancestors;

    const queue = [...person.parentIds];
    const visited = new Set<string>();

    while (queue.length > 0) {
        const personId = queue.shift()!;
        if (visited.has(personId) || !personId) continue;

        visited.add(personId);

        const p = allPeople.find(ap => ap.id === personId);
        if (p) {
            ancestors.push(p);
            p.parentIds?.forEach(parentId => {
                if (!visited.has(parentId)) {
                    queue.push(parentId);
                }
            });
        }
    }
    return ancestors;
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
    });
};

const getSpouses = (person: Person, getPersonById: (id: string) => Person | undefined): Person[] => {
     if (!person.marriages || person.marriages.length === 0) {
        return [];
    }
    return person.marriages
        .map(marriage => getPersonById(marriage.spouseId))
        .filter((p): p is Person => !!p);
};


export default function FamilyTimelineView() {
    const { people, getPersonById } = useFamilyTreeContext();
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [filterPersonId, setFilterPersonId] = useState('');
    const [displayedPeople, setDisplayedPeople] = useState<Person[] | null>(null);

    const timelineContainerRef = useRef<HTMLDivElement>(null);

    const handleGenerate = () => {
        if (!filterPersonId) return;

        const person = people.find(p => p.id === filterPersonId);
        if (!person) return;
        
        const ancestors = getAncestors(person, people);
        const descendants = getDescendants(person, people);
        const siblings = getSiblings(person, people);
        const spouses = getSpouses(person, getPersonById);

        const relatedPeopleMap = new Map<string, Person>();
        relatedPeopleMap.set(person.id, person);
        [...ancestors, ...descendants, ...siblings, ...spouses].forEach(p => {
            relatedPeopleMap.set(p.id, p);
        });

        setDisplayedPeople(Array.from(relatedPeopleMap.values()));
    };

    const handleShowAll = () => {
        setFilterPersonId('');
        setDisplayedPeople(null);
    };

    const handleDownloadReport = async () => {
        if (!timelineContainerRef.current) return;
    
        setIsGeneratingPdf(true);
    
        const person = displayedPeople && filterPersonId ? people.find(p => p.id === filterPersonId) : null;
        const fileName = person ? `Family_Timeline_for_${getFullName(person)}` : 'Family_Timeline_Report';
    
        const printableElement = document.createElement('div');
        printableElement.style.position = 'absolute';
        printableElement.style.left = '-9999px';
        printableElement.style.width = '297mm';
        printableElement.style.padding = '20px';
        printableElement.style.backgroundColor = 'white';
        printableElement.style.color = 'black';
        printableElement.style.fontFamily = 'sans-serif';
    
        const reportTitleHtml = `<h1 style="font-size: 28px; font-weight: bold; text-align: center; margin-bottom: 20px;">Family Timeline Report</h1>`;
        printableElement.innerHTML = reportTitleHtml;
    
        if (person) {
            let photoHtml = '';
            const personPhoto = person.photos?.[0];
            if (personPhoto) {
                try {
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    await new Promise((resolve, reject) => {
                        img.onload = resolve;
                        img.onerror = reject;
                        img.src = personPhoto;
                    });
                    photoHtml = `<img src="${img.src}" style="width: 100px; height: 133px; object-fit: cover; border-radius: 8px; float: left; margin-right: 20px;" />`;
                } catch (error) {
                    console.error("Error preloading image for PDF:", error);
                    photoHtml = `<div style="width: 100px; height: 133px; border: 1px solid #eee; background: #f0f0f0; display: flex; align-items: center; justify-content: center; float: left; margin-right: 20px; color: #666;">No Image</div>`;
                }
            }
    
            const detailsHtml = `
                <div style="overflow: hidden;">
                     <h2 style="font-size: 24px; font-weight: bold; margin-bottom: 10px;">Timeline for ${getFullName(person)}</h2>
                     <div style="font-size: 14px; line-height: 1.5;">
                        <div><strong>Born:</strong> ${person.birthDate || 'N/A'}${person.birthPlace ? ` in ${person.birthPlace}` : ''}</div>
                        ${person.deathDate ? `<div><strong>Died:</strong> ${person.deathDate}${person.deathPlace ? ` in ${person.deathPlace}` : ''}</div>` : ''}
                     </div>
                </div>
                <div style="clear: both;"></div>
            `;
            
            const summaryCardBgColor = person.gender === Gender.Male 
                ? 'rgba(59, 130, 246, 0.1)' // male
                : person.gender === Gender.Female 
                ? 'rgba(236, 72, 153, 0.1)' // female
                : '#f9fafb'; // bg-gray-50
    
            const summaryHtml = `
                <div style="background-color: ${summaryCardBgColor}; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; margin-bottom: 20px; overflow: hidden;">
                    ${photoHtml}
                    ${detailsHtml}
                </div>
            `;
            printableElement.innerHTML += summaryHtml;
        }
    
        const timelineContainer = timelineContainerRef.current;
        if (timelineContainer) {
            const clonedTimeline = timelineContainer.cloneNode(true) as HTMLElement;
            printableElement.appendChild(clonedTimeline);
        }
    
        document.body.appendChild(printableElement);
    
        try {
            await generatePdf(printableElement, fileName, 'l');
        } catch (error) {
            console.error("Error generating timeline PDF:", error);
            alert("Sorry, an error occurred while generating the PDF report.");
        } finally {
            if (document.body.contains(printableElement)) {
                document.body.removeChild(printableElement);
            }
            setIsGeneratingPdf(false);
        }
    };
    
    const peopleForChart = displayedPeople || people;

    return (
        <div className="bg-white dark:bg-gray-900 shadow-lg rounded-xl h-full flex flex-col">
            <div className="p-6 pb-4 flex justify-between items-start flex-wrap gap-4 border-b border-gray-200 dark:border-gray-700 no-print">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Family Timeline</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Filter the timeline to focus on specific family lines.</p>
                </div>
                 <div className="flex items-center space-x-2">
                     {people.length > 0 && (
                        <Button variant="secondary" onClick={handleDownloadReport} disabled={isGeneratingPdf}>
                            {isGeneratingPdf ? <SpinnerIcon /> : <PrintIcon />}
                            <span className="ml-2 hidden sm:inline">{isGeneratingPdf ? 'Generating...' : 'Download Report'}</span>
                        </Button>
                     )}
                 </div>
            </div>

            {people.length > 0 ? (
                <>
                <div className="p-6 pb-4 flex items-end space-x-2 no-print">
                    <div className="flex-grow max-w-sm">
                        <SearchableSelect
                            label="Filter by Person"
                            options={people}
                            value={filterPersonId}
                            onChange={setFilterPersonId}
                            placeholder="Select a person to focus on"
                        />
                    </div>
                    <Button onClick={handleGenerate} disabled={!filterPersonId}>Generate</Button>
                    {displayedPeople && <Button variant="secondary" onClick={handleShowAll}>Show All</Button>}
                </div>
                <div className="flex-grow overflow-auto px-6">
                    <div ref={timelineContainerRef}>
                        <FamilyTimelineChart people={peopleForChart}/>
                    </div>
                </div>
                </>
            ) : (
                <div className="flex-grow flex items-center justify-center">
                    <p className="text-gray-500">Add people to the tree to see the timeline.</p>
                </div>
            )}
        </div>
    );
};
