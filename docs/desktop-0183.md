# Desktop 0.183.0 entry design

- Unified lavender palette with separate light/dark surfaces, legible status text, white-label primary login action, and quiet support links.
- Restored branded header and card; hid redundant draggable title text while preserving window dragging.
- Explicit logout, login-required, connection-error and connecting copy. Existing authentication/credential clearing paths unchanged.
- Electron fixture checks logout/login/error states, login action visibility, private workspace hidden, 618px card bounds and light/dark screenshots. No live authentication or credentials modified.

Invitation correction: clipboard now contains the installed version's direct .exe release asset URL, not the release file listing. Earlier copied links remain unchanged. Download does not grant account access.
