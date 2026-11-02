# Web admin release 1.0.26

The existing Render API also serves the versioned admin web bundle at `/admin/login` and all `/admin/*` deep links. Its API authentication and data are shared with Android. Only `/admin/*`, `/_expo/*`, and `/assets/*` are added; API and existing public share/privacy routes retain their behavior.

Source: `feat/admin-control-center-v2`, commit `8228bf771e7fbb7c4ab534324dd3db5b88a0ea46`. Build with Node 22: `cd frontend && npm ci --legacy-peer-deps && npx expo export --platform web --output-dir dist-admin`. Copy the export contents to `backend/admin_web_assets/` and update this checksum when publishing another web version. Generated assets are committed for the existing Python service to serve without adding Node to its startup process.

Entry bundle SHA-256: `f6549789939e11079e3d09a200716d4fc1a287c1aa0058d4ecb5c06f480d8347`.

The Hostinger custom-domain frontend remains a separate upload. This deployment does not alter DNS or email settings. Both web interfaces call the same API. Google Play requires the signed Android v26 build to be uploaded and released separately.
