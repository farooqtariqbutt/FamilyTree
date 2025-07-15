
import { Gender, type Person } from '../types.ts';
import { getFullName } from './personUtils.ts';

const getPersonById = (id: string, allPeople: Person[]): Person | undefined => {
    return allPeople.find(p => p.id === id);
}

// --- Relationship Pathfinding and Description Logic ---

const findLcaAndPaths = (person1Id: string, person2Id: string, allPeople: Person[]): { lca: Person; path1: Person[]; path2: Person[] } | null => {
    const getPerson = (id: string) => getPersonById(id, allPeople);

    // Helper to get path from a person up to a specific ancestor using BFS for shortest path
    const getPathToAncestor = (startId: string, endId: string): Person[] | null => {
        const startPerson = getPerson(startId);
        if (!startPerson) return null;
        if (startId === endId) return [startPerson];

        const queue: { personId: string; path: Person[] }[] = [{ personId: startId, path: [startPerson] }];
        const visited = new Set<string>([startId]);

        while (queue.length > 0) {
            const { personId, path } = queue.shift()!;
            const currentPerson = getPerson(personId);

            if (currentPerson?.parentIds) {
                for (const parentId of currentPerson.parentIds) {
                    if (!visited.has(parentId)) {
                        visited.add(parentId);
                        const parentPerson = getPerson(parentId);
                        if (parentPerson) {
                            const newPath = [...path, parentPerson];
                            if (parentId === endId) {
                                return newPath;
                            }
                            queue.push({ personId: parentId, path: newPath });
                        }
                    }
                }
            }
        }
        return null;
    }

    // Get all ancestors of person 1 (id -> person)
    const p1Ancestors = new Map<string, Person>();
    const queue1: string[] = [person1Id];
    const visited1 = new Set<string>();

    while (queue1.length > 0) {
        const currentId = queue1.shift()!;
        if (visited1.has(currentId)) continue;
        visited1.add(currentId);
        const person = getPerson(currentId);
        if (person) {
            p1Ancestors.set(currentId, person);
            if (person.parentIds) {
                queue1.push(...person.parentIds);
            }
        }
    }

    // Traverse up from person 2 (BFS) and find the first common ancestor
    const queue2: string[] = [person2Id];
    const visited2 = new Set<string>([person2Id]);

    while (queue2.length > 0) {
        const currentId = queue2.shift()!;
        if (p1Ancestors.has(currentId)) {
            const lca = p1Ancestors.get(currentId)!;
            const path1 = getPathToAncestor(person1Id, lca.id);
            const path2 = getPathToAncestor(person2Id, lca.id);
            
            if (path1 && path2) {
                return { lca, path1, path2 };
            }
        }

        const person = getPerson(currentId);
        if (person?.parentIds) {
            for (const parentId of person.parentIds) {
                if (!visited2.has(parentId)) {
                    visited2.add(parentId);
                    queue2.push(parentId);
                }
            }
        }
    }

    return null;
}


const ordinal = (n: number): string => {
    if (n <= 0) return String(n);
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const describeBloodRelationship = (person1: Person, person2: Person, lca: Person, path1: Person[], path2: Person[]): string => {
    const d1 = path1.length - 1;
    const d2 = path2.length - 1;

    // Direct ancestor/descendant
    if (lca.id === person1.id) {
        const d = d2;
        if (d === 0) return `They are the same person.`;
        if (d === 1) return `${getFullName(person1)} is the ${person1.gender === Gender.Male ? 'father' : 'mother'} of ${getFullName(person2)}.`;
        if (d === 2) return `${getFullName(person1)} is the ${person1.gender === Gender.Male ? 'grandfather' : 'grandmother'} of ${getFullName(person2)}.`;
        const prefix = 'great-'.repeat(d - 2);
        return `${getFullName(person1)} is the ${prefix}${person1.gender === Gender.Male ? 'grandfather' : 'grandmother'} of ${getFullName(person2)}.`;
    }
    if (lca.id === person2.id) {
        const d = d1;
        if (d === 0) return `They are the same person.`;
        if (d === 1) return `${getFullName(person2)} is the ${person2.gender === Gender.Male ? 'father' : 'mother'} of ${getFullName(person1)}.`;
        if (d === 2) return `${getFullName(person2)} is the ${person2.gender === Gender.Male ? 'grandfather' : 'grandmother'} of ${getFullName(person1)}.`;
        const prefix = 'great-'.repeat(d - 2);
        return `${getFullName(person2)} is the ${prefix}${person2.gender === Gender.Male ? 'grandfather' : 'grandmother'} of ${getFullName(person1)}.`;
    }

    // Siblings
    if (d1 === 1 && d2 === 1) {
        return `${getFullName(person1)} and ${getFullName(person2)} are siblings.`;
    }

    // Cousins and aunt/uncle/nephew/niece
    const cousinLevel = Math.min(d1, d2) - 1;
    const removalLevel = Math.abs(d1 - d2);

    if (cousinLevel === 0) {
        const [ancestor, descendant] = d1 < d2 ? [person1, person2] : [person2, person1];
        const prefix = removalLevel > 1 ? `grand` : '';
        const relation = ancestor.gender === Gender.Male ? 'uncle' : ancestor.gender === Gender.Female ? 'aunt' : 'aunt/uncle';
        return `${getFullName(ancestor)} is the ${prefix}${relation} of ${getFullName(descendant)}.`;
    }
    
    const cousinTerm = cousinLevel === 1 ? 'first' : ordinal(cousinLevel);
    const removalTerm = removalLevel > 0 ? `, ${removalLevel === 1 ? 'once' : removalLevel === 2 ? 'twice' : `${removalLevel} times`} removed` : '';

    return `${getFullName(person1)} and ${getFullName(person2)} are ${cousinTerm} cousins${removalTerm}.`;
}


const getPathSegmentDescription = (p1: Person, p2: Person): string => {
    if (p1.childrenIds?.includes(p2.id)) {
        return p1.gender === Gender.Male ? 'is the father of' : p1.gender === Gender.Female ? 'is the mother of' : 'is the parent of';
    }
    if (p1.parentIds?.includes(p2.id)) {
        return p1.gender === Gender.Male ? 'is the son of' : p1.gender === Gender.Female ? 'is the daughter of' : 'is the child of';
    }
    if (p1.marriages?.some(m => m.spouseId === p2.id)) {
        return p1.gender === Gender.Male ? 'is the husband of' : p1.gender === Gender.Female ? 'is the wife of' : 'is the spouse of';
    }
    return 'is related to';
}

const generatePathDescription = (path: Person[]): string => {
    if (path.length < 2) return "They are the same person.";
    
    let description = getFullName(path[0]);
    for (let i = 0; i < path.length - 1; i++) {
        const p1 = path[i];
        const p2 = path[i+1];
        const relation = getPathSegmentDescription(p1, p2);
        description += (i > 0 ? ', who ' : ' ') + `${relation} ${getFullName(p2)}`;
    }
    description += '.';
    return description;
}

const findGenericPath = (person1: Person, person2: Person, allPeople: Person[]) => {
    const queue: { personId: string; path: Person[] }[] = [];
    const visited = new Set<string>();

    queue.push({ personId: person1.id, path: [person1] });
    visited.add(person1.id);

    while (queue.length > 0) {
        const { personId, path } = queue.shift()!;
        const currentPerson = path[path.length - 1];

        if (personId === person2.id) {
            const description = generatePathDescription(path);
            return { type: 'path' as const, description, path };
        }

        const neighbors: string[] = [
            ...(currentPerson.parentIds || []),
            ...(currentPerson.childrenIds || []),
            ...(currentPerson.marriages || []).map(m => m.spouseId)
        ];
        
        for (const neighborId of neighbors) {
            if (!visited.has(neighborId)) {
                visited.add(neighborId);
                const neighborPerson = getPersonById(neighborId, allPeople);
                if (neighborPerson) {
                    const newPath = [...path, neighborPerson];
                    queue.push({ personId: neighborId, path: newPath });
                }
            }
        }
    }
    return null; // No path found
}


export type Relationship = 
    | { type: 'blood', description: string, path1: Person[], path2: Person[], lca: Person }
    | { type: 'path', description: string, path: Person[] }
    | { type: 'none', description: string };

export const findRelationship = (person1Id: string, person2Id: string, allPeople: Person[]): Relationship | null => {
    if (!person1Id || !person2Id || person1Id === person2Id) {
        return null;
    }
    
    const person1 = getPersonById(person1Id, allPeople);
    const person2 = getPersonById(person2Id, allPeople);
    if (!person1 || !person2) return null;

    // 1. Try to find a direct blood relationship first
    const lcaResult = findLcaAndPaths(person1Id, person2Id, allPeople);
    
    if (lcaResult) {
        const { lca, path1, path2 } = lcaResult;
        const description = describeBloodRelationship(person1, person2, lca, path1, path2);
        return { type: 'blood', description, path1, path2, lca };
    }

    // 2. If no blood relationship, find the shortest path including marriages
    const pathResult = findGenericPath(person1, person2, allPeople);
    if (pathResult) {
        return pathResult;
    }
    
    // 3. If no path found at all
    return { type: 'none', description: 'No relationship path could be found between these two individuals.' };
};
