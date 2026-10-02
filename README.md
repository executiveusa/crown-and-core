# Crown & Core 90-day proposal: interactive flipbook (v3)

Static site. No build step. Root `index.html` is the book; `book.js` and `styles.css` run it; `phone-reader.html` is the single-file offline copy; `Crown-Core-phone-review.pdf` is the matching PDF. Fonts (Libre Caslon Text, Inter) and licenses are in `assets/`.

Live (Netlify): https://crownandcore.netlify.app

Copy is locked. Changes go through the owner. Binding terms (guarantee, 7-day approval window, payment schedule, signature page) need MACS / attorney confirmation before editing.

Signing: the sign block is hidden until `<meta name="sign-url" content="...">` holds the DocuSign link. Until then the Talk to Us page (WhatsApp) is the contact path.

The previous condensed v2 edition (bundle.js + page-images) is preserved in git history and on `archive/pre-final-proposal-2026-09-30`.

Do not commit secrets. Do not deploy the private "Why" material or the letter handoff.
