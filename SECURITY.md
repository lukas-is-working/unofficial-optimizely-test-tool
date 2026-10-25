# Security

Please report suspected security issues privately through the repository's GitHub security reporting mechanisms where available. Do not include API tokens, preview credentials, customer data or private URLs in public issues.

## Security model

- API tokens stay in `chrome.storage.local` and are used only by the service worker for Optimizely API requests.
- The page integration runs in the main world because Optimizely exposes its runtime there. It handles runtime data and user-requested variant commands, but it does not receive the API token.
- Dynamic UI values are HTML-escaped before being inserted into the popup.
- No remote JavaScript is fetched or executed.
- Broad host access is intentional so authorized users can test arbitrary local, staging and remote Optimizely environments.
