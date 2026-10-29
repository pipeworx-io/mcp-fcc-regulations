# mcp-fcc-regulations

FCC Regulations MCP — US Federal Communications Commission rules (47 CFR).

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1856+ live data sources. This is an independent, unofficial integration — not affiliated with, endorsed by, or published by the upstream provider.

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

Both URLs reach the same gateway and the same 1856+ data sources. The
only difference is which pack's tools are listed **directly**; `ask_pipeworx`
reaches all of them from either one.

## No MCP client? Call it over HTTP

```bash
curl -X POST https://gateway.pipeworx.io/v1/tools/fcc_regulation \
  -H 'Content-Type: application/json' \
  -d '{"citation":"15.109"}'
```

No account needed for the first calls. Inspect any tool: `GET https://gateway.pipeworx.io/v1/tools/fcc_regulation`. Find one: `POST https://gateway.pipeworx.io/v1/tools/search_packs` with `{"query":"..."}`.

## Run it from npm

`@pipeworx/mcp-fcc-regulations` is a local stdio bridge to the Pipeworx gateway: your MCP client
starts it with `npx`, and it forwards every call to the same
`https://gateway.pipeworx.io/fcc-regulations/mcp` endpoint shown above. It needs network access;
there is no offline mode.

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

Without a key it calls anonymously, capped at 50 calls a day. A free account
raises that to 200 a day: get a key at https://pipeworx.io/signup and add
`"env": { "PIPEWORX_API_KEY": "<your key>" }` to the server entry.
The key is sent as a Bearer token, the same way a hosted connection sends it,
so calls are metered and billed exactly as they are there.

It lists **only** this pack's tools by default. Set `PIPEWORX_META_TOOLS=1` to
also list `ask_pipeworx` and the other gateway-wide tools.

Behind an HTTPS proxy: Node's built-in `fetch` does not read `HTTPS_PROXY` by
default. Newer Node releases honour it when `NODE_USE_ENV_PROXY=1` is set; check
your Node version's documentation.

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
