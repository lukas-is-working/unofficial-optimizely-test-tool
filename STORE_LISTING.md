# Chrome Web Store Listing Draft

## Name

Unofficial Optimizely Test Tool

## Short description

Inspect and test Optimizely experiments, variants, cookies, events and share links.

## Detailed description

Unofficial community-built tooling for QA and development teams working with Optimizely Web experiments.

Features include:

- Detect active experiments on the current page.
- Select a variant, apply it and reload the page.
- Configure and set testing cookies, including local and remote shop environments.
- Inspect Optimizely runtime metadata and API-backed experiment details.
- View grouped Optimizely events and relevant network requests.
- Pause, clear and export the event log as CSV.
- Copy Optimizely snippets and API-provided variant share links.
- Generate QR codes locally for mobile testing.
- Use the tool in an incognito window after enabling Chrome's incognito permission.

This extension is not affiliated with, endorsed by, or sponsored by Optimizely.

## Support

Support is provided through the repository's GitHub Issues page.

## Privacy

Privacy policy: `https://lukas-is-working.github.io/unofficial-optimizely-test-tool/privacy-policy.html`

The extension stores the user's API token locally and sends it only to Optimizely's API for user-triggered requests. Page data, cookies and event logs are processed locally.

## Permission justifications

- `storage`: store local settings, API token and optional event-log preferences.
- `cookies`: read, set and remove user-selected testing cookies.
- `activeTab`, `tabs`, `scripting`: inspect the active page, communicate with the page runtime and support the popout.
- `declarativeNetRequestWithHostAccess`: implement the optional Optimizely snippet and cache test modes.
- `<all_urls>`: support local hosts and the remote shop environments selected by the user.
- `clipboardWrite`: copy snippets, commands and share links.
- `windows`: open the tool in a separate popout window.
