import mammoth from 'mammoth';
import { ScriptSegment } from '../types';

/**
 * Parses a .docx file buffer into structured script segments.
 * In a real-world scenario, this might be handled server-side for better performance with large files,
 * but mammoth.js works well in the browser for this use case.
 */
export const parseDocx = async (arrayBuffer: ArrayBuffer): Promise<ScriptSegment[]> => {
  try {
    const result = await mammoth.extractRawText({ arrayBuffer });
    const text = result.value;
    
    // Simple heuristic segmentation: Split by double newlines to find paragraphs.
    // In a production app, we would use XML parsing to find comments and footnotes specifically.
    // Here we simulate note extraction by looking for text inside [brackets] or {braces}.
    
    const rawSegments = text.split(/\n\s*\n/);
    const segments: ScriptSegment[] = [];
    
    let orderCounter = 0;

    rawSegments.forEach((raw) => {
      const trimmed = raw.trim();
      if (trimmed.length > 0) {
        // Extract notes (text in brackets)
        const noteRegex = /\[(.*?)\]|\{(.*?)\}/g;
        const notes: string[] = [];
        let match;
        while ((match = noteRegex.exec(trimmed)) !== null) {
          if (match[1]) notes.push(match[1]);
          if (match[2]) notes.push(match[2]);
        }

        // Clean text by removing notes for the main visual script
        const cleanText = trimmed.replace(noteRegex, '').trim();

        if (cleanText.length > 0 || notes.length > 0) {
          segments.push({
            id: `seg-${orderCounter}-${Date.now()}`,
            originalText: cleanText || "[Visual Note Only]",
            notes: notes,
            order: orderCounter++
          });
        }
      }
    });

    return segments;
  } catch (error) {
    console.error("Failed to parse DOCX", error);
    throw new Error("Failed to parse document. Please ensure it is a valid .docx file.");
  }
};