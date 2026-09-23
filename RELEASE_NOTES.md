Stop TrapRAM's built-in browser from retaining renderer processes after its window closes.

### Fixed

- Closing an account browser now destroys its content and toolbar web contents, preventing renderer processes from accumulating until TrapRAM consumes gigabytes of RAM.
- Temporary login and browser sessions now release listeners, extensions, connections and cached data when they finish.
- Reopening the main window on macOS no longer duplicates auto-updater listeners or timers.
- The renderer keeps at most 50 toast messages so repeated errors cannot grow the UI state without limit.
