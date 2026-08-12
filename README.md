# ts

Reader mode for the terminal — search, read, and watch, without leaving it.

```
ts "some search query"          # search, show clean excerpts, pick a result to read
ts "query" --ai                 # also fetch an AI overview of the query
ts https://example.com/article  # fetch a page, strip chrome, print as markdown
ts https://example.com/file.pdf --download report.pdf
ts https://youtube.com/watch?v=... --preview   # play a video inline in the terminal
ts https://youtube.com/watch?v=... --audio     # audio-only playback, no video rendering
ts yt "search query"            # search YouTube, pick a result to play inline
ts yt <video-id-or-url>         # play a video directly
ts login https://example.com    # open a real (visible) browser window to log in / solve a captcha by hand
```

Search results (and `yt` results) are paginated: pick `1`-`N` to open a result,
`9` for less relevant results, `8` to go back, `0` to quit.

Session state (cookies, logins) lives in `~/.ts/profile` — a persistent Chromium
profile reused across every run. `ts login <url>` is the only command that opens
a visible window; it does nothing on your behalf, it just gives you a window to
authenticate in, then saves the resulting session for future headless runs.

Downloaded files land in `~/ts/downloads`.

Video playback (`--preview`, `ts yt`) renders inline via
[impv](https://github.com/gremstard/impv) — install it separately.

## Setup

```
npm install
npx playwright install chromium
brew install yt-dlp ffmpeg
brew install gremstard/tap/impv   # terminal video renderer, used by --preview / ts yt
npm link                          # puts `ts` on your PATH
```

Or, once published: `brew install gremstard/tap/ts`.
