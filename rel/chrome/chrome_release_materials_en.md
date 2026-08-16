# Chrome Web Store Release Materials — Cat Eyeing Mouse v1.0.0 (English)

> This file contains the full publishing process and all copy-ready text materials for releasing to the Chrome Web Store (English version).
> For the Chinese version, see [chrome_release_materials_zh.md](file:///d:/desktop/proj/9.cat_mouse/cat_eyeing_mouse/rel/chrome/chrome_release_materials_zh.md).

---

## 1. Publishing Process Overview

| Step | Action | Entry point |
|------|--------|-------------|
| 1 | Register a developer account (one-time $5 fee) | https://chrome.google.com/webstore/devconsole |
| 2 | Build and package the extension ZIP (≤2MB) | Local `npm run build` + PowerShell packaging |
| 3 | Create a new item and upload the ZIP | Dashboard → New item |
| 4 | Fill in the store listing (name/description/category/graphics) | Dashboard → Store listing |
| 5 | Fill in privacy practices (single purpose/permissions/data disclosures) | Dashboard → Privacy practices |
| 6 | Configure distribution (visibility/regions/price) | Dashboard → Distribution |
| 7 | Submit for review (usually 1-3 business days, may take longer) | Dashboard → Submit for review |
| 8 | Post-launch maintenance (updates require re-review) | Dashboard → Package |

---

## 2. Materials Required at Each Step

### Step 1: Developer account registration
- Sign in with a Google account
- Pay the one-time registration fee of **$5 USD**
- Developer display name (shown publicly on the store)
- Contact email (displayed publicly for user feedback)
- Country/region

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

### Step 3: Upload the ZIP
- The i18n name/description/languages (en + zh_CN) are parsed automatically from the manifest

### Step 4: Store listing (one per language)
| Field | Limit | Value for this project |
|-------|-------|------------------------|
| Extension name | ≤75 chars | Cat Eyeing Mouse |
| Short description | ≤132 chars | See [3.2](#32-short-description-store-listing-field) |
| Detailed description | ≤16,000 chars | See [3.3](#33-detailed-description-store-listing-field) |
| Category | Single choice | Fun |
| Languages | — | English + Chinese (Simplified) |
| Icon | 128x128 | `res/icons/icon128.png` (shipped in the package) |
| Screenshots | 1280x800 or 640x400, 1-5 images | See section 4 |
| Small promo tile | 440x280, required | See section 4 |
| Large promo tile | 920x680 | Optional |

### Step 5: Privacy practices
- Single purpose description (required text) → See [3.5](#35-single-purpose-description)
- Justification for every permission and host permission → See [3.6](#36-permission-justifications)
- Data usage disclosures (checkboxes) → See [3.8](#38-data-usage-disclosures-checkboxes)
- Remote code declaration → See [3.7](#37-remote-code-declaration)
- Privacy policy URL (recommended) → See [3.9](#39-privacy-policy-full-text)

### Step 6: Distribution settings
- Visibility: Public
- Regions: All regions
- Pricing: Free

### Step 7: Submit for review
- Review notes can be attached (recommended, see [3.10](#310-review-notes))
- The result is notified by email

---

## 3. Copy-Ready Text Materials (English)

### 3.1 Extension name
```
Cat Eyeing Mouse
```

### 3.2 Short description (store listing field)
> ≤132 characters. The `app_description` from `_locales/en/messages.json` is auto-filled; it can be overridden on the listing page.

```
A cute cat follows your cursor and reacts to its movement.
```
(Optional richer override:)
```
A cute cursor-following cat pet for every webpage: draggable, smart-resting, zero data collection.
```

### 3.3 Detailed description (store listing field)
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
Due to browser security restrictions, the cat does not appear on browser-internal pages (such as chrome:// settings pages, the Chrome Web Store, or the PDF viewer). This is expected behavior.

Adopt your cursor-watching cat today!
```

### 3.4 Category and languages
- Category: Fun
- Listing languages: English and Chinese (Simplified) — both listings must be filled in

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
No — this extension does not use or execute any remote code. All logic and assets ship inside the extension package.
```
(Check: I am not using remote code)

### 3.8 Data usage disclosures (checkboxes)
- Data categories collected: **leave all unchecked** (this extension collects no user data)
- Certification checkboxes to select:
  - [x] I do not sell or transfer user data to third parties
  - [x] I do not use user data for purposes unrelated to the item's single purpose
  - [x] I do not use user data to determine creditworthiness or for lending purposes
- Local data handling: data is stored only in the user's local `chrome.storage.local`

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

### 3.10 Review notes
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
Note: browser-internal pages (chrome://, the Chrome Web Store, the PDF viewer) are not
injected — this is expected browser behavior.
```

### 3.11 Release notes (for version updates)
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
| Extension icon | 128x128 | Provided via manifest in the ZIP (res/icons/icon128.png) |
| Screenshots | 1280x800 or 640x400 | 1-5 images, PNG/JPG, showing the cat following the cursor, dragging, resting pose, popup toggles |
| Small promo tile | 440x280 | 1 image, required |
| Large promo tile | 920x680 | 1 image, optional (for featured placement) |
| Marquee promo tile | 1400x560 | 1 image, optional |

Suggested screenshot order:
1. The cat floating at the bottom-right, eyes on the cursor
2. 8-direction pose switching (multi-direction comparison)
3. Dragging the cat around
4. Resting pose after 10 seconds idle
5. Toolbar popup (show/hide + viewport clamp toggles)

---

## 5. Pre-Submission Checklist

- [ ] `npm run build` executed; `dist/content.js` is up to date
- [ ] ZIP root contains `manifest.json` directly; size ≤ 2MB
- [ ] Store listings filled for both English and Chinese (Simplified)
- [ ] Short description ≤132 characters; detailed description matches actual functionality
- [ ] Single purpose and the three permission justifications filled in and accurate
- [ ] All certification checkboxes selected under data usage; all data categories unchecked
- [ ] Privacy policy hosted and publicly accessible; URL filled in
- [ ] Icon, at least 1 screenshot, and the 440x280 small promo tile uploaded
- [ ] Distribution set to: Public / All regions / Free
- [ ] Review notes attached
