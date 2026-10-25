---
layout: default
title: Unofficial Optimizely Test Tool Privacy Policy
---

# Privacy Policy

**Effective date: October 25, 2026**

The Unofficial Optimizely Test Tool is a browser extension for inspecting and testing Optimizely experiments. It is an independent community project and is not affiliated with, endorsed by, or sponsored by Optimizely.

## Data processed

The extension processes the following data when the user uses the related feature:

- A personal Optimizely API token entered by the user.
- Optimizely runtime data, experiment metadata and events on the current page.
- Cookies selected by the user for testing.
- URLs and event payloads needed for the local event log and CSV export.

## How data is used

- The API token is stored locally in the browser and is sent only to `https://api.optimizely.com` for user-triggered token validation and metadata requests.
- Page data, cookies, experiments and event logs are processed locally by the extension.
- The extension does not sell data, use it for advertising, or send it to an analytics service.
- QR codes are generated locally. Share links returned by Optimizely are treated as sensitive by the extension and are not sent to a QR-code service.

## Retention and deletion

The API token and extension settings remain in the user's Chrome profile until removed through Settings or Chrome's extension storage. Event logs are kept in Chrome extension storage while the related tab is open and may optionally be preserved across reloads when the user enables that setting. They can be cleared in the popup. Removing the extension removes its stored data according to Chrome's storage behavior.

## Third parties

Optimizely receives API requests when the user configures an API token and uses API-backed features. The user may also explicitly copy or open Optimizely-generated share links, including through a locally generated QR code. Those requests are governed by Optimizely's own privacy terms. No other remote backend is operated by this project.

## Contact

For questions or issue reports, use the repository's GitHub Issues page.

## Changes

This policy may be updated when the extension's data handling changes. The effective date above will be updated with material changes.
