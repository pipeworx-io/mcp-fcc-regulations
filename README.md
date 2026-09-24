# mcp-fcc-regulations

FCC Regulations MCP — US Federal Communications Commission rules (47 CFR).

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1679+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `fcc_regulation` | Get the full text of one FCC regulation — a US Federal Communications Commission rule codified in 47 CFR — by its citation. Returns the exact regulatory wording currently in force. Answers "what does 47 CFR 15 require", "what is the FCC rule for X", "does the FCC allow X", "read 47 CFR 15.247", "the FCC RF emissions limit". Forgiving citation input: "15.109", "47 CFR 15.109", "§15.247", "15.247(b)" (paragraph stripped to the section), "Part 97". Covers telecommunications regulation across all of Title 47: Part 15 unlicensed devices and RF emissions limits, Part 97 amateur radio, Part 2 equipment authorization and frequency allocations, Part 73 broadcast radio and TV, Part 76 cable, Part 25 satellite, Parts 24/27 wireless and spectrum, Part 64 common carrier and telephone rules, Part 11 emergency alert system, Part 9 911. Also accepts common names: "amateur radio", "unlicensed devices", "equipment authorization", "RF exposure limits". Pass a whole part (e.g. "15" or "Part 97") to get that part's section list. Example: fcc_regulation({ citation: "15.109" }) -> radiated emission limits; fcc_regulation({ citation: "97.301" }) -> amateur radio authorized frequency bands. Keyless. This pack is the FCC RULES text; the separate `fcc` and `data-fcc` packs serve FCC filings and licensing data (ULS licenses, ECFS comments, broadband maps). |
| `fcc_regulations_search` | Keyword search across the FCC regulations — US telecommunications rules in 47 CFR. Answers "what FCC regulations cover X", "the FCC rule about X", "find the telecommunications regulation for X", "which radio / spectrum / wireless rule applies to X". Great for topics: unlicensed device emission limits, Part 15 intentional and unintentional radiators, RF exposure and radiofrequency radiation limits, equipment authorization and certification, amateur radio operating privileges, spectrum and frequency allocations, broadcast station licensing and ownership, cable and satellite carriage, robocalls and caller ID, 911 and emergency alerting, wireless and common carrier obligations. Returns matching FCC rules with citation (47 CFR), heading, excerpt, and source URL. Example: fcc_regulations_search({ query: "unlicensed device emission limits" }); fcc_regulations_search({ query: "amateur radio frequency bands", limit: 15 }). Keyless. Searches the FCC RULES text; the separate `fcc` and `data-fcc` packs search FCC filings and licensing data. |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "fcc-regulations": {
      "url": "https://gateway.pipeworx.io/fcc-regulations/mcp"
    }
  }
}
```

### What this endpoint actually serves

`tools/list` at `https://gateway.pipeworx.io/fcc-regulations/mcp` returns the tools in the table
above **plus the shared Pipeworx meta-tools** — `ask_pipeworx`,
`discover_tools`, `search_within`, `remember`/`recall` and the rest of the
gateway-wide set. So the tool count you see is larger than this table: a
single-pack endpoint currently lists roughly 30 shared tools alongside the
pack's own. The connection's `initialize` response states its exact scope, and
is the authoritative answer for a given day.

This is deliberate, not multiplexing by accident. The meta-tools are what let a
scoped connection answer a question this pack does not cover — via
`ask_pipeworx`, which routes across the whole catalog — without you adding a
second MCP server. There is currently no way to mount a pack endpoint without
them; if the extra schemas cost you more context than the routing is worth,
connect to the full gateway once rather than to several pack endpoints.

Or connect to the full Pipeworx gateway to get every pack's tools listed
directly, instead of just this one's:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

Both URLs reach the same gateway and the same 1679+ data sources. The
only difference is which pack's tools are listed **directly**; `ask_pipeworx`
reaches all of them from either one.

## No MCP client? Call it over HTTP

```bash
curl -X POST https://gateway.pipeworx.io/v1/tools/fcc_regulation \
  -H 'Content-Type: application/json' \
  -d '{"citation":"15.109"}'
```

No account needed for the first calls. Inspect any tool: `GET https://gateway.pipeworx.io/v1/tools/fcc_regulation`. Find one: `POST https://gateway.pipeworx.io/v1/tools/search_packs` with `{"query":"..."}`.

## Standalone (no gateway account)

This package also runs as a local stdio MCP server — no Pipeworx account, no
gateway round-trip:

```json
{
  "mcpServers": {
    "fcc-regulations": {
      "command": "npx",
      "args": ["-y", "@pipeworx/mcp-fcc-regulations"]
    }
  }
}
```

Or run it directly to confirm it starts:

```bash
npx -y @pipeworx/mcp-fcc-regulations
```

It speaks MCP over stdin/stdout and answers `initialize`/`tools/list`/`tools/call`
for **only** this pack's tools — none of the shared meta-tools the gateway
connection above adds. Same source, same tools, no ask_pipeworx routing.

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English —
this works on the pack endpoint above as well as on the full gateway:

```
ask_pipeworx({ question: "your question about Fcc Regulations data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
