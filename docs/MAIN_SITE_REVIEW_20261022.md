# Main-site corrective review — 22 October 2026

## Implemented

- Replaced the unsupported blanket encryption claim with an explicit browser-local, unencrypted, unsynchronized storage notice. Password hashing and encrypted exports are distinct from at-rest school data encryption.
- Updated onboarding to distinguish a local workspace from the separate teacher cloud pilot. Removed the DOM copy rewrite that concealed offline/local limitations.
- Isolated demo localStorage keys and IndexedDB database from real workspace records. Existing normal-workspace keys are preserved without migration or deletion. Reload resumes the demo namespace; logout returns to the normal namespace. Print ID cards, marksheets and certificates use the same isolation.
- Restored the student portal's demo explanation after logout. Static school profile details are explicitly unverified.
- Versioned changed bundles, print documents and service-worker dependencies, including the portal script/profile JSON and both storage adapters.

## Verification

84 automated tests pass. Behavioral checks cover demo writes preserving real records, reload/exit behavior, legacy demo session isolation, print-page reads, and demo notice after logout. Existing authorization, QR routing, teacher permissions, navigation and parent distribution tests remain green. JavaScript syntax and Git whitespace checks pass.

These are code/VM checks, not browser interaction or visual testing. The available tool session cannot drive a browser. Live HTTP/source verification is performed after deployment. No database, real school record, staff account, paid service or stored live-workspace data was modified.

## Remaining limitations

The main app is a local workspace, not a multi-device school backend. Teacher-cloud onboarding and parent synchronization need separately verified real account flows. This change does not add encryption to local records or claim it does. First-visit conversion-page improvements and a measured performance/code-splitting project are separate from these corrective fixes. No unsupported visual or Lighthouse score is claimed.
