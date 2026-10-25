# Unofficial Optimizely Test Tool

Unofficial community-built Chrome extension for testing Optimizely experiments and events.

This project is not affiliated with, endorsed by, or sponsored by Optimizely.

Current version: `1.0.2`

## Distribution

Send the complete `optimizely-test-tool` folder as a ZIP file. Do not include personal files or real API tokens. Each user enters their own token locally.

## Chrome Web Store installation

For the unlisted Chrome Web Store release, open the direct Store link and click **Add to Chrome**. The extension is not shown in public search results.

## Local/Beta installation

1. Extract the ZIP file.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the extracted `optimizely-test-tool` folder.
6. Pin the extension using Chrome's puzzle-piece menu.

After changing the extension folder, click **Reload** on the extension card. Reload the shop page as well.

## API token

The API token is optional. Without it, runtime features such as experiment detection, variant switching, cookies, events and snippets remain available. The token enables additional metadata and Optimizely-generated share links.

The token is stored locally in Chrome and can be removed from **Settings** at any time.

## Popup features

- **Test cookies**: set or remove any cookies configured in Settings.
- **Active experiments**: show experiments detected on the current page.
- **Variant selection**: select a variant, send `bucketVisitor` and reload the page.
- **Copy variant snippet**: copy a `bucketVisitor` command for browsers without the extension.
- **Variant share link**: copy an API-provided Optimizely share link or display it as a locally generated QR code.
- **Event log**: inspect grouped Optimizely and relevant Optimizely network events.
- **Pause**: stop recording new events without deleting the existing log.
- **Export CSV**: export the current event log.
- **Debugging**: disable Optimizely console logging or block the Optimizely script.

## Store submission notes

The extension package alone is not a complete Chrome Web Store submission. A public listing also needs a stable HTTPS privacy-policy URL, a support/contact URL, screenshots, store artwork and completed data-use declarations.

The listing should keep the non-affiliation disclaimer and explain the broad host, cookie, scripting and active-tab permissions. Do not upload API tokens, preview links, customer data or development artifacts.

## Incognito mode

1. Open `chrome://extensions`.
2. Open the extension's **Details** page.
3. Enable **Allow in incognito**.
4. Open the extension in an incognito window.

Chrome requires this setting to be enabled manually. Reload the incognito page after changing it.

## Notes

- Reload the shop page after changing cookies or debugging settings.
- If Optimizely is not loaded, check cookie consent and whether the Optimizely script is present.
- API metadata requires a valid token with sufficient Optimizely permissions.
- QR codes are generated locally; share links are not sent to a QR-code service.
- This extension is currently intended for Chrome and local unpacked installation.

## Privacy and permissions

- The API token is stored only in `chrome.storage.local` and is sent only to `https://api.optimizely.com` for authenticated API requests.
- The API token is not synchronized, injected into pages, logged or exported by the extension. Optimizely-generated share links are treated as opaque API data; users should handle any preview credentials contained in such links as sensitive.
- QR codes are generated locally in the extension.
- Page access, scripting, cookies and broad host access are required to inspect experiments, manage configured cookies and support local as well as remote shop domains.

## Privacy policy text

The extension has no remote backend. It stores the personal API token locally in Chrome and sends it only to Optimizely's API for user-triggered validation and metadata requests. Page runtime state, cookies and event logs are processed locally. The extension does not sell personal data or transfer it to an analytics service. Users can remove the stored API token from Settings.

The public privacy policy is intended to be published through GitHub Pages at:

`https://lukas-is-working.github.io/unofficial-optimizely-test-tool/privacy-policy.html`

Use that HTTPS URL in the Chrome Web Store privacy section after GitHub Pages has been enabled.
