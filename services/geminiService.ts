import { GoogleGenAI, Type } from "@google/genai";
import { ScriptSegment, BrollSuggestion, MediaType } from "../types";

const MODEL_NAME = "gemini-2.5-flash";

const SYSTEM_INSTRUCTION = `
You are an expert Video Editor and Creative Director. Your task is to analyze script segments and generate detailed B-Roll (supplementary footage) suggestions.

For each script segment provided:
1. Analyze the context, tone, and any embedded notes (instructions in brackets).
2. Suggest the BEST visual accompaniment (Video or Image).
3. Create a specific, optimized search query for stock footage sites.
4. Generate 3-8 relevant keywords.
5. Create alternative search variants (different angles, synonyms).
6. Define the visual style (Cinematic, Vlog, Corporate, etc.).
7. If the scene is abstract or hard to film, suggest a Generative AI prompt.

Return PURE JSON.
`;

export const generateBrollPlan = async (
  segments: ScriptSegment[]
): Promise<BrollSuggestion[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // We process in batches to avoid huge payloads, but for this demo, we'll try a reasonable chunk.
  // In production: Queue system.
  
  const segmentsPayload = segments.map(s => ({
    id: s.id,
    text: s.originalText,
    notes: s.notes.join("; ")
  }));

  const prompt = `
    Analyze the following script segments and generate B-roll suggestions.
    
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
              visualIntent: { type: Type.STRING, description: "Description of what is happening on screen" },
              mediaType: { type: Type.STRING, enum: ["VIDEO", "IMAGE"] },
              searchQuery: {
                type: Type.OBJECT,
                properties: {
                  mainQuery: { type: Type.STRING },
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
              aiPrompt: { type: Type.STRING, description: "Prompt for image generation models if needed" }
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

    // Clean up markdown if present (e.g. ```json ... ```)
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
    
    // Post-process to add generated URLs with defensive checking
    return rawData.map((item: any) => {
      // Ensure searchQuery exists and has a mainQuery
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