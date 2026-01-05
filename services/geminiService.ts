import { GoogleGenAI, Type } from "@google/genai";
import { ScriptSegment, BrollSuggestion, MediaType } from "../types";

const MODEL_NAME = "gemini-2.5-flash";

const SYSTEM_INSTRUCTION = `
You are a meticulous Video Editor and Creative Director. Your goal is to map a script to highly specific, relevant B-Roll.

PHASE 1: ANALYZE GLOBAL ATMOSPHERE & STYLE
Before generating suggestions, analyze the input segments to define a single, cohesive "Master Aesthetic" for this specific project.
- Determine the Mood (e.g., Dark/Gritty, Bright/Corporate, Minimalist/Clean, Cyberpunk/Neon).
- Determine the Visual Language (e.g., "Shot on 35mm film, grainy texture", "Hyper-realistic 8k, sharp focus", "Pastel color palette, soft lighting").

PHASE 2: GENERATE PROMPTS (Strict Rules)
1. **UNIFIED AESTHETIC:** Every single 'aiPrompt' you generate MUST include the "Master Aesthetic" description at the end. All images must look like they belong to the exact same movie or brand identity.
2. **ENTITY SPECIFICITY:**
   - If the script mentions a specific person (e.g., "Steve Jobs"), the prompt MUST name them.
   - If the script mentions a specific location (e.g., "The Louvre"), the prompt MUST name it.
   - If the script implies a specific object (e.g., "Ferrari F40"), do not say "red sports car".
3. **AI PROMPT STRUCTURE:**
   The 'aiPrompt' field string MUST be constructed exactly like this:
   "[Subject/Person defined in text] doing [Action defined in text] at [Location], [Camera Angle/Composition], [Master Aesthetic Description]"

For each script segment:
1. Identify specific nouns and entities.
2. Generate a Main Search Query for stock sites (Rigorous, Specific).
3. Generate an 'aiPrompt' following the structure defined above (Coherent, Stylized).
4. Return PURE JSON.
`;

export const generateBrollPlan = async (
  segments: ScriptSegment[]
): Promise<BrollSuggestion[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // Processing payload
  const segmentsPayload = segments.map(s => ({
    id: s.id,
    text: s.originalText,
    notes: s.notes.join("; ")
  }));

  const prompt = `
    Analyze the following script segments as a SINGLE COHESIVE VIDEO PROJECT. 
    First, determine the visual style that fits the narrative atmosphere. 
    Then, generate B-roll suggestions ensuring every AI prompt shares that exact same aesthetic style.
    
    Input Segments:
    ${JSON.stringify(segmentsPayload)}
  `;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              segmentId: { type: Type.STRING },
              visualIntent: { type: Type.STRING, description: "Detailed description of the shot" },
              mediaType: { type: Type.STRING, enum: ["VIDEO", "IMAGE"] },
              searchQuery: {
                type: Type.OBJECT,
                properties: {
                  mainQuery: { type: Type.STRING, description: "The most specific search term possible" },
                  variants: { type: Type.ARRAY, items: { type: Type.STRING } },
                  keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: ["mainQuery", "keywords", "variants"]
              },
              styleParams: {
                type: Type.OBJECT,
                properties: {
                  mood: { type: Type.STRING },
                  style: { type: Type.STRING },
                  negativePrompt: { type: Type.STRING }
                },
                required: ["mood", "style"]
              },
              aiPrompt: { type: Type.STRING, description: "Highly detailed, consistent generative AI prompt" }
            },
            required: ["segmentId", "visualIntent", "mediaType", "searchQuery", "styleParams"]
          }
        }
      }
    });

    let jsonString = response.text;
    if (!jsonString) {
      throw new Error("No response from Gemini");
    }

    // Clean up markdown
    jsonString = jsonString.trim();
    if (jsonString.startsWith("```json")) {
        jsonString = jsonString.replace(/^```json/, "").replace(/```$/, "");
    } else if (jsonString.startsWith("```")) {
        jsonString = jsonString.replace(/^```/, "").replace(/```$/, "");
    }

    let rawData;
    try {
        rawData = JSON.parse(jsonString);
    } catch (e) {
        console.error("Failed to parse JSON", jsonString);
        throw new Error("Received malformed JSON from API");
    }
    
    return rawData.map((item: any) => {
      const searchQuery = item.searchQuery || {};
      const mainQuery = searchQuery.mainQuery || item.visualIntent || "stock footage";
      const queryEncoded = encodeURIComponent(mainQuery);
      
      const mediaType = item.mediaType === 'VIDEO' ? 'VIDEO' : 'IMAGE';

      return {
        ...item,
        mediaType,
        searchQuery: {
            mainQuery: mainQuery,
            variants: searchQuery.variants || [],
            keywords: searchQuery.keywords || []
        },
        styleParams: item.styleParams || { mood: "Neutral", style: "Standard" },
        sources: {
          googleImages: `https://www.google.com/search?tbm=isch&q=${queryEncoded}`,
          pexels: `https://www.pexels.com/search/${mediaType === 'VIDEO' ? 'videos/' : ''}${queryEncoded}`,
          unsplash: `https://unsplash.com/s/photos/${queryEncoded}`,
          pinterest: `https://www.pinterest.com/search/pins/?q=${queryEncoded}`
        }
      } as BrollSuggestion;
    });

  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};