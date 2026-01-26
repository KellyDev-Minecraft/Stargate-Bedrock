# Changelog - Stargate Bedrock

## [1.1.38] - 2026-01-25
### Fixed
- Fixed `LocationInUnloadedChunkError` during database initialization at world center.
- Fixed sign reset timing and reliability via temporary ticking areas.

### Added
- **Symmetric Activation**: Portals at both ends now open and close in sync.
- **Bi-directional Teleportation**: Travelers can now return through the destination gate.
- **Gate Edit UI**: Configure name, network, and options by using the Casting Guide on an existing gate.
- **Network Selection**: Dropdown menu in setup and edit UIs for choosing existing networks.
- **Network Options**: Ported options from legacy:
    - **Hidden**: Hide gate from dialer lists.
    - **Always On**: Portal stays open until manually closed.
    - **Private**: Owner-only access.
    - **Backwards**: Exit through the rear of the gate.
    - **No Network**: Hide network name on signs.
    - **Quiet**: Disable departure/arrival messages.
- **Automated Versioning**: Build script now generates `version.js` from `manifest.json`.
  **Casting Guide: Gate Edit UI**: The Casting Guide can now be used on an existing gate to edit its name, network, and options. 

### Changed
- Refactored `findGateByBlock` to support backward compatibility for older gates.
- Consolidated all block interaction listeners into a unified system in `events.js`.
- Startup maintenance now automatically repairs missing frame and portal data for existing gates.
