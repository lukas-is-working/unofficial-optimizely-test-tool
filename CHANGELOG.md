# Changelog

## [1.3.4] - 2026-11-13

### Changed

- Configured testing cookies now persist for 90 days instead of being session-only cookies.
- Cookie deletion continues to remove cookies immediately.

## [1.3.3] - 2026-11-13

### Fixed

- Removed duplicate Console logging for Optimizely Custom Events.
- Custom Events are now diagnosed through the central Optimizely listener only.
- The extension Event Log continues to record the actual event call once.

## [1.3.2] - 2026-11-05

### Improved

- Removed the redundant `Current:` prefix from variant dropdown options.
- The selected native dropdown option remains the single source of visible current-variant state.
- Improved spacing around variant IDs, experiment IDs and status badges.
- Kept variant IDs, share links and QR-code behavior unchanged.

## [1.3.1] - 2026-11-05

### Fixed

- Kept the header interactive while the Optimizely runtime warning is visible without allowing the content backdrop to drift during scrolling.
- Restored the full runtime check after using the reload controls.
- Kept the API setup dialog above the runtime overlay.
- Improved spacing in the initial API-token dialog.
- Matched the dark-mode Skip button to the other secondary buttons.

## [1.3.0] - 2026-11-05

### Added

- Added a one-time warning before copying potentially sensitive Optimizely share links.
- Added smooth disclosure animations for experiment details and event groups.
- Added a visible runtime overlay that only blocks the main content area.

### Improved

- Reload now restarts the complete runtime and API inspection flow.
- Header actions remain available while Optimizely is being checked.
- Unified action-button sizing in experiment cards.
- Improved dark-mode contrast for buttons, chevrons, cookie names, links and reset controls.
- Added a compact, consistent header action group.
- Improved the popup Easter egg with a readable themed message background.

### Fixed

- The Optimizely warning is hidden while a reload is still being evaluated.
- Runtime overlay positioning is limited to the visible area below the header.
- Theme storage failures fall back to the system theme.

## [1.2.0] - 2026-11-04

### Added

- Added a manually selectable dark mode for the popup and Settings page.
- Added system-theme detection as the initial theme choice.
- Added a small popup Easter egg with reduced-motion support.

### Improved

- Unified header action styling across light and dark themes.
- Improved dark-mode contrast for chevrons, links, event actions, buttons and cookie names.
- Improved experiment-card hierarchy and preserved the Optimizely link beside the experiment name.
- Improved tooltip, reset, cookie-control and event-log accessibility.
- Removed obsolete event and tooltip styling remnants.

### Fixed

- Prevented clicking the experiment link from toggling the disclosure accidentally.
- Added a fallback when theme storage cannot be read.

## [1.1.1] - 2026-11-04

### Fixed

- Clear now removes preserved event-log data from session storage.
- Event groups show the newest event timestamp.
- API status remains consistent after loading, cache reads and errors.
- Clipboard failures are no longer reported as successful copies.
- Experiment links retain their original red styling and hover behavior.
- Reset confirmation now explains all affected settings and restores an empty cookie configuration.
- Cookie removal buttons use contextual accessible labels.

### Improved

- Added unified accessible info tooltips for popup and Settings controls.
- Added event source badges, count bubbles and a “new since opened” filter.
- Improved experiment-card hierarchy and event-toolbar layout.

## [1.1.0] - 2026-11-04

### Added

- Unified accessible info tooltips for the popup and Settings page.
- Clearer API status badges and API check timestamps.
- More compact experiment cards with status and current experiment context in the summary.
- Event source badges, event counts, latest timestamps and a “new since opened” filter.
- Clearer event toolbar with grouped actions and an icon-only clear action.
- Reset confirmation that explains which settings and stored data will be removed or restored.

### Fixed

- Clearing the event log now also removes preserved events from session storage.
- Event groups show their newest occurrence as the summary timestamp.
- Copy actions no longer report success when the clipboard fallback fails.
- Cookie removal controls have contextual accessible labels.
- Removed obsolete event and tooltip styles after the UI redesign.

## [1.0.7] - 2026-10-28

### Improved

- Reformatted CSS, HTML and JavaScript for easier maintenance.
- Removed obsolete styling and documentation remnants.
- Consolidated accessible info icons and tooltips.
- Kept popup, settings and setup layouts consistent.
- Added the initial setup hint for configuring testing cookies in Settings.
- Preserved the existing security, token and runtime behavior while cleaning up the codebase.

## [1.0.6] - 2026-10-26

### Fixed

- Use the active tab's Chrome cookie store so testing cookies work in incognito windows.
- Verify cookies in the same store after setting or removing them.
- Keep API-provided variant share links on the currently active domain and path instead of using the domain embedded in the API link.

### Improved

- Explain the difference between the user-facing cookie label and the technical cookie name in Settings.

## [1.0.5] - 2026-10-25

### Fixed

- Stabilize the experiment-count badge during Optimizely initialization, tab switches and service-worker wakeups.
- Prevent stale badge values after a real page navigation.
- Keep QR-code actions separate from copy feedback.

## [1.0.4] - 2026-10-25

### Fixed

- Reduce badge flicker while the Optimizely runtime is initializing.
