# Changelog

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
