import * as pdfjsLib from 'pdfjs-dist';
import { ScriptSegment, ExtractedLink } from '../types';

// Set worker source for pdfjs-dist
// In a Vite environment, we can use a CDN or a local path.
// Using a CDN is often easier for quick setups.
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

/**
 * Parses a .pdf file buffer into structured script segments.
 */
export const parsePdf = async (arrayBuffer: ArrayBuffer): Promise<ScriptSegment[]> => {
  try {
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      fullText += pageText + '\n';
    }

    // Reuse the splitting logic from docxService
    const splitRegex = /(?:\r?\n)+|(?<=[.!?])\s+(?=[A-Z¿¡])/;
    const rawSegments = fullText.split(splitRegex);
    const segments: ScriptSegment[] = [];
    let orderCounter = 0;

    // Regex for URLs
    const urlRegex = /(https?:\/\/[^\s]+)/g;

    rawSegments.forEach((raw) => {
      const trimmed = raw.trim();
      if (trimmed.length > 2) {
        // Extract notes (text in brackets)
        const noteRegex = /\[(.*?)\]|\{(.*?)\}/g;
        const notes: string[] = [];
        let match;
        while ((match = noteRegex.exec(trimmed)) !== null) {
          if (match[1]) notes.push(match[1]);
          if (match[2]) notes.push(match[2]);
        }

        // Extract Links
        const extractedLinks: ExtractedLink[] = [];
        let linkMatch;
        while ((linkMatch = urlRegex.exec(trimmed)) !== null) {
          const url = linkMatch[0].replace(/[)]$/, '');
          let type: 'YOUTUBE' | 'IMAGE' | 'GENERIC' = 'GENERIC';
          
          if (url.includes('youtube.com') || url.includes('youtu.be')) {
            type = 'YOUTUBE';
          } else if (url.match(/\.(jpeg|jpg|gif|png|webp)$/i) || url.includes('imgur') || url.includes('drive.google.com')) {
            type = 'IMAGE';
          }
          
          extractedLinks.push({ url, type });
        }

        const cleanText = trimmed.replace(noteRegex, '').trim();

        if (cleanText.length > 0 || notes.length > 0) {
          segments.push({
            id: `pdf-seg-${orderCounter}-${Date.now()}`,
            originalText: cleanText || "[Visual Note Only]",
            notes: notes,
            extractedLinks: extractedLinks,
            order: orderCounter++
          });
        }
      }
    });

    return segments;
  } catch (error) {
    console.error("Failed to parse PDF", error);
    throw new Error("Failed to parse PDF document. Please ensure it is a valid .pdf file.");
  }
};
