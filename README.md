# Crown & Core condensed v2

34-leaf current review edition, October 1, 2026. The root index.html is the current static flipbook. It loads bundle.js, page-images, fonts and styles. phone-reader.html supplies the offline text reader. Crown-Core-phone-review.pdf is the matching 34-page image PDF. Both selected font licenses are in assets/licenses.

This update is an additional GitHub/Vercel home. Existing sslip.io routes must remain untouched. Do not deploy private extracted Why material or the letter handoff.

Production source content is proposal-data.js. The present bundle also embeds that data; changing only proposal-data.js will not update the primary flipbook until the runtime bundle is regenerated. This package preserves the exact current v2 runtime, not a newly designed edition. Primary page artwork and offline/PDF outputs must be regenerated together when content changes.

The earlier book.js and agreement-data.js are legacy files and are not loaded by the current index.html. Previous Git commits preserve the original edition.

Use the existing Vercel project prj_C8ilscnesSCZmiEPokL4OCeXzAL1, after verifying its current account, plan and Git settings. Static serving needs no paid service. Connect the main branch to production deployment. This update bundle does not itself establish that Vercel connection.
