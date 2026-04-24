import { GoogleGenAI, Type } from "@google/genai";
import { ScriptSegment, BrollSuggestion, MediaType, CustomStyle } from "../types";

const MODEL_NAME = "gemini-1.5-flash"; 

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const getGlobalContext = async (
  fullText: string,
  apiKey: string
): Promise<string> => {
  const genAI = new GoogleGenAI(apiKey);
  const model = genAI.getGenerativeModel({ model: MODEL_NAME });
  
  const prompt = `
    Analyze this video script and provide a brief (max 2 lines) visual context.
    Tell me what is the main subject and the core visual theme.
    Example: "A documentary about the crypto market focusing on Bitcoin, using futuristic and high-tech visuals."
    
    SCRIPT:
    ${fullText.substring(0, 5000)}
  `;

  try {
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (err) {
    console.error("Context analysis failed", err);
    return "Generic stock footage style.";
  }
};

export const generateBrollPlan = async (
  segments: ScriptSegment[],
  apiKey: string,
  userStyle: string = "Auto-Detect",
  userTone: string = "Auto-Detect",
  aspectRatio: string = "16:9",
  resolution: string = "4k",
  customStyle?: CustomStyle,
  providedContext?: string // Accept external context
): Promise<BrollSuggestion[]> => {
  const genAI = new GoogleGenAI(apiKey);
  const model = genAI.getGenerativeModel({ 
    model: MODEL_NAME,
    systemInstruction: `You are a Professional Film Director and Visual Researcher. 
    Your mission is to provide RIGOROUS and contextually relevant visual plans for a script.
    
    STRICT RULES:
    1. SUBJECT RIGOR: Every 'mainQuery' and 'youtubeQuery' MUST include the specific subject of the script. NO generic metaphors.
    2. CONTEXTUAL ACCURACY: Analyze the theme and ensure every visual reinforces the specific topic (e.g. if script is about "Bitcoin", don't just show "coins", show "Bitcoin charts" or "Satoshi mentioned").
    3. NO FILLER: DO NOT provide generic office/business shots unless explicitly required by context.
    4. DATA INTEGRITY: You MUST return a valid JSON array where each object matches the requested schema precisely.`
  });

  // Small chunk size ensures higher reliability and avoids token/timeout issues
  const CHUNK_SIZE = 8;
  const chunkedSegments = [];
  for (let i = 0; i < segments.length; i += CHUNK_SIZE) {
    chunkedSegments.push(segments.slice(i, i + CHUNK_SIZE));
  }

  const allRawData: any[] = [];
  // Use provided context or fall back to deriving it
  const finalContext = providedContext || segments.slice(0, 3).map(s => s.originalText).join(" ");

  for (let i = 0; i < chunkedSegments.length; i++) {
    const chunk = chunkedSegments[i];
    // Continuity context from the previous few segments
    const prevContext = i > 0 ? segments.slice(Math.max(0, i * CHUNK_SIZE - 2), i * CHUNK_SIZE).map(s => s.originalText).join(" ") : "";
    
    const prompt = `
      GLOBAL VISUAL DIRECTION: "${finalContext}"
      ${prevContext ? `PREVIOUS CONTEXT (FOR CONTINUITY): "${prevContext}"` : ""}
      
      USER PREFERENCES:
      - Requested Style: ${customStyle ? customStyle.instruction : userStyle}
      - Narrative Tone: ${userTone}
      - Visual Specs: ${aspectRatio}, ${resolution}
      
      TASK: Generate visual suggestions for the following script segments.
      REMEMBER: Be specific. Use the main subject in every search query.
      
      SEGMENTS TO PROCESS:
      ${JSON.stringify(chunk.map(s => ({ id: s.id, text: s.originalText })))}
    `;

    let attempts = 0;
    const maxAttempts = 5;
    let success = false;

    while (attempts < maxAttempts && !success) {
      try {
        const result = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  segmentId: { type: Type.STRING },
                  visualIntent: { type: Type.STRING },
                  mediaType: { type: Type.STRING, enum: ["VIDEO", "IMAGE"] },
                  searchQuery: {
                    type: Type.OBJECT,
                    properties: {
                      mainQuery: { type: Type.STRING },
                      youtubeQuery: { type: Type.STRING }
                    },
                    required: ["mainQuery", "youtubeQuery"]
                  },
                  aiPrompt: { type: Type.STRING }
                },
                required: ["segmentId", "visualIntent", "mediaType", "searchQuery", "aiPrompt"]
              }
            }
          }
        });

        const text = result.response.text();
        const data = JSON.parse(text);
        if (Array.isArray(data)) {
          allRawData.push(...data);
          success = true;
        }
      } catch (err: any) {
        attempts++;
        console.error(`Chunk ${i} failed. Attempt ${attempts}/${maxAttempts}. Error:`, err.message);
        await delay(2500 * attempts); // Exponential backoff with delay
      }
    }
  }

  // Map results back to original segments with robust fallbacks
  return segments.map(segment => {
    const found = allRawData.find(r => String(r.segmentId) === String(segment.id));
    const mainQuery = found?.searchQuery?.mainQuery || segment.originalText.substring(0, 60);
    const ytQuery = found?.searchQuery?.youtubeQuery || mainQuery;
    
    return {
      segmentId: segment.id,
      visualIntent: found?.visualIntent || `Visual representativo de: ${segment.originalText.substring(0, 50)}...`,
      mediaType: found?.mediaType || "VIDEO",
      searchQuery: {
        mainQuery,
        youtubeQuery: ytQuery,
        variants: [],
        keywords: []
      },
      styleParams: { mood: userTone, style: userStyle },
      aiPrompt: found?.aiPrompt || `${mainQuery}, cinematic 4k, ${aspectRatio}`,
      sources: {
        googleImages: `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(mainQuery)}`,
        pexels: `https://www.pexels.com/search/videos/${encodeURIComponent(mainQuery)}`,
        unsplash: `https://unsplash.com/s/photos/${encodeURIComponent(mainQuery)}`,
        pinterest: `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(mainQuery)}`,
        youtube: `https://www.youtube.com/results?search_query=${encodeURIComponent(ytQuery)}`
      }
    } as BrollSuggestion;
  });
};
