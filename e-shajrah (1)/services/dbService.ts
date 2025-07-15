
import type { Tree, Trees } from '../types.ts';

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

export const getAllTrees = async (): Promise<Trees> => {
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

export const saveTree = async (tree: Tree): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(TREES_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(TREES_STORE_NAME);
        const request = store.put(tree);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

export const deleteTreeFromDB = async (treeId: string): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(TREES_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(TREES_STORE_NAME);
        const request = store.delete(treeId);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

export const getAppState = async (key: string): Promise<any> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(APP_STATE_STORE_NAME, 'readonly');
        const store = transaction.objectStore(APP_STATE_STORE_NAME);
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result?.value);
        request.onerror = () => reject(request.error);
    });
};


export const saveAppState = async (key: string, value: any): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(APP_STATE_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(APP_STATE_STORE_NAME);
        const request = store.put({ key, value });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};