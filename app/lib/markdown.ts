/**
 * Tiny, safe Markdown subset for editable pages (headings, paragraphs, lists,
 * bold/italic, links, blockquotes). All input is HTML-escaped first.
 */
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function inline(s: string) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*|mailto:[^)\s]+)\)/g, '<a href="$2">$1</a>');
}

export function renderMarkdown(md: string): string {
  const out: string[] = [];
  let list: string[] | null = null;
  const flush = () => {
    if (list) out.push(`<ul>${list.map((li) => `<li>${inline(li)}</li>`).join("")}</ul>`);
    list = null;
  };
  for (const block of md.replace(/\r/g, "").split(/\n{2,}/)) {
    const lines = block.split("\n");
    if (lines.every((l) => /^\s*[-*] /.test(l))) {
      list = [...(list ?? []), ...lines.map((l) => l.replace(/^\s*[-*] /, ""))];
      continue;
    }
    flush();
    const h = block.match(/^(#{1,4}) (.+)$/);
    if (h) out.push(`<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`);
    else if (block.startsWith("> ")) out.push(`<blockquote>${inline(block.replace(/^> /gm, ""))}</blockquote>`);
    else if (block.trim()) out.push(`<p>${lines.map(inline).join("<br>")}</p>`);
  }
  flush();
  return out.join("\n");
}
