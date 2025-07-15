
export enum Gender {
  Male = 'Male',
  Female = 'Female',
  Other = 'Other',
}

export enum MarriageStatus {
    Married = 'Married',
    Divorced = 'Divorced',
    Widowed = 'Widowed',
    Unknown = 'Unknown',
}

export interface Marriage {
    spouseId: string;
    date?: string;
    place?: string;
    status: MarriageStatus;
}

export interface Person {
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

export interface Tree {
    id: string;
    name: string;
    people: Person[];
}

export interface Trees {
    [key: string]: Tree;
}

export interface Statistics {
    totalPeople: number;
    maleCount: number;
    femaleCount: number;
    averageLifespan: string; // "X years, Y months"
    oldestLivingPerson?: Person;
    oldestPersonEver?: Person;
}