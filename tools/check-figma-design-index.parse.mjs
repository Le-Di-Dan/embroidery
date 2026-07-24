/**
 * Markdown-table and Figma-link parsing helpers for the Figma Design Index gate.
 * Pure, dependency-free string functions split out of the validator so the gate
 * stays within the source file-size limit. No I/O, no network.
 */

function splitRow(line) {
  // "| a | b |" -> ["a","b"]; tolerate a trailing/leading pipe.
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((c) => c.trim());
}

function isSeparatorRow(line) {
  return /^\|[\s:|-]+\|?$/.test(line.trim()) && line.includes('-');
}

/** Parse every pipe-table in the document into { header, colIndex, rows }. */
export function parseTables(lines) {
  const tables = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].trim().startsWith('|') && !isSeparatorRow(lines[i])) {
      const headerLine = lines[i];
      const sepLine = lines[i + 1];
      if (sepLine && isSeparatorRow(sepLine)) {
        const header = splitRow(headerLine);
        const colIndex = {};
        header.forEach((name, idx) => {
          colIndex[name] = idx;
        });
        const rows = [];
        let j = i + 2;
        while (j < lines.length && lines[j].trim().startsWith('|') && !isSeparatorRow(lines[j])) {
          rows.push({ cells: splitRow(lines[j]), lineNo: j + 1 });
          j += 1;
        }
        tables.push({ header, colIndex, rows, headerLineNo: i + 1 });
        i = j;
        continue;
      }
    }
    i += 1;
  }
  return tables;
}

/** Trimmed value of a named column in a parsed row, or '' when absent. */
export function cell(row, colIndex, name) {
  const idx = colIndex[name];
  return idx === undefined ? '' : (row.cells[idx] ?? '').trim();
}

/** A markdown link `[text](url)` or bare url -> the url. */
export function extractUrl(text) {
  const md = /\((https?:\/\/[^)]+)\)/.exec(text);
  if (md) return md[1];
  const bare = /(https?:\/\/\S+)/.exec(text);
  return bare ? bare[1] : '';
}

export function fileKeyFromUrl(url) {
  const m = /figma\.com\/design\/([A-Za-z0-9]+)\//.exec(url);
  return m ? m[1] : '';
}

export function nodeIdFromUrl(url) {
  const m = /[?&]node-id=([0-9]+-[0-9]+)/.exec(url);
  return m ? m[1] : '';
}
