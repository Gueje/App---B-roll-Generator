import { ScriptSegment, BrollSuggestion } from "../types";

export const downloadLocalFile = (
  filename: string,
  segments: ScriptSegment[],
  suggestions: BrollSuggestion[]
) => {
  let content = `# B-ROLL PLAN: ${filename}\n`;
  content += `Date: ${new Date().toLocaleDateString()}\n\n`;
  content += `--------------------------------------------------\n\n`;

  let coveredCount = 0;

  segments.forEach((seg) => {
    const sug = suggestions.find((s) => s.segmentId === seg.id);
    if (sug) coveredCount++;

    content += `## BLOCK ${seg.order + 1}\n\n`;
    content += `**Script:**\n"${seg.originalText}"\n\n`;

    if (seg.notes.length > 0) {
      content += `**Notes:** ${seg.notes.join(', ')}\n\n`;
    }

    if (seg.extractedLinks && seg.extractedLinks.length > 0) {
        content += `**Linked Resources:**\n`;
        seg.extractedLinks.forEach(link => {
            content += `- [${link.type}] ${link.url}\n`;
        });
        content += `\n`;
    }

    if (sug) {
      content += `**[${sug.mediaType}]** ${sug.visualIntent}\n`;
      content += `*Style:* ${sug.styleParams.style} | *Mood:* ${sug.styleParams.mood}\n\n`;
      content += `**Search Query:** \`${sug.searchQuery.mainQuery}\`\n`;
      content += `**Keywords:** ${sug.searchQuery.keywords.join(', ')}\n\n`;
      content += `**Direct Links:**\n`;
      content += `- [Google Images](${sug.sources.googleImages})\n`;
      content += `- [Pexels](${sug.sources.pexels})\n`;
      content += `- [Unsplash](${sug.sources.unsplash})\n`;
      content += `- [Pinterest](${sug.sources.pinterest})\n`;

      if (sug.aiPrompt) {
          content += `\n**AI Prompt:**\n> ${sug.aiPrompt}\n`;
      }
    } else {
      content += `*(No B-Roll Suggested)*\n`;
    }

    content += `\n---\n\n`;
  });

  // Summary
  content += `\n## SUMMARY\n`;
  content += `Total Segments: ${segments.length}\n`;
  content += `Coverage: ${Math.round((coveredCount / segments.length) * 100)}%\n`;

  // Create Blob and Download
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_B-Roll_Plan.md`;
  document.body.appendChild(link);
  link.click();
  
  // Cleanup
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};