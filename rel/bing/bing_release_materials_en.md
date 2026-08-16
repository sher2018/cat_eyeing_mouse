# Microsoft Edge (Bing) Add-ons Release Materials — Cat Eyeing Mouse v1.0.0 (English)

> This file contains the full publishing process and all copy-ready text materials for releasing to Microsoft Edge Add-ons (the Microsoft/Bing browser extension store), English version.
> For the Chinese version, see [bing_release_materials_zh.md](file:///d:/desktop/proj/9.cat_mouse/cat_eyeing_mouse/rel/bing/bing_release_materials_zh.md).
> Edge is Chromium-based: the same MV3 ZIP package built for Chrome can be reused without code changes.

---

## 1. Publishing Process Overview (Partner Center Submission Flow)

| Step | Action | Entry point |
|------|--------|-------------|
| 1 | Register a Microsoft Partner Center developer account (free) | https://partner.microsoft.com/dashboard/microsoftedge |
| 2 | Build and package the extension ZIP (same package as Chrome) | Local `npm run build` + PowerShell packaging |
| 3 | Create a new extension and upload the ZIP | Partner Center → Create new extension |
| 4 | Enter availability information (visibility/markets) | Availability page |
| 5 | Enter properties (category/website/support) | Properties page |
| 6 | Enter privacy information (single purpose/permission justifications/remote code/data usage/privacy policy) | Privacy page |
| 7 | Enter store listing details for each language | Store listings page |
| 8 | Enter certification testing notes and submit (certification usually completes within a few business days) | Submit button |

---

## 2. Materials Required at Each Step

### Step 1: Developer account registration
- Sign in to Partner Center with a Microsoft account
- Register with the Microsoft Edge program: **free** (company accounts require extra verification)
- Developer/organization display name (shown publicly)
- Contact email (displayed publicly for user feedback)

### Step 2: Build and package the ZIP
```powershell
npm install
npm run build
Compress-Archive -Path manifest.json, _locales, src, res, dist -DestinationPath release/cat-eyeing-mouse-v1.0.0.zip -Force
```
- `manifest.json` must be directly visible at the ZIP root (no nested folder)
- Must include: `manifest.json`, `_locales/`, `src/`, `res/`, `dist/content.js`
- Must exclude: `doc/`, `node_modules/`, `.trae/`, `readme.md`, `package*.json`
- Package size ≤ 2MB
- Note: after upload, Partner Center automatically detects English and Chinese (Simplified) listings from the `_locales` folder

### Step 3: Create a new extension and upload
- Upload the ZIP → it is validated and the version is listed
- Fix any validation errors and re-upload if needed

### Step 4: Availability
| Field | Value for this project |
|-------|-------------------------|
| Visibility | Public: discoverable via search and browsing |
| Markets | Default "All markets" (keep the default) |

### Step 5: Properties
| Field | Required | Value for this project |
|-------|----------|------------------------|
| Category | Required | Entertainment |
| Website | Optional | [Project homepage / GitHub URL] |
| Support contact details | Optional | [Support email or support page URL] |
| Adult content | Optional | Unchecked (no adult content) |

### Step 6: Privacy page
| Field | Required | Content to enter |
|-------|----------|-------------------|
| Single purpose description | Required | See [3.5](#35-single-purpose-description) |
| Permission justifications (one per permission) | Required | See [3.6](#36-permission-justifications) |
| Remote code usage | Required | No → See [3.7](#37-remote-code-declaration) |
| Data usage disclosures (checkboxes) | Required | No user data collected → See [3.8](#38-data-usage-disclosures-checkboxes) |
| Privacy policy URL | Required if privacy info is collected (strongly recommended here) | Host the policy and paste the URL |

### Step 7: Store listings (one per language: English + Chinese Simplified)
| Field | Limit | Notes |
|-------|-------|-------|
| Extension name | Must match manifest | Cat Eyeing Mouse (auto-filled from manifest) |
| Short description | ≤100 characters | Auto-filled from manifest |
| Description | **250 - 10,000 characters** | The manifest description is too short — must be replaced with a long description → See [3.3](#33-detailed-store-listing-description) |
| Extension logo | 1:1 ratio, ≥128x128, 300x300 recommended | Required for each language (same image can be reused) |
| Small promo tile | 440x280, required | Required for each language |
| Large promo tile | 920x680, recommended | Same image can be reused |
| Screenshots | At least 1, 1280x800 recommended | Each needs a caption (≤100 characters) → See [3.11](#311-screenshot-captions) |
| YouTube video | Optional | [Demo video URL, if any] |
| Search terms | Up to 7, semicolon-separated | See [3.12](#312-search-terms) |

> Tip: the listing status only turns "Complete" (and allows submission) after ALL required fields (name, description ≥250 characters, logo, small promo tile, screenshots) are filled for the language.

### Step 8: Certification testing notes and submission
- Fill in certification testing notes (to help testers verify) → See [3.10](#310-certification-testing-notes)
- Click "Submit" → certification usually completes within a few business days (new submissions may take up to ~7 business days)
- Results arrive via the registered email and the dashboard

---

## 3. Copy-Ready Text Materials (English)

### 3.1 Extension name
```
Cat Eyeing Mouse
```

### 3.2 Short description (auto-filled from manifest)
```
A cute cat follows your cursor and reacts to its movement.
```

### 3.3 Detailed store listing description
> Must be 250 - 10,000 characters. The short manifest description does not meet the minimum — replace it with the following full text.

```
Cat Eyeing Mouse — bring an adorable cat to every webpage you visit.

Once installed, a cute little cat floats at the bottom-right corner of the page and follows your cursor in real time with its eyes and posture, like a focused hunter watching its prey. It's more than a decoration — it's a living desktop pet:

KEY FEATURES
• 8-direction pose tracking: the cat switches between 8 directions as your cursor moves, and enters a focused center pose when you hover right over it
• Smooth transitions: Canvas-based crossfade rendering makes every pose change buttery-smooth
• Free dragging: drag the cat anywhere on the page; its position is remembered across page reloads
• Smart resting: after 10 seconds of mouse inactivity, the cat leans back to rest and perks up instantly when you move again
• One-click show/hide: toggle the cat from the toolbar popup, with an optional viewport clamp so it never gets lost
• Bilingual UI: automatically matches your browser language (English / Simplified Chinese)

PRIVACY & PERFORMANCE
• Zero data collection: runs fully locally — no network requests, no analytics, no tracking
• Zero configuration: install and enjoy; Shadow DOM isolation keeps page styles untouched
• Feather-light: rendering pauses automatically on hidden tabs; near-zero CPU when idle

PLEASE NOTE
Due to browser security restrictions, the cat does not appear on browser-internal pages (such as edge:// settings pages, the Edge Add-ons store, or the PDF viewer). This is expected behavior.

Adopt your cursor-watching cat today!
```

### 3.4 Category and languages
- Category: Entertainment
- Listing languages: English and Chinese (Simplified) — required fields must be completed for both

### 3.5 Single purpose description
```
Displays an animated cat desktop pet overlay on webpages that follows the mouse cursor. It provides no other functionality.
```

### 3.6 Permission justifications
| Permission | Text to enter |
|------------|---------------|
| storage | Saves the cat's on-screen position and the user's preferences (show/hide, viewport clamp) locally in chrome.storage.local only. Nothing is synced or uploaded. |
| tabs | Broadcasts the show/hide and clamp toggles made in the toolbar popup to the cat overlay already running in the user's open tabs, so settings apply instantly. No browsing data is read or recorded. |
| Host permission `<all_urls>` | The cat overlay needs to render on every website the user visits. The extension injects only a Shadow-DOM-isolated transparent overlay; it never reads or modifies page content. |

### 3.7 Remote code declaration
```
No — this extension does not use or execute any remote code (Manifest V3). All logic and assets ship inside the extension package.
```
(Select: No, I am not using remote code)

### 3.8 Data usage disclosures (checkboxes)
- "Which user data do you plan to collect now or in the future?": **leave all unchecked** (this extension collects no user data)
- "I certify the following disclosures are true" section: check all applicable certifications (data not sold, not used for unrelated purposes, etc.)
- Certifications must stay consistent with the privacy policy

### 3.9 Privacy policy (full text)
> Host it (e.g., on GitHub or your own site) and paste the URL into the "Privacy policy URL" field.

```
Cat Eyeing Mouse — Privacy Policy

Last updated: 2026-08-16

Your privacy matters. This extension does not collect or transmit any personal user data.

1. Data collection
This extension collects no personal information whatsoever, including but not limited to
browsing history, keystrokes, identifiers, or location. It makes no network requests —
no analytics, no tracking, no reporting.

2. Local storage
The extension stores only two kinds of data locally in your browser (chrome.storage.local):
  (1) The cat's floating position (key: cem.position)
  (2) Your show/hide and viewport-clamp settings (key: cem.settings)
This data never leaves your device and is removed automatically when you uninstall
the extension.

3. Permissions
- storage: saves the position and settings above locally on your device;
- tabs: syncs the toggles you make in the popup to your open tabs;
- <all_urls>: the cat overlay must render on any website you visit; the extension
  never reads or modifies page content.

4. Third parties & remote code
This extension integrates no third-party services, contains no ads or analytics SDKs,
and executes no remotely hosted code.

5. Changes
If future features ever involve data handling, we will clearly disclose it in the
update notes.

Contact: [your email]
```

### 3.10 Certification testing notes
```
This extension is a purely front-end desktop pet. After installing, please open any
regular website (e.g., https://example.com) to verify:
1. A cat appears at the bottom-right corner of the page; moving the mouse switches
   its pose across 8 directions in real time;
2. Hovering over the cat shows a focused center pose; you can drag the cat anywhere,
   and the position persists after page reloads;
3. After about 10 seconds of mouse inactivity, the cat enters a resting pose and wakes
   up instantly on mouse movement;
4. Clicking the toolbar icon opens a popup with show/hide and viewport-clamp toggles.

The extension makes no network requests, uses no remote code, and collects no data.
Note: browser-internal pages (edge://, the Edge Add-ons store, the PDF viewer) are not
injected — this is expected browser behavior.
```

### 3.11 Screenshot captions (one per screenshot, ≤100 characters)
1. `The cat floats at the bottom-right of the page, eyes following your cursor`
2. `8-direction poses: the cat turns as the cursor moves to each direction`
3. `Drag the cat anywhere on the page; its position is remembered`
4. `After 10s of inactivity the cat rests; it wakes instantly on movement`
5. `Toolbar popup: one-click show/hide and viewport clamp toggles`

### 3.12 Search terms (up to 7, semicolon-separated)
```
cat;desktop pet;cursor follower;cute;animated cat;mouse;fun
```

### 3.13 Release notes (for version updates)
```
v1.0.0 — Initial release:
• 8-direction pose tracking + hover center pose
• Canvas crossfade smooth transitions
• Free dragging with position memory
• Smart resting after 10s of inactivity
• Popup toggles for show/hide and viewport clamp
• English / Simplified Chinese UI
```

---

## 4. Graphic Asset Requirements (to be produced separately)

| Asset | Size | Quantity/Requirements |
|--------|------|------------------------|
| Extension logo | 1:1 ratio, ≥128x128, 300x300 recommended | Required per language (reuse an upscaled `res/icons/icon128.png` or redraw at 300x300) |
| Small promo tile | 440x280 | 1 image, required |
| Large promo tile | 920x680 | 1 image, recommended |
| Screenshots | 1280x800 recommended | At least 1, ideally 3-5, each with a caption |

---

## 5. Pre-Submission Checklist

- [ ] `npm run build` executed; `dist/content.js` is up to date
- [ ] ZIP root contains `manifest.json` directly; size ≤ 2MB (same ZIP as Chrome)
- [ ] Partner Center detected both English and Chinese (Simplified) listings
- [ ] Both languages' descriptions replaced with the ≥250-character detailed version
- [ ] Logo, small promo tile, and at least 1 screenshot (with caption) uploaded for both languages
- [ ] Single purpose, three permission justifications, remote code (No), and data usage disclosures filled in and accurate
- [ ] Privacy policy hosted and publicly accessible; URL filled in
- [ ] Availability set to: Public / All markets
- [ ] Certification testing notes entered
- [ ] After submission, watch email and dashboard status; certification usually completes within a few business days
