# Security

GeoVyn | Author: Aseel ([@aseel-aihub](https://github.com/aseel-aihub))

GeoVyn is a static website. There is no server, no database, no login and no API keys,
so there is nothing on a server that can be attacked or leaked.

## Protections in the code

| Risk | Protection |
|---|---|
| XSS (html / script injection) | User text is added only with `textContent` / DOM nodes. No `innerHTML`, `eval` or `document.write` |
| Outside scripts | Content Security Policy: only the site's own files can run |
| Data leaks | `connect-src 'none'`: the page can not send data anywhere. Files are read only inside the browser |
| Third party libraries | Leaflet is stored in the project (no CDN). `npm audit`: 0 known issues |
| CSV formula injection | Exported text cells that start with `= + - @` get a `'` so Excel shows them as text |
| Bad or harmful uploads | `.csv` only, max 1 MB, max 300 rows, every column checked (id pattern, numbers, dates, allowed values) |
| Hidden text tricks | Control, zero width and text direction characters are removed |
| Freezing the page | Max 1500 linked works per file |
| Clickjacking | The page refuses to show inside a frame on another site |
| Privacy | No fonts, trackers or analytics. Map servers only receive the site name (`strict-origin-when-cross-origin`) |

## Report a problem

Email: aseelalqahtani.01@gmail.com
