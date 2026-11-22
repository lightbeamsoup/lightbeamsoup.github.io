# Maxwell

[Play Maxwell](https://www.joshcodes.ai/maxwell/)

Maxwell is a top-down gate-timing game. Balls bounce off the walls and each other. A glancing hit changes direction, while a head-on hit swaps the balls’ forward velocities. Click a seated demon or its striped barrier to toggle the gate. A gate waits for a clear doorway before it can close. The run ends on the first simulation step when every ball is in its own colored chamber and every gate is closed. The timer keeps running while any gate is open.

## Interface

The chamber view shows the entire arena, colored chamber labels, moving balls and their direction trails. Each gate changes from a striped barrier to a dotted opening. Run stats show active time, sorted balls and gate toggles. Pause or resume with the play control or Space when the board has focus. Use Tab and Enter for gates, or the numbered keys 1–9 for the first nine gates. The level strip previews each layout. All ten levels are available from the start.

## Campaign

| Level | Name | Chambers | Balls | What changes |
| --- | --- | ---: | ---: | --- |
| 1 | The Split | 2 | 2 | Open once for a pair of travelers, then close behind them |
| 2 | Short Circuit | 2 | 4 | Admit two staggered pairs and close behind each wave |
| 3 | The Elbow | 2 | 4 | Read the trail to pick the upper, lower, or sideways opening |
| 4 | Three’s Company | 3 | 6 | Trade the outer colors through Mint while protecting the residents |
| 5 | Dogleg | 3 | 6 | Send two colors beyond the middle room around a bend |
| 6 | Cross Purposes | 4 | 8 | Choose either side of a loop for opposite-corner deliveries |
| 7 | Pocket Change | 4 | 8 | Three outer rooms share the Honey pocket as their only interchange |
| 8 | Switchboard | 5 | 10 | Mix transfers through the hub with shortcuts around its edge |
| 9 | The Detour | 5 | 15 | Balls sharing a starting chamber need different exits |
| 10 | Grand Central | 6 | 18 | Mix short deliveries with three-boundary trips across a six-room ladder |

Run `node maxwell-service/playtest.js 12` for a repeatable timing and routing playtest. The player considers approaching balls and can click at most once per twelve simulation ticks (200 ms). The report shows the time, inputs, ball collisions, gates used, and longest gap between inputs. These are automated runs. The campaign tests also check a 400 ms input interval and recovery after a missed opening in the first three lessons.

## Saves and daily challenges

A first-party cookie stores campaign completion, selected level, personal bests, sound preference, an anonymous player identifier and the last leaderboard name for one year. An unfinished run starts over on reload. Clearing cookies creates a new player identity. Finishing a level saves the personal best automatically. Posting a public time is optional. Earlier campaign completions carry forward. Personal and global time rankings compare finishes on the current course layout with all gates closed. The collision edition has separate time rankings for both campaign and daily runs.

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
