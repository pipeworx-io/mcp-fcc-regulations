interface McpToolDefinition {
  name: string;
  description: string;
  /** Human-facing one-liner (fleet #1967). Optional; consumers fall back to
   *  description. Kept in step with shared/src/types.ts — scripts/lib/
   *  check-inlined-types.mjs reports drift at publish time. */
  summary?: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    anyOf?: Array<{ required: string[] }>;
    oneOf?: Array<{ required: string[] }>;
    allOf?: Array<{ required: string[] }>;
  };
  outputSchema?: Record<string, unknown>;
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * FCC Regulations MCP — US Federal Communications Commission rules (47 CFR).
 *
 * The FCC's rules ARE US federal regulations codified in Title 47 of the CFR
 * (Telecommunication). Agents search "FCC regulation on X", "47 CFR 15.109",
 * "Part 97 amateur radio rules" — never "eCFR title 47". This is a thin,
 * FCC-branded, keyless wrapper over the official eCFR API (www.ecfr.gov/api),
 * scoped to the whole of Title 47 (all of it is FCC / telecommunications):
 * part 15 unlicensed/RF devices, part 97 amateur radio, part 73 broadcast
 * radio & TV, part 76 cable, part 25 satellite, part 24/27 wireless, part 2
 * equipment authorization & frequency allocations, part 64 common carrier.
 *
 * Tools:
 * - fcc_regulation:          full text of one FCC rule by citation
 * - fcc_regulations_search:  keyword search across the FCC rules
 *
 * Distinct from the `fcc` / `data-fcc` packs, which serve FCC filings and
 * licensing DATA (ULS licenses, ECFS comments, broadband maps). This pack
 * serves the RULES — the regulatory text itself.
 *
 * Self-contained: does NOT import the eCFR pack — calls the eCFR API directly.
 */


const BASE = 'https://www.ecfr.gov/api';
const UA = 'pipeworx/1.0 (+https://pipeworx.io)';
const TITLE = 47;
const CITE = '47 CFR';

// --- XML/entity helpers ------------------------------------------------------
function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function stripHtml(s: unknown): string {
  if (typeof s !== 'string') return '';
  return decodeEntities(s.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

function xmlToText(xml: string): string {
  return decodeEntities(
    xml
      .replace(/<\?xml[^>]*\?>/g, '')
      .replace(/<HEAD>[\s\S]*?<\/HEAD>/g, '')
      .replace(/<\/(P|FP|HEAD|DIV\d+)>/g, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

// --- eCFR fetch with per-attempt timeout + 503 retry -------------------------
async function ecfrOnce(path: string, accept: string, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(`${BASE}${path}`, {
      headers: { Accept: accept, 'User-Agent': UA },
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function ecfrFetch(path: string, accept: string, retries = 3): Promise<Response> {
  let res: Response | null = null;
  for (let i = 0; i < retries; i++) {
    try {
      res = await ecfrOnce(path, accept, 12000);
      if (res.status !== 503) return res;
    } catch {
      res = null; // aborted (timeout) or network error — retry
    }
    if (i < retries - 1) await new Promise((r) => setTimeout(r, 600 * (i + 1)));
  }
  if (res) return res;
  throw new Error('eCFR temporarily unavailable (the eCFR text endpoint is timing out — retry in a few seconds).');
}

async function ecfrGet(path: string): Promise<Record<string, unknown>> {
  const res = await ecfrFetch(path, 'application/json');
  if (!res.ok) throw new Error(`eCFR: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as Record<string, unknown>;
}

// Current currency date for this title, with a 7-day-ago fallback.
async function currentDate(): Promise<string> {
  try {
    const data = await ecfrGet('/versioner/v1/titles.json');
    const titles = Array.isArray(data.titles) ? (data.titles as Array<Record<string, unknown>>) : [];
    const t = titles.find((x) => Number(x.number) === TITLE);
    if (t && typeof t.up_to_date_as_of === 'string' && t.up_to_date_as_of) return t.up_to_date_as_of;
  } catch {
    /* fall through to date fallback */
  }
  return new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
}

// --- common-name -> citation map ---------------------------------------------
// Agents say "Part 15", "the amateur radio rules", "RF exposure limits" more
// often than a bare section number. Names resolve to a part (section list) or
// straight to a section.
const NAME_MAP: Record<string, { part: string; section?: string }> = {
  'unlicensed devices': { part: '15' },
  'unlicensed device rules': { part: '15' },
  'part 15 rules': { part: '15' },
  'radio frequency devices': { part: '15' },
  'rf devices': { part: '15' },
  'amateur radio': { part: '97' },
  'amateur radio rules': { part: '97' },
  'ham radio': { part: '97' },
  'equipment authorization': { part: '2', section: '2.901' },
  'frequency allocations': { part: '2', section: '2.106' },
  'table of frequency allocations': { part: '2', section: '2.106' },
  'rf exposure': { part: '1', section: '1.1310' },
  'rf exposure limits': { part: '1', section: '1.1310' },
  'radiofrequency radiation exposure limits': { part: '1', section: '1.1310' },
  'broadcast radio': { part: '73' },
  'broadcast rules': { part: '73' },
  'radio broadcast services': { part: '73' },
  'cable television': { part: '76' },
  'cable rules': { part: '76' },
  'satellite communications': { part: '25' },
  'satellite rules': { part: '25' },
  'common carrier rules': { part: '64' },
  'telephone consumer protection': { part: '64', section: '64.1200' },
  'tcpa rules': { part: '64', section: '64.1200' },
  'do not call': { part: '64', section: '64.1200' },
  'wireless licensing': { part: '1' },
  'emergency alert system': { part: '11' },
  'eas rules': { part: '11' },
  'wireless telecommunications': { part: '27' },
  '911 requirements': { part: '9' },
  'e911': { part: '9' },
  'ownership rules': { part: '73', section: '73.3555' },
  'multiple ownership': { part: '73', section: '73.3555' },
};

function lookupName(norm: string): { part: string; section?: string } | null {
  const variants = [
    norm,
    norm.replace(/^(the|fcc|commission)\s+/, ''),
    norm.replace(/\s+(rules?|regulations?|requirements?)$/, ''),
    norm.replace(/^(the|fcc|commission)\s+/, '').replace(/\s+(rules?|regulations?|requirements?)$/, ''),
  ];
  for (const v of variants) {
    const hit = NAME_MAP[v];
    if (hit) return hit;
  }
  return null;
}

// --- citation parsing --------------------------------------------------------
// Forgiving: "15.109", "47 CFR 15.109", "§15.247", "15.247(b)", "Part 97",
// "97", plus common names ("amateur radio", "Part 15 rules").
// Title-47 quirk: parentheses are always PARAGRAPHS, never part of the section
// number, so "15.247(b)(3)" -> section 15.247.
function parseCitation(raw: string): { section: string | null; part: string | null; resolved_from: string | null } {
  const norm = raw
    .trim()
    .toLowerCase()
    .replace(/§+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[.,;]+$/, '')
    .trim();

  const named = lookupName(norm);
  if (named) return { section: named.section ?? null, part: named.part, resolved_from: raw.trim() };

  let s = norm;
  s = s.replace(/\b(47\s*cfr|cfr|fcc|parts?|subparts?|sections?|sec\.?|rules?)\b/gi, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  const secMatch = s.match(/(\d{1,4})\.(\d+[A-Za-z]*(?:-[0-9A-Za-z]+)?)/);
  if (secMatch) return { section: `${secMatch[1]}.${secMatch[2]}`, part: secMatch[1], resolved_from: null };
  const partMatch = s.match(/\b(\d{1,4})\b/);
  if (partMatch) return { section: null, part: partMatch[1], resolved_from: null };
  return { section: null, part: null, resolved_from: null };
}

// Best-effort subpart lookup for a section, via the eCFR search hierarchy.
async function lookupSubpart(section: string): Promise<string | null> {
  try {
    const params = new URLSearchParams({ query: section, per_page: '5', order: 'relevance' });
    params.append('hierarchy[title]', String(TITLE));
    const data = await ecfrGet(`/search/v1/results?${params.toString()}`);
    const results = Array.isArray(data.results) ? (data.results as Array<Record<string, unknown>>) : [];
    for (const r of results) {
      const h = (r.hierarchy as Record<string, unknown> | undefined) ?? {};
      if (h.section != null && String(h.section) === section && h.subpart != null) {
        return String(h.subpart);
      }
    }
  } catch {
    /* ignore — subpart is optional metadata */
  }
  return null;
}

// --- tools -------------------------------------------------------------------
const tools: McpToolExport['tools'] = [
  {
    name: 'fcc_regulation',
    description:
      'Get the full text of one FCC regulation — a US Federal Communications Commission rule codified in 47 CFR — by its citation. Returns the exact regulatory wording currently in force. Answers "what does 47 CFR 15 require", "what is the FCC rule for X", "does the FCC allow X", "read 47 CFR 15.247", "the FCC RF emissions limit". Forgiving citation input: "15.109", "47 CFR 15.109", "§15.247", "15.247(b)" (paragraph stripped to the section), "Part 97". Covers telecommunications regulation across all of Title 47: Part 15 unlicensed devices and RF emissions limits, Part 97 amateur radio, Part 2 equipment authorization and frequency allocations, Part 73 broadcast radio and TV, Part 76 cable, Part 25 satellite, Parts 24/27 wireless and spectrum, Part 64 common carrier and telephone rules, Part 11 emergency alert system, Part 9 911. Also accepts common names: "amateur radio", "unlicensed devices", "equipment authorization", "RF exposure limits". Pass a whole part (e.g. "15" or "Part 97") to get that part\'s section list. Example: fcc_regulation({ citation: "15.109" }) -> radiated emission limits; fcc_regulation({ citation: "97.301" }) -> amateur radio authorized frequency bands. Keyless. This pack is the FCC RULES text; the separate `fcc` and `data-fcc` packs serve FCC filings and licensing data (ULS licenses, ECFS comments, broadband maps).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        citation: {
          type: 'string',
          description:
            'FCC rule citation. A section: "15.109", "47 CFR 15.109", "§15.247", "97.301", "15.247(b)". Or a whole part: "15", "Part 97" -> returns the part\'s section list. Common names also work: "amateur radio", "unlicensed devices", "RF exposure limits".',
        },
      },
      required: ['citation'],
    },
  },
  {
    name: 'fcc_regulations_search',
    description:
      'Keyword search across the FCC regulations — US telecommunications rules in 47 CFR. Answers "what FCC regulations cover X", "the FCC rule about X", "find the telecommunications regulation for X", "which radio / spectrum / wireless rule applies to X". Great for topics: unlicensed device emission limits, Part 15 intentional and unintentional radiators, RF exposure and radiofrequency radiation limits, equipment authorization and certification, amateur radio operating privileges, spectrum and frequency allocations, broadcast station licensing and ownership, cable and satellite carriage, robocalls and caller ID, 911 and emergency alerting, wireless and common carrier obligations. Returns matching FCC rules with citation (47 CFR), heading, excerpt, and source URL. Example: fcc_regulations_search({ query: "unlicensed device emission limits" }); fcc_regulations_search({ query: "amateur radio frequency bands", limit: 15 }). Keyless. Searches the FCC RULES text; the separate `fcc` and `data-fcc` packs search FCC filings and licensing data.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description:
            'Telecommunications-regulation topic or phrase, e.g. "unlicensed device emission limits", "RF exposure", "equipment authorization", "amateur radio frequency bands", "broadcast ownership".',
        },
        limit: { type: 'number', description: 'Max results to return, 1-20 (default 10).' },
      },
      required: ['query'],
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    switch (name) {
      case 'fcc_regulation':
        return getRegulation(args);
      case 'fcc_regulations_search':
        return searchRegulations(args);
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

async function getRegulation(args: Record<string, unknown>): Promise<unknown> {
  const raw = typeof args.citation === 'string' ? args.citation : '';
  if (!raw.trim()) return { error: 'provide a citation, e.g. "15.109" or "47 CFR 97.301"' };

  const { section, part, resolved_from } = parseCitation(raw);
  if (!part) {
    return {
      error: `Could not parse an FCC citation from "${raw}". Use a section like "15.109" or "47 CFR 97.301", or a part like "Part 15".`,
    };
  }

  const date = await currentDate();

  // ---- whole part requested: return its section list -----------------------
  if (!section) {
    const res = await ecfrFetch(
      `/versioner/v1/full/${date}/title-${TITLE}.xml?part=${encodeURIComponent(part)}`,
      'application/xml',
    );
    if (res.status === 404) return { error: `${CITE} part ${part} not found as of ${date}.`, part, date };
    if (res.status === 503) return { error: 'eCFR temporarily unavailable — retry in a few seconds.', part };
    if (!res.ok) throw new Error(`eCFR: ${res.status} ${(await res.text()).slice(0, 200)}`);
    const xml = await res.text();
    const blocks = xml.split(/<DIV8\b/).slice(1);
    const sections = blocks
      .map((b) => {
        const n = b.match(/\bN="([^"]+)"/)?.[1] ?? null;
        const head = b.match(/<HEAD>([\s\S]*?)<\/HEAD>/);
        return { section: n, heading: head ? stripHtml(head[1]) : null };
      })
      .filter((s) => s.section);
    return {
      part,
      citation: `${CITE} Part ${part}`,
      resolved_from: resolved_from ?? null,
      date,
      source: 'eCFR / FCC 47 CFR (Federal Communications Commission rules)',
      source_url: `https://www.ecfr.gov/current/title-${TITLE}/part-${part}`,
      section_count: sections.length,
      note: `This is a whole FCC part (${sections.length} sections). Call fcc_regulation with a specific citation (e.g. "${sections[0]?.section ?? part + '.1'}") to get full text.`,
      sections,
    };
  }

  // ---- single section ------------------------------------------------------
  const res = await ecfrFetch(
    `/versioner/v1/full/${date}/title-${TITLE}.xml?part=${encodeURIComponent(part)}&section=${encodeURIComponent(section)}`,
    'application/xml',
  );
  if (res.status === 404 || res.status === 400) {
    return {
      error: `FCC regulation ${CITE} ${section} not found as of ${date}. Check the citation, or use fcc_regulations_search to find it.`,
      citation: `${CITE} ${section}`,
      part,
      date,
    };
  }
  if (res.status === 503) return { error: 'eCFR temporarily unavailable — retry in a few seconds.', citation: `${CITE} ${section}` };
  if (!res.ok) throw new Error(`eCFR: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const body = await res.text();
  // eCFR returns JSON {"error":"No matching content found."} for removed/absent sections
  if (body.trim().startsWith('{')) {
    return {
      error: `FCC regulation ${CITE} ${section} not found as of ${date}. Check the citation, or use fcc_regulations_search to find it.`,
      citation: `${CITE} ${section}`,
      part,
      date,
    };
  }
  const xml = body;

  const headMatch = xml.match(/<HEAD>([\s\S]*?)<\/HEAD>/);
  const heading = headMatch ? stripHtml(headMatch[1]) : null;
  const full = xmlToText(xml);
  const CAP = 30000;
  const truncated = full.length > CAP;
  const subpart = await lookupSubpart(section);

  return {
    citation: `${CITE} ${section}`,
    part,
    subpart: subpart ?? null,
    resolved_from: resolved_from ?? null,
    heading,
    text: truncated ? full.slice(0, CAP) : full,
    truncated,
    date,
    source: 'eCFR / FCC 47 CFR (Federal Communications Commission rules)',
    source_url: `https://www.ecfr.gov/current/title-${TITLE}/section-${section}`,
  };
}

async function searchRegulations(args: Record<string, unknown>): Promise<unknown> {
  const query = typeof args.query === 'string' ? args.query.trim() : '';
  if (!query) return { error: 'provide a query, e.g. "unlicensed device emission limits" or "amateur radio frequency bands"' };

  const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 20);

  // eCFR search returns one row per matching PARAGRAPH, so a single dense
  // section can fill an entire page. Dedupe by citation and walk up to 3 pages
  // (20/page, the API max) until `limit` distinct sections are collected.
  const seen = new Set<string>();
  const results: Array<Record<string, unknown>> = [];
  let total: unknown = null;

  for (let page = 1; page <= 3 && results.length < limit; page++) {
    const params = new URLSearchParams({
      query,
      per_page: '20',
      page: String(page),
      order: 'relevance',
    });
    params.append('hierarchy[title]', String(TITLE));

    const data = await ecfrGet(`/search/v1/results?${params.toString()}`);
    const meta = (data.meta as Record<string, unknown> | undefined) ?? {};
    if (total == null) total = meta.total_count ?? null;
    const rawResults = Array.isArray(data.results) ? (data.results as Array<Record<string, unknown>>) : [];
    if (rawResults.length === 0) break;

    for (const r of rawResults) {
      if (results.length >= limit) break;
      const h = (r.hierarchy as Record<string, unknown> | undefined) ?? {};
      const headings = (r.headings as Record<string, unknown> | undefined) ?? {};
      const hHeadings = (r.hierarchy_headings as Record<string, unknown> | undefined) ?? {};
      const part = h.part != null ? String(h.part) : null;
      const section = h.section != null ? String(h.section) : null;
      const subpart = h.subpart != null ? String(h.subpart) : null;
      if (!section && !part) continue;
      const heading =
        (typeof headings.section === 'string' && stripHtml(headings.section)) ||
        (typeof hHeadings.section === 'string' && stripHtml(hHeadings.section)) ||
        null;
      let citation: string;
      let source_url: string;
      if (section) {
        citation = `${CITE} ${section}`;
        source_url = `https://www.ecfr.gov/current/title-${TITLE}/section-${section}`;
      } else {
        citation = `${CITE} Part ${part}`;
        source_url = `https://www.ecfr.gov/current/title-${TITLE}/part-${part}`;
      }
      if (seen.has(citation)) continue;
      seen.add(citation);
      results.push({
        part,
        subpart,
        section,
        citation,
        heading,
        excerpt: stripHtml(r.full_text_excerpt ?? (r as Record<string, unknown>).excerpt).slice(0, 300),
        source_url,
      });
    }
    if (rawResults.length < 20) break;
  }

  return {
    query,
    total_matches: total,
    count: results.length,
    scope: 'FCC regulations — 47 CFR (Federal Communications Commission / telecommunications)',
    source: 'eCFR / FCC 47 CFR',
    results,
  };
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
