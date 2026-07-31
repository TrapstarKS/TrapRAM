Two new ways to sign in, groups that finally do something, and a guard for anyone who plays behind a VPN.

### Added

- Add an account by approving it on your phone. TrapRAM shows a QR code and a six-character code — scan it with the Roblox app, approve, and the account lands here. No password to type, no cookie to paste. Once you scan, the name of the account you picked shows up here while it waits on your confirmation.
- Quick log in with a code, the other direction: take the code a phone or a console is showing, hand it to an account you already keep here, and that device ends up signed in. TrapRAM shows which device and which location asked before anything is approved. A code that arrives from someone else signs *them* in as you, so this one is never approved blind.
- Passwords. Signing in through the built-in browser now keeps the password next to the session, and any account can have one typed in by hand. Copy username and copy password live in the account menu, and copying a password clears the clipboard after 45 seconds, the same as copying a cookie already did.
- Groups work. Typing a group name on an account creates the group, its filter chip appears above the list, and the group disappears on its own when the last account leaves it. Colours come from the name, so two devices agree on them without sending anything extra through the relay.
- Editing several accounts at once. Select any number of accounts, open the editor on one of them, and the group and note apply to all of them. Aliases and passwords stay per account.

### Safer

- Sessions are now pinned to the country they were added from. Roblox ties a session to where it was created, so renewing a cookie or launching from a VPN in another country can cost you that session — and the automatic renewal sweeps every account at once, unattended, which is the worst possible place for that to happen. TrapRAM records the country when an account is added, then holds back any renewal or launch for accounts that do not match where you are now, naming both countries so you can see what it is refusing and why. Turn the VPN off, or paste that account's cookie again from where you are, to move it to a new home.

### Fixed

- The account menu was trapped inside the scrolling list, so reaching an item on the last few accounts meant scrolling to it first. It now opens above the whole window, and flips upwards when it is near the bottom.
