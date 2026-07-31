Paste a list of accounts and let TrapRAM sign every one of them in.

### Added

- Bulk import now accepts `username:password` lines, not just cookies. Paste a list of either — or both mixed together — and TrapRAM opens each one, types the credentials in, and signs in on its own. A handful of windows open at a time, cycling to the next account as each one finishes, however many you pasted.
- Private servers can be renamed after they're saved, instead of being stuck with whatever name they had when added.

### Fixed

- A bulk import list longer than 10 lines used to quietly drop everything past the tenth account. It now processes the whole list.
- The password saved for an account signed in through bulk import was sometimes left blank even when the sign-in worked. It now always matches the password that was actually used.
