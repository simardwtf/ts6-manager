/**
 * M3U / M3U8 playlist parser.
 *
 * Handles both extended M3U (#EXTM3U / #EXTINF) and plain URL-per-line formats.
 * Supports common IPTV attributes: tvg-name, tvg-logo, group-title.
 */

export interface M3uParsedEntry {
  name: string;
  groupTitle?: string;
  tvgLogo?: string;
  url: string;
}

/**
 * Parse raw M3U text content into structured entries.
 */
export function parseM3u(content: string): M3uParsedEntry[] {
  const lines = content.split(/\r?\n/).map((l) => l.trim());
  const entries: M3uParsedEntry[] = [];

  let pendingName: string | null = null;
  let pendingGroup: string | undefined;
  let pendingLogo: string | undefined;

  for (const line of lines) {
    if (!line || line === '#EXTM3U') continue;

    if (line.startsWith('#EXTINF')) {
      // Parse EXTINF line: #EXTINF:<duration> [attrs...],<name>
      const commaIdx = line.indexOf(',');
      const attrPart = commaIdx > 0 ? line.substring(0, commaIdx) : line;
      pendingName = commaIdx > 0 ? line.substring(commaIdx + 1).trim() : '';

      pendingGroup = extractAttr(attrPart, 'group-title');
      pendingLogo = extractAttr(attrPart, 'tvg-logo');

      // tvg-name can override the display name after the comma
      const tvgName = extractAttr(attrPart, 'tvg-name');
      if (tvgName && !pendingName) pendingName = tvgName;

      continue;
    }

    // Skip other directives
    if (line.startsWith('#')) continue;

    // This is a URL line
    if (isUrl(line)) {
      const name = pendingName || line;
      entries.push({
        name,
        groupTitle: pendingGroup,
        tvgLogo: pendingLogo,
        url: line,
      });
    }

    // Reset pending state
    pendingName = null;
    pendingGroup = undefined;
    pendingLogo = undefined;
  }

  return entries;
}

/**
 * Extract a quoted attribute value from an EXTINF attribute string.
 * e.g. extractAttr('#EXTINF:-1 group-title="News"', 'group-title') → 'News'
 */
function extractAttr(text: string, attr: string): string | undefined {
  const regex = new RegExp(`${attr}="([^"]*)"`, 'i');
  const match = text.match(regex);
  return match ? match[1].trim() : undefined;
}

function isUrl(str: string): boolean {
  return str.startsWith('http://') || str.startsWith('https://') || str.startsWith('rtmp://') || str.startsWith('rtsp://');
}
