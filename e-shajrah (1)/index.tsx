
import React, { useState, useEffect, useCallback, createContext, useContext, useMemo, useRef, forwardRef } from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter, Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import saveAs from 'file-saver';
import { GoogleGenAI, Type } from "@google/genai";
import Cropper, { Point, Area } from 'react-easy-crop';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import autoTable from 'jspdf-autotable';

// --- From types.ts ---
enum Gender {
  Male = 'Male',
  Female = 'Female',
  Other = 'Other',
}

enum MarriageStatus {
    Married = 'Married',
    Divorced = 'Divorced',
    Widowed = 'Widowed',
    Unknown = 'Unknown',
}

interface Marriage {
    spouseId: string;
    date?: string;
    place?: string;
    status: MarriageStatus;
}

interface Person {
    id: string;
    firstName: string;
    lastName?: string;
    familyCast?: string;
    gender: Gender;
    birthDate?: string;
    birthPlace?: string;
    deathDate?: string;
    deathPlace?: string;
    causeOfDeath?: string;
    photos?: string[]; // URLs or base64 strings
    biography?: string;
    occupation?: string;
    education?: string;
    religion?: string;
    residence?: string;
    notes?: string;
    mobileNumber?: string;
    email?: string;
    parentIds?: string[]; // [fatherId, motherId]
    marriages?: Marriage[];
    childrenIds?: string[];
    isAdopted?: boolean;
}

interface Tree {
    id: string;
    name: string;
    people: Person[];
}

interface Trees {
    [key: string]: Tree;
}

interface Statistics {
    totalPeople: number;
    maleCount: number;
    femaleCount: number;
    averageLifespan: string; // "X years, Y months"
    oldestLivingPerson?: Person;
    oldestPersonEver?: Person;
}

// --- From constants.ts ---
const SORT_KEYS: (keyof Person)[] = ['firstName', 'birthDate', 'deathDate'];

// --- From utils/dateUtils.ts ---
const calculateAge = (birthDate?: string, deathDate?: string): string => {
    if (!birthDate) return 'N/A';
    
    const start = new Date(birthDate);
    const end = deathDate ? new Date(deathDate) : new Date();
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return 'N/A';

    let years = end.getFullYear() - start.getFullYear();
    let months = end.getMonth() - start.getMonth();
    
    if (end.getDate() < start.getDate()) {
        months--;
    }
    
    if (months < 0) {
        years--;
        months += 12;
    }

    return `${years} years, ${months} months`;
};

const getLifespanInMonths = (birthDate?: string, deathDate?: string): number | null => {
    if (!birthDate || !deathDate) return null;

    const start = new Date(birthDate);
    const end = new Date(deathDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
    
    let years = end.getFullYear() - start.getFullYear();
    let months = end.getMonth() - start.getMonth();
    
    if (end.getDate() < start.getDate()) {
        months--;
    }
    
    if (months < 0) {
        years--;
        months += 12;
    }
    
    return years * 12 + months;
};

const formatLifespan = (totalMonths: number): string => {
    if (isNaN(totalMonths) || totalMonths < 0) return "N/A";
    const years = Math.floor(totalMonths / 12);
    const months = Math.round(totalMonths % 12);
    return `${years} years, ${months} months`;
};

// --- From utils/personUtils.ts ---
const getFullName = (person?: Partial<Person> | null): string => {
  if (!person) {
    return '';
  }
  return [person.firstName, person.lastName, person.familyCast]
    .filter(Boolean)
    .join(' ');
};

// --- From utils/imageUtils.ts ---
const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.setAttribute('crossOrigin', 'anonymous'); // needed to avoid cross-origin issues on canvas
    image.src = url;
  });

function getRadianAngle(degreeValue: number) {
  return (degreeValue * Math.PI) / 180;
}

function rotateSize(width: number, height: number, rotation: number) {
  const rotRad = getRadianAngle(rotation);

  return {
    width:
      Math.abs(Math.cos(rotRad) * width) + Math.abs(Math.sin(rotRad) * height),
    height:
      Math.abs(Math.sin(rotRad) * width) + Math.abs(Math.cos(rotRad) * height),
  };
}

async function getCroppedImg(
  imageSrc: string,
  pixelCrop: { x: number; y: number; width: number; height: number },
  rotation = 0
): Promise<string> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Could not get canvas context');
  }

  const rotRad = getRadianAngle(rotation);

  const { width: bBoxWidth, height: bBoxHeight } = rotateSize(
    image.width,
    image.height,
    rotation
  );

  canvas.width = bBoxWidth;
  canvas.height = bBoxHeight;

  ctx.translate(bBoxWidth / 2, bBoxHeight / 2);
  ctx.rotate(rotRad);
  ctx.translate(-image.width / 2, -image.height / 2);

  ctx.drawImage(image, 0, 0);

  const data = ctx.getImageData(
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height
  );

  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  ctx.putImageData(data, 0, 0);

  return canvas.toDataURL('image/jpeg');
}

const compressImage = (imageSrc: string): Promise<string> => {
    const MAX_DIMENSION = 800;
    const QUALITY = 0.8;

    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = imageSrc;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let { width, height } = img;

            if (width > height) {
                if (width > MAX_DIMENSION) {
                    height = Math.round((height * MAX_DIMENSION) / width);
                    width = MAX_DIMENSION;
                }
            } else {
                if (height > MAX_DIMENSION) {
                    width = Math.round((width * MAX_DIMENSION) / height);
                    height = MAX_DIMENSION;
                }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                return reject(new Error('Could not get canvas context'));
            }
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', QUALITY));
        };
        img.onerror = (error) => reject(error);
    });
};

// --- From utils/pdfUtils.ts ---
const generatePdf = async (element: HTMLElement, fileName: string, orientation: 'p' | 'l' = 'p') => {
    if (!element) return;
    
    try {
        const canvas = await html2canvas(element, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
            width: element.scrollWidth,
            height: element.scrollHeight,
            windowWidth: element.scrollWidth,
            windowHeight: element.scrollHeight,
            onclone: (doc) => {
                doc.documentElement.classList.remove('dark');
                const style = doc.createElement('style');
                style.innerHTML = `
                    body, body * {
                      color: #1f2937 !important;
                      -webkit-print-color-adjust: exact !important;
                      print-color-adjust: exact !important;
                    }
                    .bg-white { background-color: #ffffff !important; }
                    .bg-gray-50 { background-color: #f9fafb !important; }
                    .bg-gray-100 { background-color: #f3f4f6 !important; }
                    .bg-blue-100 { background-color: #dbeafe !important; }
                    .bg-indigo-100 { background-color: #e0e7ff !important; }
                    .bg-green-100 { background-color: #d1fae5 !important; }
                    .bg-red-100 { background-color: #fee2e2 !important; }
                    .bg-yellow-100 { background-color: #fef9c3 !important; }
                    .bg-male { background-color: #eff6ff !important; }
                    .bg-female { background-color: #fce7f3 !important; }
                    .text-blue-600 { color: #2563eb !important; }
                    .text-blue-800 { color: #1e40af !important; }
                    .text-indigo-600 { color: #4f46e5 !important; }
                    .text-indigo-800 { color: #3730a3 !important; }
                    .text-green-600 { color: #16a34a !important; }
                    .text-green-800 { color: #065f46 !important; }
                    .text-gray-500 { color: #6b7280 !important; }
                    .text-gray-600 { color: #4b5563 !important; }
                    * {
                      box-shadow: none !important;
                      text-shadow: none !important;
                      transition: none !important;
                      animation: none !important;
                    }
                `;
                doc.head.appendChild(style);
                doc.querySelectorAll('.no-print').forEach(el => {
                    (el as HTMLElement).style.display = 'none';
                });
            }
        });

        const imgData = canvas.toDataURL('image/jpeg', 1.0);
        const pdf = new jsPDF(orientation, 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const margin = 10;
        
        const imgProps= pdf.getImageProperties(imgData);
        const imgWidth = pdfWidth - margin * 2;
        const imgHeight = (imgProps.height * imgWidth) / imgProps.width;
        
        let heightLeft = imgHeight;
        let position = margin;
        
        pdf.addImage(imgData, 'JPEG', margin, position, imgWidth, imgHeight);
        heightLeft -= (pdfHeight - margin * 2);

        while (heightLeft > 0) {
            position = -heightLeft + margin;
            pdf.addPage();
            pdf.addImage(imgData, 'JPEG', margin, position, imgWidth, imgHeight);
            heightLeft -= (pdfHeight - margin * 2);
        }

        const pageCount = pdf.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            pdf.setPage(i);
            pdf.setFontSize(8);
            pdf.setTextColor(150);
            const dateTime = new Date().toLocaleString();
            pdf.text(dateTime, margin, pdfHeight - margin);
            const pageNumText = `Page ${i} of ${pageCount}`;
            const textWidth = pdf.getStringUnitWidth(pageNumText) * pdf.getFontSize() / pdf.internal.scaleFactor;
            pdf.text(pageNumText, pdfWidth - margin - textWidth, pdfHeight - margin);
        }

        pdf.save(`${fileName.replace(/\s/g, '_')}.pdf`);

    } catch (error) {
        console.error("Error generating PDF:", error);
        alert("Sorry, an error occurred while generating the PDF.");
    }
};

// --- From utils/relationshipUtils.ts ---
type Relationship = 
    | { type: 'blood', description: string, path1: Person[], path2: Person[], lca: Person }
    | { type: 'path', description: string, path: Person[] }
    | { type: 'none', description: string };

const findRelationship = (person1Id: string, person2Id: string, allPeople: Person[]): Relationship | null => {
    if (!person1Id || !person2Id || person1Id === person2Id) {
        return null;
    }
    
    const person1 = allPeople.find(p => p.id === person1Id);
    const person2 = allPeople.find(p => p.id === person2Id);
    if (!person1 || !person2) return null;

    const findLcaAndPaths = (person1Id: string, person2Id: string, allPeople: Person[]): { lca: Person; path1: Person[]; path2: Person[] } | null => {
        const getPerson = (id: string) => allPeople.find(p => p.id === id);

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

        if (d1 === 1 && d2 === 1) {
            return `${getFullName(person1)} and ${getFullName(person2)} are siblings.`;
        }

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
                    const neighborPerson = allPeople.find(p => p.id === neighborId);
                    if (neighborPerson) {
                        const newPath = [...path, neighborPerson];
                        queue.push({ personId: neighborId, path: newPath });
                    }
                }
            }
        }
        return null;
    }

    const lcaResult = findLcaAndPaths(person1Id, person2Id, allPeople);
    if (lcaResult) {
        const { lca, path1, path2 } = lcaResult;
        const description = describeBloodRelationship(person1, person2, lca, path1, path2);
        return { type: 'blood', description, path1, path2, lca };
    }

    const pathResult = findGenericPath(person1, person2, allPeople);
    if (pathResult) {
        return pathResult;
    }
    
    return { type: 'none', description: 'No relationship path could be found between these two individuals.' };
};

// --- From services/dbService.ts ---
const DB_NAME = 'DigitalFamilyTreeDB';
const DB_VERSION = 1;
const TREES_STORE_NAME = 'trees';
const APP_STATE_STORE_NAME = 'appState';

let db: IDBDatabase;

const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        if (db) {
            return resolve(db);
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
            const tempDb = (event.target as IDBOpenDBRequest).result;
            if (!tempDb.objectStoreNames.contains(TREES_STORE_NAME)) {
                tempDb.createObjectStore(TREES_STORE_NAME, { keyPath: 'id' });
            }
            if (!tempDb.objectStoreNames.contains(APP_STATE_STORE_NAME)) {
                 tempDb.createObjectStore(APP_STATE_STORE_NAME, { keyPath: 'key' });
            }
        };

        request.onsuccess = (event: Event) => {
            db = (event.target as IDBOpenDBRequest).result;
            resolve(db);
        };

        request.onerror = (event: Event) => {
            console.error('IndexedDB error:', (event.target as IDBOpenDBRequest).error);
            reject('Error opening IndexedDB.');
        };
    });
};

const getAllTrees = async (): Promise<Trees> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(TREES_STORE_NAME, 'readonly');
        const store = transaction.objectStore(TREES_STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            const treesArray: Tree[] = request.result;
            const treesObject: Trees = treesArray.reduce((obj, tree) => {
                obj[tree.id] = tree;
                return obj;
            }, {} as Trees);
            resolve(treesObject);
        };
        request.onerror = () => reject(request.error);
    });
};

const saveTree = async (tree: Tree): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(TREES_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(TREES_STORE_NAME);
        const request = store.put(tree);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

const deleteTreeFromDB = async (treeId: string): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(TREES_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(TREES_STORE_NAME);
        const request = store.delete(treeId);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

const getAppState = async (key: string): Promise<any> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(APP_STATE_STORE_NAME, 'readonly');
        const store = transaction.objectStore(APP_STATE_STORE_NAME);
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result?.value);
        request.onerror = () => reject(request.error);
    });
};

const saveAppState = async (key: string, value: any): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(APP_STATE_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(APP_STATE_STORE_NAME);
        const request = store.put({ key, value });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

// --- From services/gedcomService.ts ---
const parseGedcom = (gedcomString: string): Person[] => {
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
            context = null;
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

const exportToGedcom = (people: Person[]): string => {
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

    famCounter = 1;
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

// --- From services/geminiService.ts ---
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

interface FamilyContext {
    parents: (Person | undefined)[];
    spouses: (Person | undefined)[];
    children: (Person | undefined)[];
}

const generateLifeStory = async (person: Person, familyContext: FamilyContext): Promise<string> => {
    const { parents, spouses, children } = familyContext;
    
    const details = [
        `Name: ${getFullName(person)}`,
        person.birthDate && `Born: ${person.birthDate}${person.birthPlace ? ` in ${person.birthPlace}` : ''}`,
        person.deathDate && `Died: ${person.deathDate}${person.deathPlace ? ` in ${person.deathPlace}` : ''}`,
        person.occupation && `Occupation: ${person.occupation}`,
        parents.length > 0 && `Parents: ${parents.map(p => p?.firstName).join(' and ')}`,
        spouses.length > 0 && `Spouse(s): ${spouses.map(s => s?.firstName).join(', ')}`,
        children.length > 0 && `Children: ${children.map(c => c?.firstName).join(', ')}`,
        person.notes && `Notes: ${person.notes}`
    ].filter(Boolean).join('. ');

    const prompt = `
        Generate a short, engaging biographical narrative for the following person, written in a respectful, historical summary style.
        Do not just list the facts, but weave them into a story.
        If dates are available, mention them.
        The story should be about 3-4 paragraphs long.
        
        Person's Details:
        ${details}

        Based on these details, write their life story.
    `;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
        });

        return response.text;
    } catch (error) {
        console.error("Error generating life story with Gemini API:", error);
        return "An error occurred while generating the life story. Please check the console for more details.";
    }
};

const translateText = async (text: string, targetLanguage: string): Promise<string> => {
    if (!text || !targetLanguage) {
        return "Missing text or language for translation.";
    }

    const prompt = `
        Translate the following text to ${targetLanguage}.
        Provide only the translated text, without any additional comments, introductions, or formatting.

        Text to translate:
        """
        ${text}
        """
    `;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
        });
        return response.text;
    } catch (error) {
        console.error(`Error translating text to ${targetLanguage} with Gemini API:`, error);
        return `An error occurred while translating the text. Please check the console for more details.`;
    }
};

// --- From components/ui/Icons.tsx ---
const iconProps = {
  className: "w-5 h-5",
  strokeWidth: 1.5,
  stroke: "currentColor",
  fill: "none",
};

const MoonIcon = () => <svg {...iconProps} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" /></svg>;
const SunIcon = () => <svg {...iconProps} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-6.364-.386l1.591-1.591M3 12h2.25m.386-6.364l1.591 1.591M12 12a2.25 2.25 0 00-2.25 2.25 2.25 2.25 0 002.25 2.25 2.25 2.25 0 002.25-2.25 2.25 2.25 0 00-2.25-2.25z" /></svg>;
const UsersIcon = () => <svg {...iconProps} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.101a11.969 11.969 0 01-.849-3.734c0-1.298.368-2.52.998-3.557M8.624 21a9.986 9.986 0 01-3.624-1.928v-4.995c0-1.03.832-1.875 1.875-1.875h.5c.656 0 1.28.263 1.738.723l.004.004a1.875 1.875 0 01.723 1.738v.5c0 1.042-.832 1.875-1.875 1.875h-.5M15 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" /></svg>;
const UserIcon = () => <svg {...iconProps} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>;
const ArrowDownOnSquareIcon = () => <svg {...iconProps} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 3H5.25A2.25 2.25 0 003 5.25v13.5A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V15M9 12l3 3m0 0l3-3m-3 3V3" /></svg>;
const DocumentArrowUpIcon = () => <svg {...iconProps} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>;
const SaveIcon = () => <svg {...iconProps} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 13.5l3 3m0 0l3-3m-3 3v-6m1.06-4.19l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" /></svg>;
const ArrowUpTrayIcon = () => <svg {...iconProps} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>;
const PlusIcon = () => <svg {...iconProps} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>;
const MinusIcon = () => <svg {...iconProps} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" /></svg>;
const TrashIcon = () => <svg {...iconProps} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>;
const PencilIcon = () => <svg {...iconProps} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" /></svg>;
const ArrowUpIcon = () => <svg {...iconProps} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg>;
const ArrowDownIcon = () => <svg {...iconProps} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>;
const ChevronLeftIcon = () => <svg {...iconProps} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>;
const ChevronRightIcon = () => <svg {...iconProps} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>;
const PrintIcon = () => <svg {...iconProps} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.061A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.279A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5z" /></svg>;
const SpinnerIcon = () => <svg {...iconProps} className="w-5 h-5 animate-spin" fill="currentColor" viewBox="0 0 24 24"><path d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25"/><path d="M10.72,19.9a8,8,0,0,1-6.5-9.79A7.77,7.77,0,0,1,10.4,4.16a8,8,0,0,1,9.49,6.52A1.54,1.54,0,0,0,21.38,12h.13a1.35,1.35,0,0,0,1.38-1.54,11,11,0,1,0-12.7,12.39A1.5,1.5,0,0,0,12,21.34h0A1.47,1.47,0,0,0,10.72,19.9Z"/></svg>;
const symbolIconProps = { ...iconProps, className: "w-12 h-12 text-gray-400 dark:text-gray-500", };
const MaleSymbolIcon = () => <svg {...symbolIconProps} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.994 13.999a7.5 7.5 0 100-10.002 7.5 7.5 0 000 10.002z" /><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 7.5l-6.51-6.51M21 3h-6v6" /></svg>;
const FemaleSymbolIcon = () => <svg {...symbolIconProps} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 12a5.25 5.25 0 100 10.5 5.25 5.25 0 000-10.5z" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 12.75V3m-2.25 2.25h4.5" /></svg>;
const GraveIcon = () => <svg {...iconProps} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-4H7v4h10m0-12H7v5h10V9m-7 2h4m-4 3h4m-1-8c0-1.66-1.34-3-3-3s-3 1.34-3 3v1h6V6Z" /></svg>;

// --- From components/ui/Button.tsx ---
const Button = ({ children, variant = 'primary', size = 'md', className = '', ...props }: { children: React.ReactNode; variant?: 'primary' | 'secondary' | 'danger'; size?: 'sm' | 'md'; className?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) => {
  const baseClasses = "rounded-md font-semibold focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 flex items-center justify-center";
  const sizeClasses = { md: "px-4 py-2 text-sm", sm: "px-2 py-1 text-xs" };
  const variantClasses = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500",
    secondary: "bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 focus:ring-gray-500",
    danger: "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500",
  };
  return <button className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`} {...props}>{children}</button>;
};

// --- From components/ui/Input.tsx ---
const Input = ({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) => {
  return (
    <div>
      <label htmlFor={props.id || props.name} className="block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
      <input {...props} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
    </div>
  );
};

// --- From components/ui/Select.tsx ---
const Select = ({ label, children, className = '', ...props }: { label: string; children: React.ReactNode; className?: string } & React.SelectHTMLAttributes<HTMLSelectElement>) => {
  const baseClasses = "mt-1 block w-full pl-3 pr-10 py-2 text-base border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md";
  return (
    <div>
      <label htmlFor={props.id || props.name} className="block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
      <select {...props} className={`${baseClasses} ${className}`}>{children}</select>
    </div>
  );
};

// --- From components/ui/Tooltip.tsx ---
const Tooltip = ({ text, children }: { text: string; children: React.ReactNode }) => {
  return (
    <div className="relative group flex items-center">
      {children}
      <div className="absolute top-full mt-2 w-max bg-gray-700 text-white text-xs rounded-md py-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none transform -translate-x-1/2 left-1/2 z-20">
        {text}
      </div>
    </div>
  );
};

// --- From components/ui/Modal.tsx ---
interface ModalProps {
  isOpen: boolean;
  onClose: (event?: React.MouseEvent<HTMLDivElement | HTMLButtonElement>) => void;
  title: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  headerActions?: React.ReactNode;
}
const Modal = forwardRef<HTMLDivElement, ModalProps>(({ isOpen, onClose, title, children, className = '', headerActions }, ref) => {
  if (!isOpen) return null;
  return (
    <div ref={ref} className={`fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center ${className}`} onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 animate-fadeIn printable-area" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start border-b pb-3 border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold flex-grow">{title}</h2>
          <div className="flex-shrink-0 flex items-center space-x-2 ml-4 no-print">
            {headerActions}
            <button onClick={onClose} className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white">&times;</button>
          </div>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
});
Modal.displayName = 'Modal';

// --- From hooks/useFamilyTree.ts ---
const FamilyTreeContext = createContext<ReturnType<typeof useFamilyTree> | null>(null);

const useFamilyTree = () => {
    const [data, setData] = useState({ trees: {}, activeTreeId: '' });
    const [isLoading, setIsLoading] = useState(true);
    const [treeViewConfig, setTreeViewConfig] = useState<{ rootId: string; visiblePath: string[] } | null>(null);
    const { trees, activeTreeId } = data;

    useEffect(() => {
        const loadData = async () => {
            try {
                const [loadedTrees, loadedActiveTreeId] = await Promise.all([getAllTrees(), getAppState('activeTreeId')]);
                if (Object.keys(loadedTrees).length > 0) {
                    const activeId = loadedActiveTreeId && loadedTrees[loadedActiveTreeId] ? loadedActiveTreeId : Object.keys(loadedTrees)[0];
                    setData({ trees: loadedTrees, activeTreeId: activeId });
                } else {
                    const defaultTreeId = uuidv4();
                    const defaultTree = { id: defaultTreeId, name: 'My First Tree', people: [] };
                    await saveTree(defaultTree);
                    await saveAppState('activeTreeId', defaultTreeId);
                    setData({ trees: { [defaultTreeId]: defaultTree }, activeTreeId: defaultTreeId });
                }
            } catch (error) {
                console.error("Failed to load data from IndexedDB", error);
                alert("Error: Could not load family data. Your browser may not support IndexedDB or it may be in a private/incognito mode.");
            } finally {
                setIsLoading(false);
            }
        };
        loadData();
    }, []);

    const activeTree = trees[activeTreeId];
    const people = activeTree ? activeTree.people : [];

    const updatePeople = useCallback(async (newPeople: Person[]) => {
        if (!activeTreeId || !activeTree) return;
        const updatedTree = { ...activeTree, people: newPeople };
        setData(prevData => ({ ...prevData, trees: { ...prevData.trees, [activeTreeId]: updatedTree }}));
        await saveTree(updatedTree);
    }, [activeTreeId, activeTree]);

    const createNewTree = async (name: string) => {
        const newTreeId = uuidv4();
        const newTree = { id: newTreeId, name, people: [] };
        setData(prevData => ({ activeTreeId: newTreeId, trees: { ...prevData.trees, [newTreeId]: newTree }}));
        await saveTree(newTree);
        await saveAppState('activeTreeId', newTreeId);
    };

    const switchTree = async (treeId: string) => {
        if (trees[treeId]) {
            setData(prevData => ({ ...prevData, activeTreeId: treeId }));
            await saveAppState('activeTreeId', treeId);
        }
    };

    const deleteTree = async (treeId: string) => {
        const newTrees = { ...trees };
        delete newTrees[treeId];
        const remainingTreeIds = Object.keys(newTrees);
        let newActiveTreeId = activeTreeId;
        if (newActiveTreeId === treeId) {
            newActiveTreeId = remainingTreeIds.length > 0 ? remainingTreeIds[0] : '';
        }
        setData({ trees: newTrees, activeTreeId: newActiveTreeId });
        await deleteTreeFromDB(treeId);
        await saveAppState('activeTreeId', newActiveTreeId);
    };
    
    const addSpouseRelationship = (p1Id: string, p2Id: string, currentPeople: Person[]) => {
        const p1Index = currentPeople.findIndex(p => p.id === p1Id);
        const p2Index = currentPeople.findIndex(p => p.id === p2Id);
        if (p1Index === -1 || p2Index === -1) return;

        const p1 = currentPeople[p1Index];
        const p2 = currentPeople[p2Index];

        if (!p1.marriages?.some(m => m.spouseId === p2Id)) p1.marriages = [...(p1.marriages || []), { spouseId: p2Id, status: MarriageStatus.Married }];
        if (!p2.marriages?.some(m => m.spouseId === p1Id)) p2.marriages = [...(p2.marriages || []), { spouseId: p1Id, status: MarriageStatus.Married }];
    };

    const addChildToParent = (childId: string, parentId: string, currentPeople: Person[]) => {
        const parentIndex = currentPeople.findIndex(p => p.id === parentId);
        if (parentIndex !== -1) {
            const parent = currentPeople[parentIndex];
            if (!parent.childrenIds?.includes(childId)) parent.childrenIds = [...(parent.childrenIds || []), childId];
        }
    };
    
    const removeChildFromParent = (childId: string, parentId: string, currentPeople: Person[]) => {
        const parentIndex = currentPeople.findIndex(p => p.id === parentId);
        if (parentIndex !== -1) currentPeople[parentIndex].childrenIds = currentPeople[parentIndex].childrenIds?.filter(id => id !== childId);
    };

    const addPerson = async (personData: Omit<Person, 'id' | 'childrenIds' | 'marriages'>) => {
        const newPerson: Person = { ...personData, id: uuidv4(), childrenIds: [], marriages: [] };
        let newPeople = [...people, newPerson];
        if (newPerson.parentIds && newPerson.parentIds.length === 2) {
            const [p1Id, p2Id] = newPerson.parentIds;
            addSpouseRelationship(p1Id, p2Id, newPeople);
            addChildToParent(newPerson.id, p1Id, newPeople);
            addChildToParent(newPerson.id, p2Id, newPeople);
        }
        await updatePeople(newPeople);
    };

    const updatePerson = async (personId: string, updatedData: Partial<Person>) => {
        let newPeople = [...people];
        const personIndex = newPeople.findIndex(p => p.id === personId);
        if (personIndex === -1) return;
        const oldPerson = newPeople[personIndex];

        if (updatedData.parentIds && JSON.stringify(oldPerson.parentIds) !== JSON.stringify(updatedData.parentIds)) {
            if (oldPerson.parentIds) oldPerson.parentIds.forEach(parentId => removeChildFromParent(personId, parentId, newPeople));
            if (updatedData.parentIds) {
                if (updatedData.parentIds.length === 2) addSpouseRelationship(updatedData.parentIds[0], updatedData.parentIds[1], newPeople);
                updatedData.parentIds.forEach(parentId => addChildToParent(personId, parentId, newPeople));
            }
        }
        if (updatedData.marriages) {
            const oldMarriages = oldPerson.marriages || [];
            const newMarriages = updatedData.marriages;
            const oldSpouseIds = oldMarriages.map(m => m.spouseId);
            const newSpouseIds = newMarriages.map(m => m.spouseId);

            const removedSpouseIds = oldSpouseIds.filter(id => !newSpouseIds.includes(id));
            for (const spouseId of removedSpouseIds) {
                const spouseIndex = newPeople.findIndex(p => p.id === spouseId);
                if (spouseIndex !== -1) newPeople[spouseIndex].marriages = newPeople[spouseIndex].marriages?.filter(m => m.spouseId !== personId);
            }
            for (const marriage of newMarriages) {
                const spouseIndex = newPeople.findIndex(p => p.id === marriage.spouseId);
                if (spouseIndex !== -1) {
                    const spouse = newPeople[spouseIndex];
                    const reciprocalMarriage = { ...marriage, spouseId: personId };
                    const existingMarriageIndex = spouse.marriages?.findIndex(m => m.spouseId === personId) ?? -1;
                    if (existingMarriageIndex !== -1 && spouse.marriages) spouse.marriages[existingMarriageIndex] = reciprocalMarriage;
                    else spouse.marriages = [...(spouse.marriages || []), reciprocalMarriage];
                }
            }
        }
        newPeople[personIndex] = { ...oldPerson, ...updatedData };
        await updatePeople(newPeople);
    };

    const deletePerson = async (personId: string) => {
        let newPeople = [...people];
        const personToDelete = newPeople.find(p => p.id === personId);
        if (!personToDelete) return;

        if (personToDelete.parentIds) personToDelete.parentIds.forEach(parentId => removeChildFromParent(personId, parentId, newPeople));
        if (personToDelete.childrenIds) personToDelete.childrenIds.forEach(childId => {
            const childIndex = newPeople.findIndex(p => p.id === childId);
            if (childIndex !== -1) newPeople[childIndex].parentIds = newPeople[childIndex].parentIds?.filter(id => id !== personId);
        });
        if (personToDelete.marriages) personToDelete.marriages.forEach(marriage => {
            const spouseIndex = newPeople.findIndex(p => p.id === marriage.spouseId);
            if (spouseIndex !== -1) newPeople[spouseIndex].marriages = newPeople[spouseIndex].marriages?.filter(m => m.spouseId !== personId);
        });
        await updatePeople(newPeople.filter(p => p.id !== personId));
    };

    const importGedcom = (file: File) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const newPeople = parseGedcom(e.target?.result as string);
                const treeName = file.name.replace(/\.ged$/i, '');
                const newTreeId = uuidv4();
                const newTree = { id: newTreeId, name: treeName, people: newPeople };
                setData(prev => ({ activeTreeId: newTreeId, trees: { ...prev.trees, [newTreeId]: newTree }}));
                await saveTree(newTree);
                await saveAppState('activeTreeId', newTreeId);
                alert(`Successfully imported ${newPeople.length} individuals into new tree "${treeName}".`);
            } catch (error) {
                console.error("GEDCOM parsing error:", error);
                alert("Failed to parse GEDCOM file. Please check the file format and console for details.");
            }
        };
        reader.readAsText(file);
    };

    const exportGedcom = (treeId: string) => {
        const treeToExp = trees[treeId];
        if (!treeToExp) return alert("No active tree to export.");
        try {
            const gedcomString = exportToGedcom(treeToExp.people);
            const blob = new Blob([gedcomString], { type: 'text/plain;charset=utf-8' });
            saveAs(blob, `${treeToExp.name.replace(/\s/g, '_')}.ged`);
        } catch (error) {
            console.error("GEDCOM export error:", error);
            alert("Failed to export to GEDCOM. See console for details.");
        }
    };
    
    const backupActiveTree = () => {
        const treeToBackup = trees[activeTreeId];
        if (!treeToBackup) return alert("No active tree to backup.");
        try {
            const backupData = JSON.stringify(treeToBackup, null, 2);
            const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
            let baseName = treeToBackup.name.replace(/\s\(Restored .*\)$/, '').replace(/_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/, '').trim();
            const filename = `${baseName.replace(/\s/g, '_')}_${timestamp}.json`;
            const blob = new Blob([backupData], { type: 'application/json;charset=utf-8' });
            saveAs(blob, filename);
        } catch (error) {
            console.error("Backup error:", error);
            alert("Failed to create backup. See console for details.");
        }
    };

    const importBackup = (file: File) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const importedTreeData = JSON.parse(e.target?.result as string);
                if (!importedTreeData || typeof importedTreeData !== 'object' || !importedTreeData.name || !Array.isArray(importedTreeData.people)) throw new Error("Invalid backup file format.");
                const newTreeId = uuidv4();
                const timestamp = new Date().toISOString().split('T')[0];
                const newTree = { ...importedTreeData, id: newTreeId, name: `${importedTreeData.name.replace(/\s\(Restored .*\)$/, '')} (Restored ${timestamp})` };
                setData(prev => ({ activeTreeId: newTreeId, trees: { ...prev.trees, [newTreeId]: newTree } }));
                await saveTree(newTree);
                await saveAppState('activeTreeId', newTreeId);
                alert(`Successfully imported tree. It has been added as "${newTree.name}" and is now active.`);
            } catch (error) {
                console.error("Backup import error:", error);
                alert("Failed to import backup file. Please check the file format and console for details.");
            }
        };
        reader.readAsText(file);
    };

    const getPersonById = useCallback((id: string) => people.find(p => p.id === id), [people]);
    const configureTreeView = (config: { rootId: string; visiblePath: string[] } | null) => setTreeViewConfig(config);

    return { isLoading, trees, activeTreeId, activeTree, people, getPersonById, addPerson, updatePerson, deletePerson, createNewTree, switchTree, deleteTree, importGedcom, exportGedcom, backupActiveTree, importBackup, treeViewConfig, configureTreeView };
};

const useFamilyTreeContext = () => {
    const context = useContext(FamilyTreeContext);
    if (!context) throw new Error('useFamilyTreeContext must be used within a FamilyTreeProvider');
    return context;
};

// --- From components/ui/SearchableSelect.tsx ---
const SearchableSelect = ({ options, value, onChange, placeholder = 'Select an option', label, className = '' }: {
  options: Person[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
}) => {
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
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [wrapperRef]);
  
  const filteredOptions = options.filter(opt => getFullName(opt).toLowerCase().includes(searchTerm.toLowerCase()));
  const handleSelect = (optionId: string) => { onChange(optionId); setSearchTerm(''); setIsOpen(false); };
  const handleToggle = () => { setIsOpen(!isOpen); if(isOpen) setSearchTerm(''); };

  return (
    <div className="relative w-full" ref={wrapperRef}>
      {label && <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>}
      <button type="button" className={`w-full p-2 border rounded bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-600 focus:ring-blue-500 focus:border-blue-500 text-left flex justify-between items-center ${className}`} onClick={handleToggle}>
        <span className="truncate">{selectedOption ? getFullName(selectedOption) : placeholder}</span>
        <span className="text-gray-400">▼</span>
      </button>
      {isOpen && (
        <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-y-auto">
          <div className="p-2 border-b border-gray-200 dark:border-gray-700">
            <input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full p-2 border rounded bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600" autoFocus />
          </div>
          <ul>
             <li key="unknown-option" className="px-4 py-2 text-gray-500 italic hover:bg-blue-100 dark:hover:bg-blue-900/50 cursor-pointer" onClick={() => handleSelect('')}>{placeholder}</li>
            {filteredOptions.length > 0 ? filteredOptions.map(opt => (
              <li key={opt.id} className="px-4 py-2 hover:bg-blue-100 dark:hover:bg-blue-900/50 cursor-pointer flex items-center space-x-2" onClick={() => handleSelect(opt.id)}>
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

// --- From components/ImageEditor.tsx ---
const ImageEditor = ({ imageSrc, onClose, onSave }: { imageSrc: string, onClose: () => void, onSave: (img: string) => void }) => {
    const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [rotation, setRotation] = useState(0);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => setCroppedAreaPixels(croppedAreaPixels), []);

    const handleSave = useCallback(async () => {
        if (!croppedAreaPixels) return;
        setIsSaving(true);
        try {
            const croppedImage = await getCroppedImg(imageSrc, croppedAreaPixels, rotation);
            const compressedImage = await compressImage(croppedImage);
            onSave(compressedImage);
        } catch (e) {
            console.error(e);
            alert('An error occurred while cropping the image.');
        } finally {
            setIsSaving(false);
            onClose();
        }
    }, [imageSrc, croppedAreaPixels, rotation, onSave, onClose]);

    return (
        <Modal isOpen={true} onClose={onClose} title="Edit Photo">
            <div className="relative w-full h-96 bg-gray-200 dark:bg-gray-900">
                <Cropper image={imageSrc} crop={crop} zoom={zoom} rotation={rotation} aspect={1} onCropChange={setCrop} onZoomChange={setZoom} onRotationChange={setRotation} onCropComplete={onCropComplete} />
            </div>
            <div className="p-4 space-y-4">
                <div>
                    <label htmlFor="zoom" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Zoom</label>
                    <input id="zoom" type="range" value={zoom} min={1} max={3} step={0.1} onChange={(e) => setZoom(Number(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700" aria-label="Zoom slider" />
                </div>
                 <div>
                    <label htmlFor="rotation" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Rotation</label>
                    <input id="rotation" type="range" value={rotation} min={0} max={360} step={1} onChange={(e) => setRotation(Number(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700" aria-label="Rotation slider" />
                </div>
            </div>
            <div className="flex justify-end space-x-2 p-4 border-t border-gray-200 dark:border-gray-700">
                <Button variant="secondary" onClick={onClose}>Cancel</Button>
                <Button onClick={handleSave} disabled={isSaving}>{isSaving ? 'Saving...' : 'Save Photo'}</Button>
            </div>
        </Modal>
    );
};

// --- From components/PersonForm.tsx ---
function PersonForm({ isOpen, onClose, personToEdit }: { isOpen: boolean, onClose: () => void, personToEdit?: Person }) {
  const { people, addPerson, updatePerson, getPersonById } = useFamilyTreeContext();
  const [formData, setFormData] = useState<Partial<Person>>({});
  const [newSpouseId, setNewSpouseId] = useState('');
  const [editingImageSrc, setEditingImageSrc] = useState<string | null>(null);
  const [imageFilesToProcess, setImageFilesToProcess] = useState<File[]>([]);

  const initialFormState: Partial<Person> = { firstName: '', lastName: '', familyCast: '', gender: Gender.Male, parentIds: [], marriages: [], photos: [] };

  useEffect(() => {
    if (personToEdit) setFormData(personToEdit);
    else setFormData(initialFormState);
    setNewSpouseId('');
  }, [personToEdit, isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleParentChange = (value: string, parentIndex: number) => {
    const newParentIds = [...(formData.parentIds || [])];
    newParentIds[parentIndex] = value;
    if (newParentIds[0] && newParentIds[0] === newParentIds[1]) return alert("A person cannot be their own sibling's parent.");
    setFormData(prev => ({ ...prev, parentIds: newParentIds }));
  };

  const handleMarriageChange = (index: number, field: keyof Marriage, value: string) => {
    const newMarriages = [...(formData.marriages || [])];
    newMarriages[index] = { ...newMarriages[index], [field]: value };
    setFormData(prev => ({ ...prev, marriages: newMarriages as Marriage[] }));
  };
  
  const addMarriage = () => {
    if (!newSpouseId) return;
    const newMarriages = [...(formData.marriages || []), { spouseId: newSpouseId, status: MarriageStatus.Married }];
    setFormData(prev => ({ ...prev, marriages: newMarriages }));
    setNewSpouseId('');
  };

  const removeMarriage = (spouseId: string) => setFormData(prev => ({ ...prev, marriages: prev.marriages?.filter(m => m.spouseId !== spouseId) }));
  
  const processNextImage = (queue: File[]) => {
      if (queue.length === 0) return setEditingImageSrc(null);
      const reader = new FileReader();
      reader.readAsDataURL(queue[0]);
      reader.onload = (event) => setEditingImageSrc(event.target?.result as string);
      reader.onerror = () => processNextImage(queue.slice(1));
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const filesArray = Array.from(e.target.files || []);
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
    setFormData(prev => ({ ...prev, photos: [...(prev.photos || []), croppedImage]}));
    handleEditorClose();
  };

  const handleRemovePhoto = (index: number) => setFormData(prev => ({ ...prev, photos: prev.photos?.filter((_, i) => i !== index) }));
  const handleSetDisplayPhoto = (index: number) => {
    if (!formData.photos || index === 0) return;
    const newPhotos = [...formData.photos];
    const [item] = newPhotos.splice(index, 1);
    newPhotos.unshift(item);
    setFormData(prev => ({ ...prev, photos: newPhotos }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.firstName) return alert('First Name is required.');
    if (personToEdit) updatePerson(personToEdit.id, formData);
    else addPerson(formData as Omit<Person, 'id'|'childrenIds'|'marriages'>);
    onClose();
  };
  
  const potentialFathers = people.filter(p => p.gender === Gender.Male && p.id !== personToEdit?.id);
  const potentialMothers = people.filter(p => p.gender === Gender.Female && p.id !== personToEdit?.id);

  const potentialSpouses = useMemo(() => {
    return people.filter(p => {
        if (p.id === personToEdit?.id || formData.marriages?.some(m => m.spouseId === p.id)) return false;
        if (formData.gender === Gender.Male) return p.gender === Gender.Female;
        if (formData.gender === Gender.Female) return p.gender === Gender.Male;
        return p.gender === Gender.Male || p.gender === Gender.Female;
    });
  }, [people, personToEdit, formData.gender, formData.marriages]);
  
  const spouseListGender = potentialSpouses.length > 0 ? potentialSpouses[0].gender : null;
  const spouseSelectClass = spouseListGender === Gender.Male ? 'bg-male dark:bg-male-dark border-male-border' : spouseListGender === Gender.Female ? 'bg-female dark:bg-female-dark border-female-border' : '';
  const genderClass = formData.gender === Gender.Male ? 'bg-male dark:bg-male-dark border-male-border' : formData.gender === Gender.Female ? 'bg-female dark:bg-female-dark border-female-border' : '';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={personToEdit ? `Edit ${getFullName(formData)}` : 'Add New Person'}>
      <form onSubmit={handleSubmit} className="space-y-6">
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
        <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Photos</h3>
             <div>
                <label htmlFor="photo-upload" className="sr-only">Upload photos</label>
                <div className="mt-1 p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-md">
                    <input type="file" id="photo-upload" multiple accept="image/*" onChange={handlePhotoUpload} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 dark:file:bg-blue-900/50 file:text-blue-700 dark:file:text-blue-300 hover:file:bg-blue-100" />
                    <p className="text-xs text-gray-500 mt-1">Upload one or more images. After selection, an editor will open to crop and rotate.</p>
                </div>
            </div>
            {formData.photos && formData.photos.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mt-4">
                    {formData.photos.map((photo, index) => (
                        <div key={index} className="relative group aspect-square">
                            <img src={photo} alt={`Photo ${index + 1}`} className="w-full h-full object-cover rounded-md" />
                            {index === 0 && <span className="absolute top-1 left-1 bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded">Display Pic</span>}
                            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-60 transition-all flex items-center justify-center">
                                <div className="flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button type="button" onClick={() => handleRemovePhoto(index)} title="Remove Photo" className="p-1.5 bg-red-600 text-white rounded-full hover:bg-red-700 shadow-lg"><TrashIcon /></button>
                                    {index > 0 && <button type="button" onClick={() => handleSetDisplayPhoto(index)} title="Make Display Picture" className="p-1.5 bg-blue-600 text-white rounded-full hover:bg-blue-700 shadow-lg"><ArrowUpIcon /></button>}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
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
        <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Family Relationships</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SearchableSelect label="Father" options={potentialFathers} value={formData.parentIds?.[0] || ''} onChange={(value) => handleParentChange(value, 0)} className="bg-male dark:bg-male-dark border-male-border" placeholder="Unknown" />
                <SearchableSelect label="Mother" options={potentialMothers} value={formData.parentIds?.[1] || ''} onChange={(value) => handleParentChange(value, 1)} className="bg-female dark:bg-female-dark border-female-border" placeholder="Unknown" />
            </div>
             <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Spouses</label>
                {formData.marriages?.map((marriage, index) => {
                    const spouse = getPersonById(marriage.spouseId);
                    return spouse ? (
                        <div key={index} className="flex items-center space-x-2 mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded-md">
                           <div className="flex-grow font-semibold">{getFullName(spouse)}</div>
                           <div className="w-40"><Select label="Status" value={marriage.status} onChange={(e) => handleMarriageChange(index, 'status', e.target.value)}>{Object.values(MarriageStatus).map(s => <option key={s} value={s}>{s}</option>)}</Select></div>
                           <div className="w-48"><Input label="Date" type="date" value={marriage.date || ''} onChange={(e) => handleMarriageChange(index, 'date', e.target.value)} /></div>
                           <div className="flex-grow"><Input label="Place" placeholder="Place of marriage" value={marriage.place || ''} onChange={(e) => handleMarriageChange(index, 'place', e.target.value)} /></div>
                            <button type="button" onClick={() => removeMarriage(marriage.spouseId)} className="p-2 text-red-500 hover:text-red-700 rounded-full hover:bg-red-100 dark:hover:bg-red-900/50"><TrashIcon /></button>
                        </div>
                    ) : null;
                })}
                <div className="flex items-end space-x-2 mt-4">
                    <div className="flex-grow">
                         <SearchableSelect label="Add New Spouse" options={potentialSpouses} value={newSpouseId} onChange={setNewSpouseId} className={spouseSelectClass} placeholder="-- Select a Spouse --" />
                    </div>
                    <Button type="button" variant="secondary" onClick={addMarriage} disabled={!newSpouseId}>Add Spouse</Button>
                </div>
            </div>
             <div className="flex items-center mt-4">
                <input id="isAdopted" name="isAdopted" type="checkbox" checked={formData.isAdopted || false} onChange={handleChange} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <label htmlFor="isAdopted" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">This person is adopted</label>
            </div>
        </div>
        <div className="flex justify-end space-x-2 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit">Save Changes</Button>
        </div>
      </form>
       {editingImageSrc && <ImageEditor imageSrc={editingImageSrc} onClose={handleEditorClose} onSave={handleEditorSave} />}
    </Modal>
  );
}

// --- From components/PeopleList.tsx ---
const PeopleList = ({ openPersonForm }: { openPersonForm: (person?: Person) => void }) => {
    const { people, deletePerson } = useFamilyTreeContext();
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [personToDelete, setPersonToDelete] = useState<Person | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'firstName' as keyof Person, direction: 'asc' });

    const handleAdd = () => openPersonForm(undefined);
    const handleEdit = (person: Person) => openPersonForm(person);
    const handleDelete = (person: Person) => { setPersonToDelete(person); setIsDeleteModalOpen(true); };
    
    const confirmDelete = () => {
        if (personToDelete) {
            deletePerson(personToDelete.id);
            setIsDeleteModalOpen(false);
            setPersonToDelete(null);
        }
    };
    
    const requestSort = (key: keyof Person) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
        setSortConfig({ key, direction });
    };

    const sortedAndFilteredPeople = useMemo(() => {
        let sortableItems = [...people];
        if (searchTerm) sortableItems = sortableItems.filter(p => getFullName(p).toLowerCase().includes(searchTerm.toLowerCase()));
        sortableItems.sort((a, b) => {
            const valA = a[sortConfig.key];
            const valB = b[sortConfig.key];
            if (valA === undefined || valA === null) return 1;
            if (valB === undefined || valB === null) return -1;
            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
        return sortableItems;
    }, [people, searchTerm, sortConfig]);
    
    const getSortIcon = (key: keyof Person) => {
        if (sortConfig.key !== key) return null;
        return sortConfig.direction === 'asc' ? <ArrowUpIcon /> : <ArrowDownIcon />;
    };

    return (
        <div className="bg-white dark:bg-gray-900 shadow-lg rounded-xl p-6 h-full flex flex-col">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">All Individuals ({people.length})</h2>
                <Button onClick={handleAdd}><PlusIcon /> <span className="ml-2">Add Person</span></Button>
            </div>
            <div className="mb-4"><input type="text" placeholder="Search by name..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full p-2 border rounded bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-600 focus:ring-blue-500 focus:border-blue-500" /></div>
            <div className="flex-grow overflow-auto">
                <table className="w-full text-left">
                    <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                        <tr>
                            {['Name', 'Born', 'Died', 'Age', 'Actions'].map((header, i) => {
                                const sortKey = i === 0 ? 'firstName' : i === 1 ? 'birthDate' : i === 2 ? 'deathDate' : null;
                                return (
                                <th key={header} className="p-3 text-sm font-semibold text-gray-600 dark:text-gray-300 tracking-wider">
                                     <div className="flex items-center space-x-1 cursor-pointer" onClick={() => sortKey && requestSort(sortKey as keyof Person)}>
                                        <span>{header}</span>
                                        {sortKey && getSortIcon(sortKey as keyof Person)}
                                    </div>
                                </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                        {sortedAndFilteredPeople.map(person => {
                             const genderClass = person.gender === Gender.Male ? 'bg-male dark:bg-male-dark border-l-4 border-male-border' : person.gender === Gender.Female ? 'bg-female dark:bg-female-dark border-l-4 border-female-border' : 'border-l-4 border-gray-500';
                            return (
                                <tr key={person.id} className={genderClass}>
                                    <td className="p-3 whitespace-nowrap"><div className="font-medium cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors" onClick={() => handleEdit(person)}>{getFullName(person)}</div><div className="text-sm text-gray-500 dark:text-gray-400">{person.gender}</div></td>
                                    <td className="p-3">{person.birthDate || 'N/A'}</td>
                                    <td className="p-3">{person.deathDate || 'N/A'}</td>
                                    <td className="p-3">{calculateAge(person.birthDate, person.deathDate)}</td>
                                    <td className="p-3"><div className="flex space-x-2"><button onClick={() => handleEdit(person)} className="p-1 text-gray-500 hover:text-blue-600 dark:hover:text-blue-400"><PencilIcon /></button><button onClick={() => handleDelete(person)} className="p-1 text-gray-500 hover:text-red-600 dark:hover:text-red-400"><TrashIcon /></button></div></td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
            <Modal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} title="Confirm Deletion">
                <div className="space-y-4">
                    <p>Are you sure you want to delete <strong>{getFullName(personToDelete)}</strong>? This will remove them from the tree and all associated relationships. This action cannot be undone.</p>
                    <div className="flex justify-end space-x-2"><Button variant="secondary" onClick={() => setIsDeleteModalOpen(false)}>Cancel</Button><Button variant="danger" onClick={confirmDelete}>Delete Person</Button></div>
                </div>
            </Modal>
        </div>
    );
};

// --- From components/FamilyTreeView.tsx ---
const FamilyTreeView = ({ openPersonForm }: { openPersonForm: (person: Person) => void }) => {
    const { people, getPersonById, treeViewConfig, configureTreeView } = useFamilyTreeContext();
    const treeContainerRef = useRef<HTMLDivElement>(null);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [zoom, setZoom] = useState(1);
    const [focusedPersonId, setFocusedPersonId] = useState<string | null>(null);
    const [childrenVisibleFor, setChildrenVisibleFor] = useState(new Set<string>());
    const [siblingsVisibleFor, setSiblingsVisibleFor] = useState<string | null>(null);
    const [ancestorsVisibleFor, setAncestorsVisibleFor] = useState(new Set<string>());
    const [activeSpouseIndices, setActiveSpouseIndices] = useState(new Map<string, number>());

    const renderRootId = useMemo(() => {
        if (!focusedPersonId) return null;
        const focusedPerson = getPersonById(focusedPersonId);
        if (!focusedPerson) return null;
        let finalRoot = focusedPerson;
        let current = focusedPerson;
        while(ancestorsVisibleFor.has(current.id) && current.parentIds) {
            const parent = current.parentIds.map(id => getPersonById(id)).find(p => p);
            if (parent) { finalRoot = parent; current = parent; } else break;
        }
        return finalRoot.id;
    }, [focusedPersonId, getPersonById, ancestorsVisibleFor]);
    
    const scrollToCard = (personId: string) => setTimeout(() => document.getElementById(`person-card-${personId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }), 100);

    useEffect(() => {
        if (treeViewConfig) {
            handleRootPersonChange(treeViewConfig.rootId);
            setChildrenVisibleFor(new Set(treeViewConfig.visiblePath));
            setTimeout(() => scrollToCard(treeViewConfig.rootId), 100);
            configureTreeView(null);
        }
    }, [treeViewConfig, configureTreeView]);

    useEffect(() => { if (renderRootId) scrollToCard(renderRootId); }, [renderRootId]);

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
            if (newSet.has(person.id)) newSet.delete(person.id);
            else {
                if (siblingsVisibleFor === person.id) setSiblingsVisibleFor(null);
                newSet.add(person.id);
            }
            return newSet;
        });
        scrollToCard(person.id);
    };

    const handleToggleChildren = (person: Person) => {
        setChildrenVisibleFor(prev => {
            const newSet = new Set(prev);
            if (newSet.has(person.id)) newSet.delete(person.id);
            else newSet.add(person.id);
            return newSet;
        });
        scrollToCard(person.id);
    };

    const handleNavigateToFamily = (person: Person) => handleRootPersonChange(person.id);
    const handleToggleSiblings = (person: Person) => { setSiblingsVisibleFor(prev => (prev === person.id ? null : person.id)); scrollToCard(person.id); };

    const handleSwitchSpouse = (personId: string, direction: 'next' | 'prev') => {
        const person = getPersonById(personId);
        if (!person || !person.marriages || person.marriages.length <= 1) return;
        setActiveSpouseIndices(prev => {
            const newMap = new Map(prev);
            const currentIndex = newMap.get(personId) || 0;
            const numSpouses = person.marriages!.length;
            const nextIndex = direction === 'next' ? (currentIndex + 1) % numSpouses : (currentIndex - 1 + numSpouses) % numSpouses;
            newMap.set(personId, nextIndex);
            return newMap;
        });
    };

    const handleDownloadReport = async () => {
        if (!treeContainerRef.current) return;
        const personForFilename = getPersonById(focusedPersonId || renderRootId || '');
        if (!personForFilename) return alert("Please select a person to generate a report.");
        setIsGeneratingPdf(true);
        const fileName = `Family_Tree_for_${getFullName(personForFilename)}`;
        const printableElement = document.createElement('div');
        printableElement.style.cssText = 'position:absolute;left:-9999px;width:297mm;padding:20px;background-color:white;color:black;font-family:sans-serif;';
        printableElement.innerHTML = `<h1 style="font-size:28px;font-weight:bold;text-align:center;margin-bottom:20px;">Family Tree for ${getFullName(personForFilename)}</h1>`;
        printableElement.appendChild(treeContainerRef.current.cloneNode(true));
        document.body.appendChild(printableElement);
        try {
            await generatePdf(printableElement, fileName, 'l');
        } catch (error) {
            console.error("Error generating family tree PDF:", error);
            alert("Sorry, an error occurred while generating the PDF report.");
        } finally {
            document.body.removeChild(printableElement);
            setIsGeneratingPdf(false);
        }
    };
    
    if (people.length === 0) return <div className="flex items-center justify-center h-full"><div className="text-center p-8 bg-gray-50 dark:bg-gray-800 rounded-lg shadow-md"><h3 className="text-xl font-semibold">Your Family Tree is Empty</h3><p className="mt-2 text-gray-600 dark:text-gray-400">Start by adding a person from the "All Individuals" page.</p><div className="mt-4"><UserIcon /></div></div></div>;

    const NodeCard = ({ person, isSpouse = false, onEdit, onToggleAncestors, onNavigateToFamily, onToggleChildren, onToggleSiblings, childrenVisible, siblingsVisible, ancestorsVisible, hasChildrenToShow, isChildCard = false, isSiblingCard = false, isFocalChild = false }: {
        person: Person; isSpouse?: boolean; onEdit: (p: Person) => void; onToggleAncestors: (p: Person) => void; onNavigateToFamily: (p: Person) => void; onToggleChildren: () => void; onToggleSiblings: (p: Person) => void; childrenVisible: boolean; siblingsVisible: boolean; ancestorsVisible: boolean; hasChildrenToShow: boolean; isChildCard?: boolean; isSiblingCard?: boolean; isFocalChild?: boolean;
    }) => {
        const genderClass = person.gender === Gender.Male ? 'border-male-border bg-male dark:bg-male-dark' : person.gender === Gender.Female ? 'border-female-border bg-female dark:bg-female-dark' : 'border-gray-500';
        const hasParents = person.parentIds?.some(id => !!id);
        const getSiblings = (p: Person, all: Person[]) => !p.parentIds ? [] : all.filter(other => other.id !== p.id && other.parentIds && other.parentIds.some(pid => new Set(p.parentIds!.filter(id=>id)).has(pid)));
        const hasSiblings = getSiblings(person, people).length > 0;
        const buttonBaseClass = "bg-gray-100 dark:bg-gray-700 rounded-full p-1 shadow-lg hover:bg-gray-200 dark:hover:bg-gray-600 hover:scale-110 transition-transform";

        return (
            <div id={`person-card-${person.id}`} className="relative mt-2 mx-2">
                <div className={`p-3 rounded-lg shadow-md border-2 ${genderClass} w-64 flex-shrink-0 flex space-x-3 items-center`}>
                    <div className="flex-shrink-0 w-20 h-24 rounded-md flex items-center justify-center bg-gray-200 dark:bg-gray-700 overflow-hidden">
                        {person.photos?.[0] ? <img src={person.photos[0]} alt={`${person.firstName}`} className="w-full h-full object-cover" /> : (
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

                <div className="absolute -top-2 -right-2 z-20"><Tooltip text="Edit Person"><button onClick={() => onEdit(person)} className={buttonBaseClass}><PencilIcon /></button></Tooltip></div>
                {hasParents && !isSpouse && !isChildCard && !isSiblingCard && (<div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10"><Tooltip text={ancestorsVisible ? "Hide Ancestors" : "Show Ancestors"}><button onClick={() => onToggleAncestors(person)} className={buttonBaseClass}>{ancestorsVisible ? <MinusIcon /> : <ArrowUpIcon />}</button></Tooltip></div>)}
                {isFocalChild && (<div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10"><Tooltip text="Hide Ancestors"><button onClick={() => onToggleAncestors(person)} className={buttonBaseClass}><MinusIcon /></button></Tooltip></div>)}
                {hasChildrenToShow && !isSpouse && (<div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 z-10"><Tooltip text={childrenVisible ? "Hide Children" : "Show Children"}><button onClick={onToggleChildren} className={buttonBaseClass}>{childrenVisible ? <MinusIcon /> : <ArrowDownIcon />}</button></Tooltip></div>)}
                {hasSiblings && !isSpouse && !isChildCard && !isSiblingCard && (<div className="absolute top-1/2 left-0 -translate-y-1/2 -translate-x-1/2 z-10"><Tooltip text={siblingsVisible ? "Hide Siblings" : "Show Siblings"}><button onClick={() => onToggleSiblings(person)} className={buttonBaseClass}>{siblingsVisible ? <MinusIcon /> : <ChevronLeftIcon />}</button></Tooltip></div>)}
                {isSpouse && (<div className="absolute top-1/2 right-0 -translate-y-1/2 translate-x-1/2 z-10"><Tooltip text="Focus on This Person's Family"><button onClick={() => onNavigateToFamily(person)} className={buttonBaseClass}><ChevronRightIcon /></button></Tooltip></div>)}
            </div>
        );
    };

    const FamilyNode = ({ personId, ...props }: { personId: string; onEdit: (p: Person) => void; onToggleAncestors: (p: Person) => void; onNavigateToFamily: (p: Person) => void; onToggleChildren: (p: Person) => void; onSwitchSpouse: (personId: string, direction: 'next' | 'prev') => void; onToggleSiblings: (p: Person) => void; processedIds: Set<string>; allPeople: Person[]; siblingsVisibleFor: string | null; childrenVisibleFor: Set<string>; ancestorsVisibleFor: Set<string>; activeSpouseIndices: Map<string, number>; isChildCard?: boolean; isFocalChildNode?: boolean; }) => {
        const person = getPersonById(personId);
        if (!person || props.processedIds.has(personId)) return null;

        const { allPeople, onEdit, onToggleAncestors, onNavigateToFamily, onToggleChildren, onSwitchSpouse, onToggleSiblings, siblingsVisibleFor, childrenVisibleFor, ancestorsVisibleFor, activeSpouseIndices, isChildCard = false, isFocalChildNode = false } = props;
        
        const primaryPerson = person;
        const activeSpouseIndex = activeSpouseIndices.get(primaryPerson.id) || 0;
        const currentMarriage = primaryPerson.marriages?.[activeSpouseIndex];
        const spouse = currentMarriage ? getPersonById(currentMarriage.spouseId) : undefined;
        
        const getSiblings = (p: Person, all: Person[]) => !p.parentIds ? [] : all.filter(other => other.id !== p.id && other.parentIds && other.parentIds.some(pid => new Set(p.parentIds!.filter(id=>id)).has(pid))).sort((a,b) => (a.birthDate || '').localeCompare(b.birthDate || ''));
        const shouldShowSiblings = siblingsVisibleFor === person.id;
        const siblings = shouldShowSiblings ? getSiblings(person, allPeople) : [];

        const displayableChildren = (primaryPerson.childrenIds || [])?.map(id => getPersonById(id)).filter((c): c is Person => !!c).filter(child => {
            const childParents = new Set(child.parentIds || []);
            if (!childParents.has(primaryPerson.id)) return false;
            if (spouse) return childParents.has(spouse.id);
            const otherParentId = child.parentIds?.find(pId => pId !== primaryPerson.id);
            if(otherParentId) {
                const otherParent = getPersonById(otherParentId);
                if (otherParent && primaryPerson.marriages?.some(m => m.spouseId === otherParentId)) return false;
            }
            return true;
        }).sort((a, b) => (a.birthDate || '').localeCompare(b.birthDate || ''));
        
        const hasChildrenToShow = displayableChildren.length > 0;
        const areChildrenExplicitlyToggled = childrenVisibleFor.has(primaryPerson.id);
        const navigatedUpFromChild = displayableChildren.find(child => ancestorsVisibleFor.has(child.id));
        const childrenToRender = areChildrenExplicitlyToggled ? displayableChildren : (navigatedUpFromChild ? [navigatedUpFromChild] : []);
        const areAncestorsVisible = ancestorsVisibleFor.has(person.id);
        const parentId = person.parentIds?.find(id => !!id);
        const parent = parentId ? getPersonById(parentId) : undefined;
        const newProcessedIds = new Set(props.processedIds);
        newProcessedIds.add(primaryPerson.id);
        if (spouse) newProcessedIds.add(spouse.id);
        const coupleWrapperClasses = spouse ? "p-4 border-2 border-dashed border-gray-400 dark:border-gray-600 rounded-xl" : "";

        return (
            <div className="flex flex-col items-center">
                {areAncestorsVisible && parent && (
                    <div className="flex flex-col items-center">
                        <FamilyNode personId={parent.id} {...props} processedIds={newProcessedIds} />
                        <div className="h-10 w-px bg-gray-400 dark:bg-gray-600"></div>
                    </div>
                )}
                <div className="flex items-start">
                    {shouldShowSiblings && siblings.length > 0 && (
                         <div className="flex items-center pr-4">
                            <div className="flex flex-row-reverse space-x-4 space-x-reverse p-4 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl">
                                {siblings.map(sib => <NodeCard key={sib.id} person={sib} onEdit={onEdit} onToggleAncestors={onToggleAncestors} onNavigateToFamily={onNavigateToFamily} onToggleChildren={() => onToggleChildren(sib)} onToggleSiblings={onToggleSiblings} childrenVisible={childrenVisibleFor.has(sib.id)} siblingsVisible={siblingsVisibleFor === sib.id} ancestorsVisible={ancestorsVisibleFor.has(sib.id)} hasChildrenToShow={!!sib.childrenIds?.length} isChildCard={isChildCard} isSiblingCard={true} />)}
                            </div>
                             <div className="w-8 h-px bg-gray-400 dark:bg-gray-600"></div>
                         </div>
                    )}
                    <div className="flex flex-col items-center">
                        <div className={coupleWrapperClasses}>
                            <div className="flex items-center justify-center">
                                <NodeCard person={primaryPerson} onEdit={onEdit} onToggleAncestors={onToggleAncestors} onNavigateToFamily={onNavigateToFamily} onToggleChildren={() => onToggleChildren(primaryPerson)} onToggleSiblings={onToggleSiblings} childrenVisible={areChildrenExplicitlyToggled} siblingsVisible={shouldShowSiblings} ancestorsVisible={areAncestorsVisible} hasChildrenToShow={hasChildrenToShow} isChildCard={isChildCard} isFocalChild={isFocalChildNode} />
                                {spouse && (<>
                                    <div className="flex items-center justify-center flex-col w-28 text-center px-2">
                                        <div className="text-xs text-gray-500 dark:text-gray-400"><div>{currentMarriage?.status || 'Married'}</div><div>{currentMarriage?.date || ''}</div></div>
                                        {primaryPerson.marriages && primaryPerson.marriages.length > 1 && (<div className="flex items-center space-x-2 mt-1"><Tooltip text="Previous Spouse"><button onClick={() => onSwitchSpouse(primaryPerson.id, 'prev')} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"><ChevronLeftIcon /></button></Tooltip><span className="text-xs font-mono">{activeSpouseIndex + 1}/{primaryPerson.marriages.length}</span><Tooltip text="Next Spouse"><button onClick={() => onSwitchSpouse(primaryPerson.id, 'next')} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"><ChevronRightIcon /></button></Tooltip></div>)}
                                    </div>
                                    <NodeCard person={spouse} isSpouse={true} onEdit={onEdit} onToggleAncestors={onToggleAncestors} onNavigateToFamily={onNavigateToFamily} onToggleChildren={() => onToggleChildren(spouse)} onToggleSiblings={onToggleSiblings} childrenVisible={childrenVisibleFor.has(spouse.id)} siblingsVisible={siblingsVisibleFor === spouse.id} ancestorsVisible={ancestorsVisibleFor.has(spouse.id)} hasChildrenToShow={false} isChildCard={isChildCard} />
                                </>)}
                            </div>
                        </div>
                        {childrenToRender.length > 0 && (
                            <div className="pt-10 relative">
                                <div className="absolute top-0 left-1/2 -translate-x-1/2 h-5 w-px bg-gray-400 dark:bg-gray-600"></div>
                                <div className="flex justify-center"><div className="flex flex-row items-start">
                                    {childrenToRender.map((child, index) => (
                                        <div key={child.id} className="relative flex flex-col items-center px-4">
                                            <div className="absolute bottom-full left-0 right-0 h-10">
                                                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-5 w-px bg-gray-400 dark:bg-gray-600"></div>
                                                 {childrenToRender.length > 1 && (<div className={`absolute bottom-5 h-px bg-gray-400 dark:bg-gray-600 ${index === 0 ? 'left-1/2 w-1/2' : index === childrenToRender.length - 1 ? 'right-1/2 w-1/2' : 'w-full'}`}></div>)}
                                            </div>
                                            <FamilyNode personId={child.id} {...props} processedIds={newProcessedIds} isChildCard={true} isFocalChildNode={navigatedUpFromChild?.id === child.id} />
                                        </div>
                                    ))}
                                </div></div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="bg-white dark:bg-gray-900 shadow-lg rounded-xl h-full flex flex-col relative">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center no-print">
                 <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex-shrink-0">Family Tree View</h2>
                 <div className="flex-grow mx-6 max-w-md"><SearchableSelect options={people} value={focusedPersonId || ''} onChange={handleRootPersonChange} placeholder="Select a person to start the tree" /></div>
                 <Button onClick={handleDownloadReport} disabled={isGeneratingPdf || !renderRootId}>{isGeneratingPdf ? <SpinnerIcon /> : <PrintIcon />}<span className="ml-2 hidden sm:inline">{isGeneratingPdf ? 'Generating...' : 'Download Report'}</span></Button>
            </div>
            <div className="absolute top-20 right-6 z-10 flex flex-col items-center space-y-2 no-print">
                <Tooltip text="Zoom In"><button onClick={() => setZoom(z => Math.min(z + 0.1, 2))} className="p-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-full shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700"><PlusIcon /></button></Tooltip>
                <Tooltip text="Zoom Out"><button onClick={() => setZoom(z => Math.max(z - 0.1, 0.3))} className="p-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-full shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700"><MinusIcon /></button></Tooltip>
                <Tooltip text="Reset Zoom"><button onClick={() => setZoom(1)} className="px-3 py-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-full shadow-lg text-sm font-bold hover:bg-gray-100 dark:hover:bg-gray-700">1x</button></Tooltip>
            </div>
            <div className="flex-grow overflow-auto p-8">
                <div ref={treeContainerRef} className="inline-block min-w-full" style={{transform: `scale(${zoom})`, transformOrigin: 'top center', transition: 'transform 0.2s ease-out'}}>
                {renderRootId ? (<FamilyNode personId={renderRootId} onEdit={handleEdit} onToggleAncestors={handleToggleAncestors} onNavigateToFamily={handleNavigateToFamily} onToggleChildren={handleToggleChildren} onSwitchSpouse={handleSwitchSpouse} onToggleSiblings={handleToggleSiblings} processedIds={new Set()} allPeople={people} siblingsVisibleFor={siblingsVisibleFor} childrenVisibleFor={childrenVisibleFor} ancestorsVisibleFor={ancestorsVisibleFor} activeSpouseIndices={activeSpouseIndices} />)
                : (<div className="flex items-center justify-center h-full pt-16"><div className="text-center p-8"><h3 className="text-xl font-semibold text-gray-700 dark:text-gray-200">Select a person to begin</h3><p className="mt-2 text-gray-500 dark:text-gray-400">Use the search bar above to find an individual and start building the tree.</p></div></div>)}
                </div>
            </div>
        </div>
    );
};

// --- From components/ReportsView.tsx (and its generators) ---
const getAncestorsHierarchically = (person: Person, allPeople: Person[]): { person: Person, level: number }[] => {
    const results: { person: Person, level: number }[] = [];
    if (!person.parentIds) return results;

    const queue: { personId: string; level: number }[] = (person.parentIds || []).map(id => ({ personId: id, level: 1 }));
    const visited = new Set<string>();
    const getPersonById = (id: string) => allPeople.find(p => p.id === id);

    while (queue.length > 0) {
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
            } else {
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

        const parents = person.parentIds?.map(id => getPersonById(id)).filter((p): p is Person => !!p) || [];
        const spouses = person.marriages?.map(m => getPersonById(m.spouseId)).filter((p): p is Person => !!p) || [];
        const children = person.childrenIds?.map(id => getPersonById(id)).filter((p): p is Person => !!p) || [];

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

const DescendantReportGenerator = () => {
    const { people, getPersonById, configureTreeView } = useFamilyTreeContext();
    const navigate = useNavigate();
    const [personId, setPersonId] = useState('');
    const [descendantReportData, setDescendantReportData] = useState<{ rootPerson: Person; descendants: { person: Person, relationship: string, generation: number }[] } | null>(null);
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

    const lifeEvents = useMemo(() => {
        if (!reportPerson?.birthDate) return [];

        const personStartDate = new Date(reportPerson.birthDate);
        const personEndDate = reportPerson.deathDate ? new Date(reportPerson.deathDate) : new Date();

        const isWithinLifespan = (eventDateStr: string | undefined): boolean => {
            if (!eventDateStr) return false;
            const eventDate = new Date(eventDateStr);
            return eventDate >= personStartDate && eventDate <= personEndDate;
        };

        const events: {date: string; age: string; event: string; type: 'birth' | 'death' | 'marriage'; details: string; relationship: string;}[] = [];

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

        const ancestors = getAncestorsHierarchically(reportPerson, people);
        ancestors.forEach(({ person: ancestor, level }) => {
            if (level > 2) return;
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

            const tableColumns = ['Age', 'Date', 'Event', 'Details', 'Relationship'];
            const tableRows = lifeEvents.map(event => [event.age, event.date, event.event, event.details, event.relationship]);
            const headerHeight = 15 + summaryImgHeight + 5;

            autoTable(doc, {
                head: [tableColumns],
                body: tableRows,
                startY: headerHeight,
                theme: 'grid',
                headStyles: { fillColor: [59, 130, 246] },
                didDrawPage: (data) => {
                    doc.setFontSize(18);
                    doc.setFont('helvetica', 'bold');
                    doc.text('Timeline of Life Events', margin, 15);
                    doc.addImage(summaryImgData, 'JPEG', margin, 20, summaryImgWidth, summaryImgHeight);
                },
                didParseCell: (data) => {
                    const event = lifeEvents[data.row.index];
                    if (event) {
                        const eventColor = {
                            birth: [209, 250, 229],
                            death: [254, 226, 226],
                            marriage: [254, 249, 195],
                        }[event.type];
                        if (eventColor) {
                            data.cell.styles.fillColor = eventColor as [number, number, number];
                        }
                    }
                },
                margin: { top: 20 + summaryImgHeight + 5 }
            });

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
                <p className="text-gray-500">Please select a person to view their life event timeline.</p>
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

const ReportsView = () => {
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

// --- From components/FamilyTimelineView.tsx ---
const FamilyTimelineView = () => {
    const { people, getPersonById } = useFamilyTreeContext();
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [filterPersonId, setFilterPersonId] = useState('');
    const [displayedPeople, setDisplayedPeople] = useState<Person[] | null>(null);
    const timelineContainerRef = useRef<HTMLDivElement>(null);

    const getTimelineAncestors = (person: Person, allPeople: Person[]): Person[] => {
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
                p.parentIds?.forEach(parentId => { if (!visited.has(parentId)) queue.push(parentId); });
            }
        }
        return ancestors;
    };

    const getTimelineDescendants = (person: Person, allPeople: Person[]): Person[] => {
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
                p.childrenIds?.forEach(childId => { if (!visited.has(childId)) queue.push(childId); });
            }
        }
        return descendants;
    };

    const getTimelineSiblings = (person: Person, allPeople: Person[]): Person[] => {
        if (!person.parentIds || person.parentIds.length === 0) return [];
        const parentIdSet = new Set(person.parentIds.filter(id => id));
        if (parentIdSet.size === 0) return [];
        return allPeople.filter(p => {
            if (p.id === person.id) return false;
            if (!p.parentIds) return false;
            return p.parentIds.some(pid => parentIdSet.has(pid));
        });
    };

    const getTimelineSpouses = (person: Person, getPersonByIdFn: (id: string) => Person | undefined): Person[] => {
         if (!person.marriages || person.marriages.length === 0) return [];
        return person.marriages.map(marriage => getPersonByIdFn(marriage.spouseId)).filter((p): p is Person => !!p);
    };

    const handleGenerate = () => {
        if (!filterPersonId) return;
        const person = people.find(p => p.id === filterPersonId);
        if (!person) return;
        const ancestors = getTimelineAncestors(person, people);
        const descendants = getTimelineDescendants(person, people);
        const siblings = getTimelineSiblings(person, people);
        const spouses = getTimelineSpouses(person, getPersonById);
        const relatedPeopleMap = new Map<string, Person>();
        relatedPeopleMap.set(person.id, person);
        [...ancestors, ...descendants, ...siblings, ...spouses].forEach(p => { relatedPeopleMap.set(p.id, p); });
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
        printableElement.style.cssText = 'position:absolute;left:-9999px;width:297mm;padding:20px;background-color:white;color:black;font-family:sans-serif;';
        printableElement.innerHTML = `<h1 style="font-size: 28px; font-weight: bold; text-align: center; margin-bottom: 20px;">Family Timeline Report</h1>`;
        if (person) {
            let photoHtml = '';
            if (person.photos?.[0]) {
                try {
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = person.photos[0]; });
                    photoHtml = `<img src="${img.src}" style="width: 100px; height: 133px; object-fit: cover; border-radius: 8px; float: left; margin-right: 20px;" />`;
                } catch (error) { console.error("Error preloading image for PDF:", error); }
            }
            const detailsHtml = `<div style="overflow: hidden;"><h2 style="font-size: 24px; font-weight: bold; margin-bottom: 10px;">Timeline for ${getFullName(person)}</h2><div style="font-size: 14px; line-height: 1.5;"><div><strong>Born:</strong> ${person.birthDate || 'N/A'}${person.birthPlace ? ` in ${person.birthPlace}` : ''}</div>${person.deathDate ? `<div><strong>Died:</strong> ${person.deathDate}${person.deathPlace ? ` in ${person.deathPlace}` : ''}</div>` : ''}</div></div><div style="clear: both;"></div>`;
            const summaryCardBgColor = person.gender === Gender.Male ? 'rgba(59, 130, 246, 0.1)' : person.gender === Gender.Female ? 'rgba(236, 72, 153, 0.1)' : '#f9fafb';
            printableElement.innerHTML += `<div style="background-color: ${summaryCardBgColor}; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; margin-bottom: 20px; overflow: hidden;">${photoHtml}${detailsHtml}</div>`;
        }
        printableElement.appendChild(timelineContainerRef.current.cloneNode(true));
        document.body.appendChild(printableElement);
        try {
            await generatePdf(printableElement, fileName, 'l');
        } catch (error) {
            console.error("Error generating timeline PDF:", error);
            alert("Sorry, an error occurred while generating the PDF report.");
        } finally {
            document.body.removeChild(printableElement);
            setIsGeneratingPdf(false);
        }
    };
    
    const FamilyTimelineChart: React.FC<{people: Person[]}> = ({ people }) => {
        const chartData = useMemo(() => {
            if (people.length === 0) return null;
            const peopleWithData = people.filter(p => p.birthDate).map(p => ({ ...p, birthYear: new Date(p.birthDate!).getFullYear(), deathYear: p.deathDate ? new Date(p.deathDate).getFullYear() : new Date().getFullYear(), fullName: getFullName(p) })).sort((a, b) => a.fullName.localeCompare(b.fullName));
            if (peopleWithData.length === 0) return null;
            const minYear = Math.min(...peopleWithData.map(p => p.birthYear));
            const maxYear = Math.max(...peopleWithData.map(p => p.deathYear));
            return { people: peopleWithData, minYear: Math.floor(minYear / 10) * 10, maxYear: Math.ceil(maxYear / 10) * 10 };
        }, [people]);

        if (!chartData) return <p className="text-gray-500">No individuals with birth dates to display on the timeline.</p>;

        const { people: chartPeople, minYear, maxYear } = chartData;
        const chartHeight = 600, leftMargin = 50, rightMargin = 20, topMargin = 20, bottomMargin = 120, personLaneWidth = 60;
        const chartWidth = chartPeople.length * personLaneWidth, totalWidth = chartWidth + leftMargin + rightMargin, totalHeight = chartHeight + topMargin + bottomMargin;
        const yearRange = maxYear - minYear;
        const yearToY = (year: number) => topMargin + ((year - minYear) / yearRange) * chartHeight;
        const yearTicks = [];
        for (let year = minYear; year <= maxYear; year += (yearRange > 200 ? 20 : 10)) yearTicks.push(year);

        return (
            <svg width={totalWidth} height={totalHeight} className="font-sans">
                <g className="text-xs text-gray-500 dark:text-gray-400">
                    {yearTicks.map(year => (<g key={year}><line x1={leftMargin} y1={yearToY(year)} x2={totalWidth - rightMargin} y2={yearToY(year)} className="stroke-current text-gray-200 dark:text-gray-700" strokeWidth="0.5" strokeDasharray="2,2"/><text x={leftMargin - 8} y={yearToY(year)} dy="0.32em" textAnchor="end">{year}</text></g>))}
                </g>
                <g className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                     {chartPeople.map((person, i) => { const x = leftMargin + (i * personLaneWidth) + (personLaneWidth / 2); const y = totalHeight - bottomMargin + 15; return (<text key={person.id} x={x} y={y} textAnchor="end" transform={`rotate(-45, ${x}, ${y})`}>{person.fullName}</text>) })}
                </g>
                <g>
                    {chartPeople.map((person, i) => {
                        const y1 = yearToY(person.birthYear), y2 = yearToY(person.deathYear), barX = leftMargin + (i * personLaneWidth) + (personLaneWidth / 2);
                        const colorClass = person.gender === Gender.Male ? 'text-blue-500' : 'text-pink-500';
                        return (
                            <g key={person.id} className={`${colorClass} opacity-70 hover:opacity-100 transition-opacity`}>
                                <title>{`${person.fullName} (${person.birthYear}-${person.deathYear === new Date().getFullYear() ? 'Present' : person.deathYear})`}</title>
                                <line x1={barX} y1={y1} x2={barX} y2={y2} stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
                            </g>
                        )
                    })}
                </g>
            </svg>
        );
    }

    return (
        <div className="bg-white dark:bg-gray-900 shadow-lg rounded-xl h-full flex flex-col">
            <div className="p-6 pb-4 flex justify-between items-start flex-wrap gap-4 border-b border-gray-200 dark:border-gray-700 no-print">
                <div><h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Family Timeline</h2><p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Filter the timeline to focus on specific family lines.</p></div>
                <div className="flex items-center space-x-2">{people.length > 0 && (<Button variant="secondary" onClick={handleDownloadReport} disabled={isGeneratingPdf}>{isGeneratingPdf ? <SpinnerIcon /> : <PrintIcon />}<span className="ml-2 hidden sm:inline">{isGeneratingPdf ? 'Generating...' : 'Download Report'}</span></Button>)}</div>
            </div>
            {people.length > 0 ? (
                <>
                <div className="p-6 pb-4 flex items-end space-x-2 no-print">
                    <div className="flex-grow max-w-sm"><SearchableSelect label="Filter by Person" options={people} value={filterPersonId} onChange={setFilterPersonId} placeholder="Select a person to focus on" /></div>
                    <Button onClick={handleGenerate} disabled={!filterPersonId}>Generate</Button>
                    {displayedPeople && <Button variant="secondary" onClick={handleShowAll}>Show All</Button>}
                </div>
                <div className="flex-grow overflow-auto px-6">
                    <div ref={timelineContainerRef}><FamilyTimelineChart people={displayedPeople || people}/></div>
                </div>
                </>
            ) : (<div className="flex-grow flex items-center justify-center"><p className="text-gray-500">Add people to the tree to see the timeline.</p></div>)}
        </div>
    );
};


// --- From App.tsx ---
const App = () => {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const familyTree = useFamilyTree();
  const [isNewTreeModalOpen, setIsNewTreeModalOpen] = useState(false);
  const [newTreeName, setNewTreeName] = useState('');
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [personToEdit, setPersonToEdit] = useState<Person | undefined>(undefined);
  
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

  const toggleDarkMode = () => setIsDarkMode(prev => !prev);
  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => { if (event.target.files?.[0]) { importGedcom(event.target.files[0]); event.target.value = ''; } };
  const handleImportBackup = (event: React.ChangeEvent<HTMLInputElement>) => { if (event.target.files?.[0]) { importBackup(event.target.files[0]); event.target.value = ''; } };
  const handleExport = () => { if (activeTreeId) exportGedcom(activeTreeId); };
  
  const handleCreateTree = () => {
      if (newTreeName.trim()) { createNewTree(newTreeName.trim()); setNewTreeName(''); setIsNewTreeModalOpen(false); } 
      else { alert("Please enter a name for the tree."); }
  };
  
  const handleDeleteTree = () => { if(activeTreeId) { deleteTree(activeTreeId); setIsDeleteModalOpen(false); } };
  const openPersonForm = (person?: Person) => { setPersonToEdit(person); setIsFormModalOpen(true); };
  const closePersonForm = () => { setIsFormModalOpen(false); setPersonToEdit(undefined); };
  
  if (isLoading) return <div className="flex items-center justify-center h-screen bg-gray-100 dark:bg-gray-900"><div className="text-center"><div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto"></div><p className="mt-4 text-lg text-gray-700 dark:text-gray-300">Loading Family Data...</p></div></div>;
  
  const NavItem = ({ to, children }: { to: string; children: React.ReactNode }) => {
    const location = useLocation();
    const isActive = location.pathname === to;
    const activeClass = "bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300";
    const inactiveClass = "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700";
    return <NavLink to={to} className={`px-4 py-2 rounded-md text-sm font-medium ${isActive ? activeClass : inactiveClass}`}><span>{children}</span></NavLink>;
  };
  
  return (
    <FamilyTreeContext.Provider value={familyTree}>
        <HashRouter>
            <div className="flex flex-col h-screen bg-gray-100 dark:bg-gray-800 font-sans">
                <header className="bg-white dark:bg-gray-900 shadow-md p-3 flex items-center justify-between z-10 flex-shrink-0">
                    <div className="flex items-center space-x-4">
                        <h1 className="text-xl font-bold text-blue-600 dark:text-blue-400">Digital Family Tree</h1>
                        <div className="flex items-center space-x-2 border-l border-gray-200 dark:border-gray-700 pl-4">
                           <select id="tree-select" value={activeTreeId || ''} onChange={e => switchTree(e.target.value)} className="p-2 border rounded bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-blue-500 focus:border-blue-500 text-sm disabled:opacity-50 disabled:cursor-not-allowed w-48" disabled={!activeTreeId}>
                                {Object.keys(trees).length > 0 ? Object.keys(trees).map(treeId => <option key={treeId} value={treeId}>{trees[treeId].name}</option>) : <option value="">- No Active Tree -</option>}
                            </select>
                            <Tooltip text="New Tree"><button onClick={() => setIsNewTreeModalOpen(true)} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer"><PlusIcon /></button></Tooltip>
                            <Tooltip text="Save Backup (.json)"><button onClick={backupActiveTree} disabled={!activeTreeId} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"><SaveIcon /></button></Tooltip>
                            <Tooltip text="Delete Active Tree"><button onClick={() => setIsDeleteModalOpen(true)} disabled={!activeTreeId} className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 disabled:opacity-50 disabled:cursor-not-allowed"><TrashIcon /></button></Tooltip>
                        </div>
                    </div>
                    <nav className="flex items-center space-x-2">
                        <NavItem to="/">All Individuals</NavItem>
                        <NavItem to="/tree">Family Tree</NavItem>
                        <NavItem to="/timeline">Family Timeline</NavItem>
                        <NavItem to="/reports">Reports & Stats</NavItem>
                    </nav>
                    <div className="flex items-center space-x-2">
                         <Tooltip text="Import GEDCOM (.ged)"><label htmlFor="gedcom-import" className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer"><DocumentArrowUpIcon /><input id="gedcom-import" type="file" accept=".ged" className="hidden" onChange={handleImport}/></label></Tooltip>
                        <Tooltip text="Export GEDCOM (.ged)"><button onClick={handleExport} disabled={!activeTreeId} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"><ArrowDownOnSquareIcon /></button></Tooltip>
                        <Tooltip text="Restore from Backup (.json)"><label htmlFor="backup-import" className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer"><ArrowUpTrayIcon /><input id="backup-import" type="file" accept=".json" className="hidden" onChange={handleImportBackup}/></label></Tooltip>
                        <div className="border-l border-gray-200 dark:border-gray-700 h-6 mx-2"></div>
                        <Tooltip text={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}><button onClick={toggleDarkMode} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700">{isDarkMode ? <SunIcon /> : <MoonIcon />}</button></Tooltip>
                    </div>
                </header>
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
        <Modal isOpen={isNewTreeModalOpen} onClose={() => setIsNewTreeModalOpen(false)} title="Create New Family Tree">
            <div className="space-y-4">
                <Input label="Tree Name" id="new-tree-name" value={newTreeName} onChange={(e) => setNewTreeName(e.target.value)} placeholder="e.g., 'My Paternal Lineage'" autoFocus />
                <div className="flex justify-end space-x-2"><Button variant="secondary" onClick={() => setIsNewTreeModalOpen(false)}>Cancel</Button><Button onClick={handleCreateTree}>Create Tree</Button></div>
            </div>
        </Modal>
        <Modal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} title="Confirm Deletion">
            <div className="space-y-4">
                <p>Are you sure you want to delete the tree "{activeTreeId && trees[activeTreeId]?.name}"? This action cannot be undone.</p>
                <div className="flex justify-end space-x-2"><Button variant="secondary" onClick={() => setIsDeleteModalOpen(false)}>Cancel</Button><Button variant="danger" onClick={handleDeleteTree}>Delete Tree</Button></div>
            </div>
        </Modal>
        <PersonForm isOpen={isFormModalOpen} onClose={closePersonForm} personToEdit={personToEdit} />
    </FamilyTreeContext.Provider>
  );
};

// --- Final Render ---
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
