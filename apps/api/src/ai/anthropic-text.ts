/** Pull visible text out of an Anthropic message. Thinking / tool blocks are skipped. */
export function textFromAnthropicContent(content: Array<{ type: string; text?: string | null }> | undefined): string {
  if (!content?.length) return '';
  return content
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text!.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

export function anthropicContentTypes(content: Array<{ type: string }> | undefined): string {
  return content?.map((block) => block.type).join(',') || 'none';
}
