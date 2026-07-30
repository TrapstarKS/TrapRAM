This one is all repair work. No new features — a review turned up a set of bugs that only show themselves when two things happen at the same time, which is exactly when they are hardest to notice.

### Fixed

- TrapRAM could close itself while sitting in the background. Two saves landing at the same moment made one of them fail, and nothing was catching that failure.
- Launching two accounts in quick succession could mix their client profiles together, so one account's client ended up carrying another account's data. Launches now run one at a time.
- On macOS, two quick launches could claim the same client slot and leave a half-built copy of Roblox behind.
- A stalled connection left a launch hanging for five minutes with nothing on screen. Requests now give up after 20 seconds and tell you.
- Copying a cookie and then removing that account, or locking the vault, closed the app 45 seconds later.
- Syncing could quietly undo an edit made while the sync was still running.
- Buttons stayed clickable while they were still working, so a double click could unlock, save or add something twice.
- Dragging an account while a search or group filter was on rewrote the order of the accounts you could not see. Dragging now only applies to manual ordering, and an account lands exactly where you drop it.
- The dismiss button on a failed update notice did nothing.
- The address bar in the built-in browser reset itself while you were typing in it.
- After locking the vault, the unlock screen asked for a password even on keychain vaults.
- Settings still claimed the vault was protected by the keychain after you switched it to a master password.
- An interrupted profile swap could leave the wrong account's files saved under another account.

### Safer

- A page in the built-in browser can no longer hand anything but an http or https link to the operating system. Other protocols are how a web page reaches system tools it has no business touching.
- Redirects that leave the allowed sites are now stopped the same way a direct click is.
- The sync relay refuses any write that does not say which version it is replacing.

### Quieter

- Avatars are only fetched when they are missing or when you ask for a refresh, and the vault is only rewritten when something actually changed. Both cut most of the background disk and network work.
