
import { GoogleGenAI } from "@google/genai";
import type { Person } from '../types.ts';
import { getFullName } from '../utils/personUtils.ts';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

interface FamilyContext {
    parents: (Person | undefined)[];
    spouses: (Person | undefined)[];
    children: (Person | undefined)[];
}

export const generateLifeStory = async (person: Person, familyContext: FamilyContext): Promise<string> => {

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

export const translateText = async (text: string, targetLanguage: string): Promise<string> => {
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