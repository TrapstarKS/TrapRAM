See where a player is before joining, with a clearer interface from account selection to launch.

### Added

- Player actions now show whether someone is offline, online, in a game or in Roblox Studio, along with the experience name and Place ID when Roblox shares them.
- Player activity refreshes automatically every 15 seconds and can be refreshed manually. Hidden activity and connection errors have their own explanations.
- Join server checks the displayed destination again before launching. If the player changes games or servers, TrapRAM stops the join and asks you to refresh.
- Account selection now has checkboxes, select-all for visible accounts, a clear selection action and a count of selected accounts outside the current filter.

### Improved

- Refreshed layouts, spacing, typography and contrast across the app, with clearer navigation and better support for narrow windows, light mode and dark mode.
- Keyboard navigation, visible focus, accessible field labels and dialogs that keep focus inside and return it when closed.
- Game launch and favourite actions stay visible without hovering. Loading, empty and error states explain what to do next.
- Player actions account for differences in visibility between selected sessions. Only accounts that can see the displayed server are included in the join request.

### Fixed

- Accounts with expired or missing sessions no longer enable launch actions or silently fall back to another account.
- Repeated clicks cannot queue duplicate launches, and saved favourites keep their exact server destination.
- Experience fields accept Roblox game links and validate Place IDs. Changing the experience clears old server results.
- Older player lookups, presence checks and search responses no longer replace newer results.
- Failed saves keep your inputs open for correction or retry. Removed accounts and locked vaults clear stale selections.
- Newly added accounts and launch times appear immediately, without waiting for a later refresh.
