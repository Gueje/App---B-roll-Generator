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
    You are an Expert Cinematographer and AI Prompt Engineer (Midjourney/Runway/Sora expert). 
    Your goal is to map a script to specific B-Roll suggestions.

    **USER CONFIGURATION:**
    - **Visual Style:** ${userStyle}
    - **Narrative Tone:** ${userTone}

    **CRITICAL RULE FOR VIDEO PROMPTS:**
    If you choose 'VIDEO' as the media type, the 'aiPrompt' MUST be extremely detailed and technical. It is not enough to say "A man walking".
    You MUST describe:
    1. **Camera Movement:** (e.g., Slow dolly in, Truck left, Orbit, Static tripod, Handheld shake, Low angle tracking shot).
    2. **Framing:** (e.g., Extreme Close-Up of eyes, Wide shot, Over-the-shoulder).
    3. **Lighting:** (e.g., Volumetric lighting, Golden hour, Neon rim light, Soft diffused window light, High contrast noir).
    4. **Action/Transition:** Specific movement within the frame (e.g., "Smoke swirls slowly", "Character turns head to camera", "Fast blur transition").
    5. **Technical Specs:** (e.g., 4k, 60fps, shallow depth of field, bokeh, highly detailed, photorealistic).

    **CRITICAL RULE FOR SEGMENTATION:**
    The input segments are split by ideas/sentences. You must provide a visual for EVERY segment provided.

    **OUTPUT STRUCTURE (JSON):**
    For each segment:
    1. **Visual Intent:** A human-readable summary of the shot.
    2. **Media Type:** Choose VIDEO for action/emotion, IMAGE for specific objects/concepts.
    3. **Search Query:** A simplified keyword string for stock sites (Pexels/Unsplash).
    4. **AI Prompt:** The highly technical prompt described above.

    **AI PROMPT TEMPLATE (Use this pattern):**
    "[Subject] [Action] in [Environment]. [Camera Movement], [Framing], [Lighting]. Technical: [Specs]. Style: ${userStyle}, Mood: ${userTone}."
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
              aiPrompt: { type: Type.STRING, description: "Highly detailed, cinematic prompt with camera, lighting, and movement specs." }
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