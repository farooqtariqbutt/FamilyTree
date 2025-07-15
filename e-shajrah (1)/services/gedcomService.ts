
import { v4 as uuidv4 } from 'uuid';
import { Person, Marriage, MarriageStatus, Gender } from '../types.ts';

// Enhanced GEDCOM parser
export const parseGedcom = (gedcomString: string): Person[] => {
    const lines = gedcomString.split(/\r?\n/);
    const people: Person[] = [];
    const fams: any[] = [];
    let currentIndi: Partial<Person> & { gedcomId: string } | null = null;
    let currentFam: any | null = null;
    let context: string | null = null;
    let subContext: string | null = null;

    for (const line of lines) {
        const parts = line.trim().split(' ');
        const level = parseInt(parts[0], 10);
        const tag = parts[1];
        const value = parts.slice(2).join(' ');

        if (level === 0) {
            context = null; // Reset context
            if (tag.startsWith('@') && tag.endsWith('@')) {
                 if (value === 'INDI') {
                    if (currentIndi) people.push(currentIndi as Person);
                    currentIndi = { id: uuidv4(), gedcomId: tag, parentIds: [], childrenIds: [], marriages: [] };
                } else if (value === 'FAM') {
                    if (currentFam) fams.push(currentFam);
                    currentFam = { gedcomId: tag, children: [] };
                } else {
                    currentIndi = null;
                    currentFam = null;
                }
            }
        } else if (level === 1) {
            context = tag;
            subContext = null;
            if (currentIndi) {
                if (tag === 'NAME') {
                    const nameParts = value.split('/');
                    currentIndi.firstName = nameParts[0].trim();
                    currentIndi.lastName = nameParts[1].trim();
                } else if (tag === 'SEX') {
                    currentIndi.gender = value === 'M' ? Gender.Male : (value === 'F' ? Gender.Female : Gender.Other);
                } else if (tag === 'BIRT') {
                    context = 'BIRT';
                } else if (tag === 'DEAT') {
                    context = 'DEAT';
                }
            }
            if (currentFam) {
                if (tag === 'HUSB') currentFam.husb = value;
                else if (tag === 'WIFE') currentFam.wife = value;
                else if (tag === 'CHIL') currentFam.children.push(value);
                else if (tag === 'MARR') subContext = 'MARR';
            }
        } else if (level === 2 && context) {
             if (currentIndi) {
                if(context === 'BIRT' && tag === 'DATE') currentIndi.birthDate = value;
                if(context === 'BIRT' && tag === 'PLAC') currentIndi.birthPlace = value;
                if(context === 'DEAT' && tag === 'DATE') currentIndi.deathDate = value;
                if(context === 'DEAT' && tag === 'PLAC') currentIndi.deathPlace = value;
             }
             if (currentFam && subContext === 'MARR') {
                 if (tag === 'DATE') currentFam.date = value;
                 if (tag === 'PLAC') currentFam.place = value;
             }
        }
    }
    if (currentIndi) people.push(currentIndi as Person);
    if (currentFam) fams.push(currentFam);
    
    // Link families
    const gedcomIdToPersonId: {[key: string]: string} = {};
    people.forEach(p => gedcomIdToPersonId[(p as any).gedcomId] = p.id);
    
    fams.forEach(fam => {
        const husbandId = gedcomIdToPersonId[fam.husb];
        const wifeId = gedcomIdToPersonId[fam.wife];
        
        if (husbandId && wifeId) {
            const husband = people.find(p => p.id === husbandId);
            const wife = people.find(p => p.id === wifeId);
            if (husband && wife) {
                 if (!husband.marriages) husband.marriages = [];
                 if (!wife.marriages) wife.marriages = [];
                 const marriageDetails: Marriage = { 
                     spouseId: wife.id, 
                     status: MarriageStatus.Married,
                     date: fam.date,
                     place: fam.place,
                 };
                 husband.marriages.push(marriageDetails);
                 wife.marriages.push({ ...marriageDetails, spouseId: husband.id });
            }
        }

        fam.children.forEach((childGedcomId: string) => {
            const childId = gedcomIdToPersonId[childGedcomId];
            const child = people.find(p => p.id === childId);
            if (child) {
                child.parentIds = [husbandId, wifeId].filter(Boolean);
                if (husbandId) {
                    const husband = people.find(p => p.id === husbandId);
                    if(husband && !husband.childrenIds?.includes(childId)) {
                        if(!husband.childrenIds) husband.childrenIds = [];
                        husband.childrenIds.push(childId)
                    }
                };
                if (wifeId) {
                     const wife = people.find(p => p.id === wifeId);
                    if(wife && !wife.childrenIds?.includes(childId)) {
                        if(!wife.childrenIds) wife.childrenIds = [];
                        wife.childrenIds.push(childId)
                    }
                };
            }
        });
    });

    return people.map(({ gedcomId, ...rest }: any) => rest);
};


// Rewritten GEDCOM exporter to be more robust and standards-compliant
export const exportToGedcom = (people: Person[]): string => {
    let gedcomString = '0 HEAD\n1 SOUR Digital Family Tree\n1 GEDC\n2 VERS 5.5.1\n2 FORM LINEAGE-LINKED\n1 CHAR UTF-8\n';
    const personToGedcomId: { [key: string]: string } = {};
    const personIdToFamc: { [key: string]: string } = {};
    const personIdToFams: { [key: string]: string[] } = {};

    let indiCounter = 1;
    let famCounter = 1;

    people.forEach(p => {
        personToGedcomId[p.id] = `@I${indiCounter++}@`;
        personIdToFams[p.id] = [];
    });

    const processedMarriages = new Set<string>();

    people.forEach(person => {
        person.marriages?.forEach(marriage => {
            const p1Id = person.id;
            const p2Id = marriage.spouseId;
            const sortedIds = [p1Id, p2Id].sort().join('-');
            if (processedMarriages.has(sortedIds)) return;

            const famId = `@F${famCounter++}@`;
            processedMarriages.add(sortedIds);

            personIdToFams[p1Id].push(famId);
            personIdToFams[p2Id].push(famId);
            
            const p1 = person;
            const p2 = people.find(p => p.id === p2Id);
            const children = p1?.childrenIds?.filter(cId => p2?.childrenIds?.includes(cId)) || [];
            children.forEach(childId => {
                personIdToFamc[childId] = famId;
            });
        });
    });

    // Write INDI records
    people.forEach(person => {
        gedcomString += `0 ${personToGedcomId[person.id]} INDI\n`;
        const surname = [person.lastName, person.familyCast].filter(Boolean).join(' ');
        gedcomString += `1 NAME ${person.firstName || ''} /${surname}/\n`;
        if (person.gender) {
            gedcomString += `1 SEX ${person.gender === Gender.Male ? 'M' : person.gender === Gender.Female ? 'F' : 'O'}\n`;
        }
        if (person.birthDate || person.birthPlace) {
            gedcomString += '1 BIRT\n';
            if (person.birthDate) gedcomString += `2 DATE ${person.birthDate}\n`;
            if (person.birthPlace) gedcomString += `2 PLAC ${person.birthPlace}\n`;
        }
        if (person.deathDate || person.deathPlace) {
            gedcomString += '1 DEAT\n';
            if (person.deathDate) gedcomString += `2 DATE ${person.deathDate}\n`;
            if (person.deathPlace) gedcomString += `2 PLAC ${person.deathPlace}\n`;
        }
        if (person.occupation) gedcomString += `1 OCCU ${person.occupation}\n`;
        if (person.notes) gedcomString += `1 NOTE ${person.notes.replace(/\n/g, '\n2 CONT ')}\n`;
        
        if (person.isAdopted && personIdToFamc[person.id]) {
            gedcomString += `1 ADOP\n2 FAMC ${personIdToFamc[person.id]}\n`;
        } else if (personIdToFamc[person.id]) {
            gedcomString += `1 FAMC ${personIdToFamc[person.id]}\n`;
        }

        personIdToFams[person.id]?.forEach(famId => {
            gedcomString += `1 FAMS ${famId}\n`;
        });
    });

    // Write FAM records
    famCounter = 1; // Reset for iteration
    const processedMarriagesForFam = new Set<string>();
    people.forEach(person => {
        person.marriages?.forEach(marriage => {
            const p1Id = person.id;
            const p2Id = marriage.spouseId;
            const sortedIds = [p1Id, p2Id].sort().join('-');
            if (processedMarriagesForFam.has(sortedIds)) return;

            const famId = `@F${famCounter++}@`;
            processedMarriagesForFam.add(sortedIds);
            
            gedcomString += `0 ${famId} FAM\n`;
            
            const p1 = person;
            const p2 = people.find(p => p.id === p2Id);
            if (!p2) return;

            if (p1.gender === Gender.Male) {
                gedcomString += `1 HUSB ${personToGedcomId[p1Id]}\n`;
                gedcomString += `1 WIFE ${personToGedcomId[p2Id]}\n`;
            } else {
                gedcomString += `1 HUSB ${personToGedcomId[p2Id]}\n`;
                gedcomString += `1 WIFE ${personToGedcomId[p1Id]}\n`;
            }
            
            if (marriage.date || marriage.place) {
                gedcomString += '1 MARR\n';
                if (marriage.date) gedcomString += `2 DATE ${marriage.date}\n`;
                if (marriage.place) gedcomString += `2 PLAC ${marriage.place}\n`;
            }

            const children = p1.childrenIds?.filter(cId => p2.childrenIds?.includes(cId)) || [];
            children.forEach(childId => {
                gedcomString += `1 CHIL ${personToGedcomId[childId]}\n`;
            });
        });
    });

    gedcomString += '0 TRLR\n';
    return gedcomString;
};