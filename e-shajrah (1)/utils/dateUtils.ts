

export const calculateAge = (birthDate?: string, deathDate?: string): string => {
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

export const getLifespanInMonths = (birthDate?: string, deathDate?: string): number | null => {
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

export const formatLifespan = (totalMonths: number): string => {
    if (isNaN(totalMonths) || totalMonths < 0) return "N/A";
    const years = Math.floor(totalMonths / 12);
    const months = Math.round(totalMonths % 12);
    return `${years} years, ${months} months`;
};