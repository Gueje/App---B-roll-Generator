import { GoogleGenAI, Type } from "@google/genai";
import { ScriptSegment, BrollSuggestion, MediaType } from "../types";

const MODEL_NAME = "gemini-2.5-flash";

export const generateBrollPlan = async (
  segments: ScriptSegment[],
  apiKey: string,
  userStyle: string = "Cinematic & High Quality",
  userTone: string = "Neutral"
): Promise<BrollSuggestion[]> => {
  const ai = new GoogleGenAI({ apiKey: apiKey });

  const SYSTEM_INSTRUCTION = `
    You are a meticulous Video Editor and Creative Director. Your goal is to map a script to highly specific, relevant B-Roll.
    
    **USER PREFERENCES:**
    - **Visual Style:** ${userStyle}
    - **Narrative Tone:** ${userTone}

    PHASE 1: ANALYZE GLOBAL ATMOSPHERE
    Adapt all suggestions to match the user's requested Visual Style ("${userStyle}") and Tone ("${userTone}").
    If the style is "Sci-Fi", everything should look futuristic. If "Realistic", avoid CGI looks.

    PHASE 2: GENERATE PROMPTS (Strict Rules)
    1. **UNIFIED AESTHETIC:** Every 'aiPrompt' MUST include the phrase: "Style: ${userStyle}".
    2. **ENTITY SPECIFICITY:**
       - If the script mentions a specific person/place, name it.
       - If implied, describe it vividly.
    3. **AI PROMPT STRUCTURE:**
       "[Subject] doing [Action] at [Location], [Camera Angle], Style: ${userStyle}, Mood: ${userTone}"

    For each segment:
    1. Identify specific nouns.
    2. Generate a Main Search Query for stock sites.
    3. Generate an 'aiPrompt' following the structure above.
    4. Return PURE JSON.
  `;

  // Processing payload
  const segmentsPayload = segments.map(s => ({
    id: s.id,
    text: s.originalText,
    notes: s.notes.join("; ")
  }));

  const prompt = `
    Analyze these script segments.
    Apply the visual style: "${userStyle}" and tone: "${userTone}".
    
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
        styleParams: item.styleParams || { mood: userTone, style: userStyle },
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