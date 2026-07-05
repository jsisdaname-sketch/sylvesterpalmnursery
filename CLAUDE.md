# Sylvester Palm Nursery — Project Brief (CLAUDE.md)

## ABOUT THE BUSINESS
Sylvester Palm Nursery is a 26-year-old family-owned palm tree farm in Delray Beach, FL (South Florida). Home-grown Sylvester, Bismarck, Coconut, Foxtail, and Royal Palms. Ships nationwide. Serves retail homeowners AND high-value wholesale buyers.
- Phone: (561) 900-5658
- Instagram: @sylvesterpalmnursery · Facebook: facebook.com/SylvesterPalmNursery
- Website: sylvesterpalmnursery.com
- Tagline: "Family-Grown in Delray Beach, Florida Since 2000"

## ABOUT THE USER
The owner is a beginner with web development. Explain everything step-by-step for a non-technical person — no developer jargon without a plain-English explanation. He texts casually and moves fast; keep responses focused and action-oriented. This is a serious business project. ALWAYS flag anything that costs money BEFORE recommending it.

## TECH STACK
- Website: Plain HTML/CSS/JavaScript. Files: SylvesterPalm/index.html, SylvesterPalm/terms.html, SylvesterPalm/subscribed.html
- CRITICAL: all site files live in the SylvesterPalm/ subfolder, NOT the repo root
- Hosting: Netlify — auto-deploys on every push to GitHub main (~30-45 sec)
- Netlify publish directory MUST be SylvesterPalm (capital S, capital P). It silently resets to root if the repo is ever relinked — this has caused full-site 404s before. If the site 404s, check this FIRST, not cache.
- GitHub repo: jsisdaname-sketch/sylvesterpalmnursery
- Email/SMS marketing: Brevo (NOT Mailchimp — Mailchimp was abandoned; never suggest it)
- Video hosting: Cloudinary (hero video, delivery URL uses f_mp4,vc_h264,q_auto:best)

## BREVO / SMS DETAILS
- Popup subscribe form = Brevo form embedded via iframe. Raw POST/fetch to Brevo endpoints FAILS — the iframe is the correct architecture. Do not "fix" or replace it.
- Form fields: First Name (FIRSTNAME, required), Last Name (LASTNAME, required), Phone (SMS)
- Submit flow: Brevo redirects (inside iframe) to /subscribed.html, which postMessages "brevo-subscribed" to the parent, which swaps the popup to a green "You're In!" success screen
- Lists: "Website Subscribers" (ID #5) and "VIP Clientele" (~49 wholesale buyers, phones in E.164 +1XXXXXXXXXX format)
- Welcome SMS automation is LIVE: trigger = contact joins Website Subscribers, sends opt-in confirmation SMS
- SMS delivery is BLOCKED until toll-free number verification completes (pending)
- TCPA compliance on every SMS: opt-out language ("Reply STOP"), msg & data rates disclosure
- Wholesale/VIP buyers: relationship & early-access framing, NOT coupons/discounts

## DESIGN SYSTEM — "Tropical Luxury"
- Backgrounds: #0d2818 (dark emerald), #0a1f10 (darker sections)
- Gold light #FBDF80 (labels, taglines, stars), Gold deep #C5973A (keylines, accents, phone)
- CTA green #1a7a3a, White #ffffff, Popup cream #fdf8f0
- Fonts: Playfair Display (headings) + DM Sans (body)
- Gold keylines: header bottom border, trust bar frame, footer top border
- Review cards: dark emerald gradient, gold shimmer top line, gold stars/names, gold-ringed avatars
- Contact section: framed gold card, "READY WHEN YOU ARE" eyebrow, Call Now (green) + Text Us (gold outline)
- Footer: 3D spinning logo images/logo-spin.png above gold tagline
- NEVER use AI-generated palm imagery. Real farm photos/video only.

## WHAT'S BUILT (current state)
- Sticky header: logo, call/text/directions icons, Instagram pill, blue circular Facebook button
- Hero: Cloudinary farm video (portrait orientation), autoplay hardened for Instagram in-app browser
- Holiday auto-theme engine: JS near the bottom of index.html auto-swaps hero button text/emoji for 12 holiday windows a year (Valentine's, Mother's/Father's Day, Memorial, July 4, Labor, Veterans, Thanksgiving, Black Friday, Christmas, New Year, Summer fallback). Computed automatically every year. Do NOT remove or simplify this.
- Animated horizontal photo wall: alternating-direction rows, ~37 images in images/gallery/
- Trust bar: 4 gold circular icons above the reviews section (26 Years, Nationwide Shipping, Licensed & Insured, Payment methods)
- Google Reviews: 3 real reviews (Nicole Turner, Carmen Feldman, Jeffrey Santos), real avatars in images/reviews/
- Subscribe popup: Brevo iframe, success screen, localStorage suppresses redisplay for 30 days
- subscribed.html: bilingual EN/ES confirmation page
- terms.html: Terms & Privacy matching branding

## HARD-WON LESSONS / GOTCHAS
- Netlify publish dir resets on repo relink — reset to SylvesterPalm
- Brevo forms need their own JS context — iframe only, never raw POST
- Hero video is PORTRAIT: great on mobile, soft on desktop. Fix is a horizontal drone clip, not re-compressing.
- "Clear your cache" is almost never the real fix — check Netlify GitHub authorization and publish dir first
- NEVER put an auto-close timer on the popup — users are mid-typing
- Before editing, verify the live file matches what's expected — the owner has occasionally forgotten to commit provided files

## WORKFLOW RULES FOR CLAUDE CODE
- Edit files in place, show the diff, wait for approval, then commit + push (push = LIVE deploy)
- Handle-with-care zones in index.html: popup/Brevo flow, holiday engine JS, video autoplay block
- Keep single-file architecture unless owner approves a split
- Keep TCPA opt-out language in all SMS copy
- Flag paid upgrades (Brevo credits, Cloudinary tiers, etc.) before proceeding

## NEXT STEPS
1. Toll-free number verification (blocks ALL SMS delivery)
2. Import 213-contact CSV into Brevo Website Subscribers
3. Horizontal drone hero clip for desktop
4. Saturday newsletter template
5. PlantANT inventory listing (review per-lead billing with dad first)
6. Plant broker/marketplace page (future)
7. 5-7 ready-to-post Reels + captions
8. Expand site: about page, care guides, individual palm product pages, quote request flow
