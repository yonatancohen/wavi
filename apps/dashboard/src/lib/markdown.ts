import DOMPurify from 'dompurify';
import { marked, type Tokens } from 'marked';

export interface TocEntry {
  id: string;
  text: string;
  depth: number;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\u0590-\u05FF\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function headingText(token: Tokens.Heading): string {
  return token.tokens.map((t) => ('text' in t ? t.text : '')).join('');
}

export function extractToc(markdown: string): TocEntry[] {
  const tokens = marked.lexer(markdown);
  return tokens
    .filter((t): t is Tokens.Heading => t.type === 'heading' && t.depth <= 3)
    .map((t) => ({
      id: slugify(headingText(t)),
      text: headingText(t),
      depth: t.depth,
    }));
}

export function renderMarkdown(markdown: string): string {
  const renderer = new marked.Renderer();

  renderer.heading = function heading(token: Tokens.Heading) {
    const text = this.parser.parseInline(token.tokens);
    const id = slugify(headingText(token));
    return `<h${token.depth} id="${id}" class="doc-heading doc-h${token.depth}">${text}</h${token.depth}>\n`;
  };

  renderer.code = function code(token: Tokens.Code) {
    if (token.lang === 'mermaid') {
      return `<div class="mermaid my-6">${token.text}</div>\n`;
    }
    const lang = token.lang ? ` data-lang="${token.lang}"` : '';
    return `<pre class="doc-pre"${lang}><code>${token.text}</code></pre>\n`;
  };

  renderer.table = function table(token: Tokens.Table) {
    const header = token.header
      .map((cell, i) => {
        const align = token.align[i] ? ` style="text-align:${token.align[i]}"` : '';
        return `<th${align}>${this.parser.parseInline(cell.tokens)}</th>`;
      })
      .join('');
    const body = token.rows
      .map(
        (row) =>
          `<tr>${row
            .map((cell, i) => {
              const align = token.align[i] ? ` style="text-align:${token.align[i]}"` : '';
              return `<td${align}>${this.parser.parseInline(cell.tokens)}</td>`;
            })
            .join('')}</tr>`,
      )
      .join('');
    return `<div class="doc-table-wrap"><table class="doc-table"><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table></div>\n`;
  };

  renderer.hr = () => '<hr class="doc-hr" />\n';

  renderer.blockquote = function blockquote(token: Tokens.Blockquote) {
    const body = this.parser.parse(token.tokens);
    return `<blockquote class="doc-blockquote">${body}</blockquote>\n`;
  };

  marked.setOptions({
    gfm: true,
    breaks: false,
  });

  const raw = marked.parse(markdown, { renderer }) as string;
  return sanitizeDocHtml(raw);
}

/** Allow doc-specific markup (headings with ids, mermaid blocks, tables). */
export function sanitizeDocHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ['id', 'data-lang'],
  });
}
