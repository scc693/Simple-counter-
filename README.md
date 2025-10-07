# Clicker Counter PWA

An offline-ready clicker counter with a printable tape workflow. Built with vanilla HTML, CSS, and JavaScript—no build step required.

## Features

- Reliable increment, decrement, and reset controls with long-press auto-repeat that avoids double-counting and supports arrow key shortcuts.
- Description-based sequencing that tracks separate counts for each label, with per-label title modes (simple numbers, hidden, or custom prefixes).
- Job context field stored with every tape entry for downstream grouping.
- "Print to Tape" workflow that logs timestamped entries and automatically advances sequences.
- Daily tape that preserves every Print-to-Tape event for the current calendar day.
- One-click daily CSV export combining the main and daily tapes, with an optional post-export day reset.
- Persistent tape log with export/print view optimized for PDF and hard-copy records.
- Dedicated "Clear Day / Reset All" action to clear the counter, tapes, and sequences without touching global preferences.
- Optional haptics and audio feedback, plus theme and compact layout toggles.
- Full offline support via service worker precaching for GitHub Pages hosting.
- Print preview with a dedicated Close button for returning to the main counter.

## Getting Started

1. Clone the repository:

   ```bash
   git clone https://github.com/your-username/clicker-counter-pwa.git
   cd clicker-counter-pwa
   ```

2. Serve the site locally (any static file server works). For example with Python:

   ```bash
   python -m http.server 8000
   ```

3. Visit `http://localhost:8000` in your browser to use the app.

## Keyboard Shortcuts

| Action | Keys |
| --- | --- |
| Increment | `ArrowUp` |
| Decrement | `ArrowDown` |
| Reset | `0`, `R` |
| Print to tape | `Shift` + `P` |

Standard button interactions (`Space` / `Enter`) continue to work when the increment or decrement buttons are focused.

## Deploying to GitHub Pages

1. Commit and push the repository to GitHub.
2. In the repository settings, open **Pages**.
3. Under **Source**, choose **Deploy from a branch**.
4. Select the `main` branch and the `/ (root)` folder, then save.
5. After Pages builds, the PWA will be live at `https://<your-username>.github.io/clicker-counter-pwa/`.

The service worker is configured for the root path. If you publish to a subdirectory, adjust the cached paths inside `sw.js` accordingly.

## License

Released under the [MIT License](LICENSE).
