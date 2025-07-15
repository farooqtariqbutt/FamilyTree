
import { GoogleGenAI } from "@google/genai";
import type { Person } from '../types.ts';
import { getFullName } from '../utils/personUtils.ts';

// By initializing the client lazily (only when needed), we prevent the app from
// crashing on startup if `process.env` is not available in the browser.
let ai: GoogleGenAI | null = null;
const getAiClient = (): GoogleGenAI => {
    if (!ai) {
        try {
            ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
        } catch (e) {
            console.error("Failed to initialize GoogleGenAI. This is likely due to a missing API_KEY environment variable.", e);
            throw new Error("GoogleGenAI client could not be initialized. Ensure the API_KEY environment variable is set correctly in your deployment environment.");
        }
    }
    return ai;
}

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
        const localAi = getAiClient();
        const response = await localAi.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
        });

        return response.text;
    } catch (error) {
        console.error("Error generating life story with Gemini API:", error);
        if (error instanceof Error) {
            if (error.message.includes('API key not valid') || error.message.includes('could not be initialized')) {
                 return "Could not generate life story. The API Key seems to be invalid or is not configured correctly in your deployment environment. Please verify the `API_KEY` environment variable.";
            }
        }
        return "An error occurred while generating the life story. Please check the browser console for more details.";
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
        const localAi = getAiClient();
        const response = await localAi.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
        });
        return response.text;
    } catch (error) {
        console.error(`Error translating text to ${targetLanguage} with Gemini API:`, error);
        if (error instanceof Error) {
             if (error.message.includes('API key not valid') || error.message.includes('could not be initialized')) {
                 return `Could not translate text. The API Key seems to be invalid or is not configured correctly in your deployment environment. Please verify the 'API_KEY' environment variable.`;
            }
        }
        return `An error occurred while translating the text. Please check the browser console for more details.`;
    }
};
