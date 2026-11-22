# Maxwell

[Play Maxwell](https://www.joshcodes.ai/maxwell/)

Maxwell is a top-down gate-timing game. Every ball moves on its own. Click a seated demon or its striped barrier to toggle the gate. A gate waits for a clear doorway before it can close. The run ends on the first simulation step when every ball is in its own colored chamber and every gate is closed. The timer keeps running while any gate is open.

## Interface

The chamber view shows the entire arena, colored chamber labels, moving balls and their direction trails. Each gate changes from a striped barrier to a dotted opening. Run stats show active time, sorted balls and gate toggles. Pause or resume with the play control or Space when the board has focus. Use Tab and Enter for gates, or the numbered keys 1–9 for the first nine gates. The level strip previews each layout. All ten levels are available from the start.

## Campaign

| Level | Name | Chambers | Balls | What changes |
| --- | --- | ---: | ---: | --- |
| 1 | The Split | 2 | 8 | One central gate between equal rooms |
| 2 | Short Circuit | 2 | 10 | A narrow room shortens the return trip |
| 3 | The Elbow | 2 | 10 | Interlocking L-shaped rooms share several openings |
| 4 | Three’s Company | 3 | 9 | The middle room becomes a passage |
| 5 | Dogleg | 3 | 9 | Offset walls interrupt a straight route |
| 6 | Cross Purposes | 4 | 12 | A four-room loop offers alternate paths |
| 7 | Pocket Change | 4 | 12 | A small interior pocket meets larger rooms |
| 8 | Switchboard | 5 | 15 | Four outer rooms surround a shared hub |
| 9 | The Detour | 5 | 20 | Uneven rooms require longer transfers |
| 10 | Grand Central | 6 | 24 | Six colors share interconnected junctions |

## Saves and daily challenges

A first-party cookie stores campaign completion, selected level, personal bests, sound preference, an anonymous player identifier and the last leaderboard name for one year. An unfinished run starts over on reload. Clearing cookies creates a new player identity. Finishing a level saves the personal best automatically. Posting a public time is optional. Earlier campaign completions carry forward. Personal and global time rankings compare finishes under the current closed-gate rule.

Ten Toggles uses the same UTC-date seed for everyone and permits ten successful gate changes, counting each open and close separately. The final gate closure counts toward the limit. The daily ranking is separate from every campaign ranking. Each board lists the fastest twenty players and keeps each player's best verified run. Time measures active simulation time and excludes pauses.

## Development and deployment

From the repository root, serve the site with `python -m http.server 4188 --bind 127.0.0.1` and visit `http://127.0.0.1:4188/maxwell/`. Use Node 24 to run the verification suite.

```sh
node --test maxwell-service/game.test.js
npx wrangler d1 migrations apply maxwell-scores --local --config maxwell-service/wrangler.jsonc
npx wrangler dev --config maxwell-service/wrangler.jsonc --port 8787
```

GitHub Pages serves the static game from the site's main branch. The dedicated Cloudflare Worker replays each submitted gate sequence in segments against the shared fixed-step engine. D1 stores the verified best times and temporary verification state. Worker and client must use matching simulation rules. Preserve old board versions or start fresh rankings when changing those rules.

```sh
npx wrangler d1 migrations apply maxwell-scores --remote --config maxwell-service/wrangler.jsonc
npx wrangler deploy --config maxwell-service/wrangler.jsonc
```

## Artwork

The logo and gatekeeper use [the same transparent sprite](assets/maxwell.png). The built-in ImageGen tool generated it from this prompt.

> Use case: logo-brand. One full body character sticker sprite for Maxwell, a cute arcade puzzle game. A mischievous round mulberry-purple imp, two small curved pale apricot horns, pointed bat ears, tiny wings, curved spade-tail, two big expressive cream eyes, one snaggle tooth, delighted grin. Seated on an invisible ledge facing viewer with skinny little dangling legs in plum shoes. Beautiful playful 1990s hand inked cel cartoon, very distinct dark aubergine chunky outlines, solid lilac and violet colors, little coral pink accents, readable at 48px. Isolated single character centered on genuine transparent background, no ground or shadow, no ledge, no lettering, no border. No extra objects.

Bricolage Grotesque is bundled under the SIL Open Font License in `assets/OFL.txt`.
