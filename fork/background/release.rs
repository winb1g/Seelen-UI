//! [fork] Release identity of the fork: the key that signs its builds and where its updates are published.
//!
//! Hooked into upstream from `src/background/utils/updater.rs` (updater key + endpoints) and
//! `src/background/utils/integrity/checksums.rs` (bundle integrity key), see FORK.md and `fork/docs/releasing.md`.
//! Without these, a fork build would fail its own integrity check (upstream's key) and update itself back to
//! the official upstream release.

/// Minisign public key (as printed by `npx tauri signer generate`, base64) that verifies fork releases: the
/// updater signature of the installer and the `SHA256SUMS.sig` of the bundled static files.
///
/// Empty until the fork key pair is generated; the release workflow refuses to build while it is empty.
pub const SIGN_PUB_KEY: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEFEMzE0QzVBN0Y5RDMzRDEKUldUUk01MS9Xa3d4clRSVFQ4UnNYOTJXVFgvdk15MlFIaWZmd1lUZ1N3TklManIvTFN3N3FvSk0K";

/// `latest.json` of the latest fork release, published by `.github/workflows/fork-release.yml`.
pub const RELEASE_ENDPOINT: &str =
    "https://github.com/winb1g/Seelen-UI-tweaks/releases/latest/download/latest.json";

/// The fork has a single release stream, so the nightly channel uses the same manifest. Kept separate so the
/// upstream channel setting keeps working and a fork nightly stream can be added later without a new hook.
pub const NIGHTLY_ENDPOINT: &str = RELEASE_ENDPOINT;
