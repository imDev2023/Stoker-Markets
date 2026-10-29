# Professional UI/UX principles for Stoker, from primary sources (issue #130, research agent 2, 2026-10-28)

The owner's verdict is that the site "looks completely vibe-coded and isn't thoughtful".
This file is the body of professional knowledge a studio would design from, each finding turned into a rule for a named part of Stoker.
Evidence is marked as the brief asks: `research` (a study or a research firm's test), `practice` (a design system or a practitioner's documented rule), `opinion` (a blog post or a trend piece).
Page text is saved under `principles-sources/<site>/` next to this file; the live sites were read on 2026-10-28 and describe what their pages contained that day.
Jina's account balance ran out on the last fetch of the session (402 InsufficientBalanceError), after every page below had been saved; one Shopify page was fetched as plain Markdown from shopify.dev instead.

## What I read

- https://www.nngroup.com/articles/how-long-do-users-stay-on-web-pages/ - NN/g, Nielsen 2011: the first 10 seconds decide, value proposition within 10 s.
- https://www.nngroup.com/articles/trustworthy-design/ - NN/g, Harley 2016: the four credibility factors, stable since 1999.
- https://www.nngroup.com/articles/first-impressions-human-automaticity/ - NN/g, Fessenden 2017: System 1 judges relevance, credibility and usability before reading.
- https://www.nngroup.com/articles/illusion-of-completeness/ - NN/g, Flaherty 2016: full-screen heroes make users think the page ends.
- https://www.nngroup.com/articles/scrolling-and-attention/ - NN/g, Fessenden 2018: 57% of viewing time above the fold, 74% in two screenfuls.
- https://www.nngroup.com/articles/page-fold-manifesto/ - NN/g, Schade 2015: the fold still matters, visible content drives scrolling.
- https://www.nngroup.com/articles/text-scanning-patterns-eyetracking/ - NN/g, Pernice 2019: F, spotted, layer-cake and commitment patterns.
- https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content/ - NN/g, Pernice 2017: front-load headings, the first two words carry the gist.
- https://www.nngroup.com/articles/social-proof-ux/ - NN/g, Cardello 2014: people follow the visible behaviour of others.
- https://credibility.stanford.edu/guidelines/index.html - Stanford Persuasive Technology Lab, Fogg 2002: ten credibility guidelines from 4,500 people.
- https://baymard.com/blog/perceived-security-of-payment-form - Baymard 2016, updated 2023: perceived security is visual, 19% abandon for lack of trust.
- https://baymard.com/blog/site-seal-trust - Baymard 2013/2016: which seals people trust (Norton first, a homemade seal beats most real ones).
- https://research.google.com/pubs/archive/38315.pdf - Tuch, Presslaber, Stoecklin, Opwis, Bargas-Avila (Basel and Google) 2012: visual complexity and prototypicality judged within 17 ms.
- https://www.tandfonline.com/doi/abs/10.1080/01449290500330448 - Lindgaard et al. 2006, the 50 ms study (only the abstract was reachable; the paper's findings are summarised in Tuch 2012 above).
- https://www.nngroup.com/articles/hamburger-menus/ - NN/g, Pernice and Budiu 2016: hidden navigation halves discoverability on desktop.
- https://www.nngroup.com/articles/killing-global-navigation-one-trend-avoid/ - NN/g, Cardello and Whitenton 2014: never demote the top-level categories into a dropdown.
- https://www.nngroup.com/articles/mega-menus-work-well/ - NN/g, Nielsen and Li 2017: grouped panels beat long dropdowns, 0.5 s hover delay.
- https://www.nngroup.com/articles/sticky-headers/ - NN/g, Laubheimer 2021: small, opaque, high contrast, minimal animation.
- https://www.nngroup.com/articles/3-click-rule/ - NN/g, Laubheimer 2019: the rule is not backed by data.
- https://www.nngroup.com/articles/breadcrumbs/ - NN/g, Laubheimer 2018, reviewed 2026: breadcrumbs show hierarchy, not history.
- https://www.nngroup.com/articles/centered-logos/ - NN/g, Whitenton 2016: a centred logo makes going home six times harder.
- https://baymard.com/research-articles/ecommerce-navigation-best-practice - Baymard 2026 benchmark: 96% of sites do not highlight the current scope in the main nav, 300 to 500 ms hover delay.
- https://stripe.com, https://linear.app, https://vercel.com, https://www.coinbase.com, https://www.kraken.com, https://robinhood.com, https://hyperliquid.xyz, https://app.hyperliquid.xyz/trade, https://phantom.com, https://jup.ag - live landings and app, read for their navbars, heroes and footers.
- https://www.nngroup.com/articles/auto-forwarding/ - NN/g, Nielsen 2013: an auto-rotating panel hid a 98-point offer from a user.
- https://baymard.com/research-articles/homepage-carousel - Baymard: 46% of homepage carousels have UX issues, most users never see the later slides.
- https://www.nngroup.com/articles/designing-effective-carousels/ - NN/g, Pernice 2013, reviewed 2026: a static hero is usually better.
- https://www.nngroup.com/articles/image-focused-design/ - NN/g, Whitenton 2014: a huge image pushes the task below the fold.
- https://www.nngroup.com/articles/photos-as-web-content/ - NN/g, Nielsen 2010, reviewed 2026: decorative images are ignored, product and real-people photos are studied.
- https://www.nngroup.com/articles/homepage-design-principles/ - NN/g, Wang 2024: five homepage principles with 16 guidelines.
- https://www.nngroup.com/articles/footers/ - NN/g, Fessenden 2019: footer elements and when to use each.
- https://www.nngroup.com/articles/data-tables/ - NN/g, Laubheimer 2022: the four table tasks.
- https://www.nngroup.com/articles/comparison-tables/ - NN/g, Laubheimer 2017: up to five items, sticky headers, scannability.
- https://www.nngroup.com/articles/dashboards-preattentive/ - NN/g, Laubheimer 2017: length and 2D position are preattentive, colour has no order, no pies.
- https://mattstromawn.com/writing/ui-density - Matthew Strom-Awn 2024: visual, information, temporal and value density.
- https://www.bloomberg.com/company/stories/how-bloomberg-terminal-ux-designers-conceal-complexity - Bloomberg 2022: incremental change, a commissioned typeface, tabbed panels.
- https://www.bloomberg.com/company/stories/designing-the-terminal-for-color-accessibility - Bloomberg 2021: a blue and red scheme for 20,000 colour-deficient users.
- https://alistapart.com/article/zebrastripingdoesithelp/ and https://alistapart.com/article/zebrastripingmoredataforthecase/ - Enders 2008: zebra striping gives no significant accuracy gain.
- https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-data-tables - Pencil and Paper 2026: right-align numbers, tabular type, zebra stripes fight row states.
- https://practicaltypography.com/alternate-figures.html - Butterick: lining, oldstyle, tabular and proportional figures.
- https://developer.mozilla.org/en-US/docs/Web/CSS/font-variant-numeric - MDN: `tabular-nums` maps to OpenType `tnum`.
- https://www.nngroup.com/articles/web-form-design/ - NN/g, Whitenton 2016: ten form recommendations, 78% vs 42% one-try submissions.
- https://www.nngroup.com/articles/form-design-placeholders/ - NN/g, Sherwin 2014: placeholders as labels are harmful.
- https://www.nngroup.com/articles/errors-forms-design-guidelines/ - NN/g, Krause 2019: ten error-reporting guidelines.
- https://www.nngroup.com/articles/error-message-guidelines/ - NN/g, Neusesser and Sunwall 2023: visibility, severity, timing.
- https://baymard.com/blog/inline-form-validation - Baymard: validate on blur, clear on fix, 31% of sites have none.
- https://baymard.com/blog/avoid-multi-column-forms - Baymard: single column, 16% of sites get it wrong.
- https://baymard.com/research-articles/mobile-form-usability-label-position - Baymard: labels above the field.
- https://baymard.com/blog/form-design and https://baymard.com/blog/input-fields - Baymard: form anatomy and eight input-field guidelines.
- https://design-system.service.gov.uk/patterns/question-pages/, https://design-system.service.gov.uk/patterns/validation/, https://design-system.service.gov.uk/components/error-message/ - GOV.UK Design System: one question per page, validate on submit, error summary, keep answers.
- https://stripe.com/resources/more/checkout-ui-strategies-for-faster-and-more-intuitive-transactions - Stripe 2025: fewer fields, inline examples, no promotion in checkout, bold the total.
- https://blog.uniswap.org/uniswap-swap-ux-improvements - Uniswap Labs: sub-second quotes, fee-on-transfer detection, swap protection on by default.
- https://m3.material.io/styles/color/system/overview and https://m3.material.io/styles/color/roles - Material 3: 26 colour roles in accessible pairs.
- https://m2.material.io/design/color/dark-theme.html - Material 2 dark theme: #121212, elevation overlays 5% to 16%, desaturated primaries.
- https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale and https://www.radix-ui.com/colors/docs/palette-composition/composing-a-palette - Radix Colors: the 12-step scale and tinted grays.
- https://www.refactoringui.com/previews/building-your-color-palette - Wathan and Schoger: 8 to 10 greys, 5 to 10 shades per colour, define shades up front.
- https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html - W3C WCAG 2.2: 4.5:1 and 3:1 thresholds and why.
- https://git.apcacontrast.com/documentation/APCA_in_a_Nutshell - Myndex: APCA Lc levels by use.
- https://stripe.com/blog/accessible-color-systems - Stripe 2019: a perceptually uniform tool to keep vibrancy and contrast.
- https://www.coinbase.com/blog/how-accessibility-drives-product-quality-at-Coinbase - Coinbase 2025: never colour alone, 24% use larger text, dense components keep targets.
- https://www.nngroup.com/articles/dark-mode/ - NN/g, Budiu 2020: light mode performs better for normal vision, always offer the switch.
- https://developer.apple.com/design/human-interface-guidelines/dark-mode and https://developer.apple.com/design/human-interface-guidelines/color - Apple HIG: dark colours are not inversions, 4.5:1 minimum, 7:1 for custom small text.
- https://vercel.com/geist/colors and https://vercel.com/geist/text - Vercel Geist: 10 scales, draw each border once, type roles with their uses.
- https://atlassian.design/foundations/elevation and https://atlassian.design/foundations/typography - Atlassian: four elevations, lighter when higher in dark, three type principles.
- https://m3.material.io/styles/typography/type-scale-tokens and https://m3.material.io/styles/typography/applying-type - Material 3: five type roles, three sizes each.
- https://practicaltypography.com/summary-of-key-rules.html, https://practicaltypography.com/line-length.html, https://practicaltypography.com/point-size.html - Butterick: 15 to 25 px, 120 to 145% leading, 45 to 90 characters.
- https://linear.app/now/how-we-redesigned-the-linear-ui - Linear 2024: less noise, alignment, density, LCH themes from three variables.
- https://developer.apple.com/design/human-interface-guidelines/typography - Apple HIG: minimum sizes, avoid light weights, few typefaces.
- https://m3.material.io/styles/motion/easing-and-duration/tokens-specs and https://m3.material.io/styles/motion/overview/how-it-works - Material 3: easing tokens and the spring system.
- https://developer.apple.com/design/human-interface-guidelines/motion - Apple HIG: purposeful, optional, brief, cancellable.
- https://emilkowal.ski/ui/great-animations and https://emilkowal.ski/ui/good-vs-great-animations - Emil Kowalski: ease-out, under 300 ms, never animate keyboard actions, origin-aware.
- https://rauno.me/craft/interaction-design and https://interfaces.rauno.me/ - Rauno Freiberg: interruptible metaphors, Web Interface Guidelines (200 ms, proportional values).
- https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md - Vercel Labs 2025: the rule list its review command checks.
- https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html - W3C WCAG 2.3.3: motion from interaction must be disableable.
- https://www.nngroup.com/articles/animation-usability/ - NN/g, Harley 2014: goal, frequency and mechanics of an animation.
- https://www.nngroup.com/articles/empty-state-interface-design/ - NN/g, Kaplan 2021: status, learning cues, direct pathways.
- https://www.nngroup.com/articles/skeleton-screens/ - NN/g, Tankala 2023: skeletons mimic the layout, never frame-only.
- https://www.nngroup.com/articles/progress-indicators/ - NN/g, Sherwin 2014: feedback, estimates after 10 s.
- https://www.nngroup.com/articles/ten-usability-heuristics/ - NN/g, Nielsen 1994, reviewed 2024.
- https://atlassian.design/components/empty-state/usage - Atlassian: parts, tone by scenario, one call to action.
- https://carbondesignsystem.com/patterns/empty-states-pattern/ and https://carbondesignsystem.com/patterns/loading-pattern/ - IBM Carbon: positive titles, starter content, skeletons only for data containers.
- https://m3.material.io/components/progress-indicators/guidelines - Material 3: nothing under 200 ms, loading indicator to 5 s, progress after.
- https://shopify.dev/docs/apps/build/app-home/migrate-from-polaris-react/empty-state - Shopify Polaris: the empty-state component and the loading, empty, populated and error conditions.
- https://www.sinton.agency/blog/how-to-spot-a-vibe-coded-website, https://vibemole.com/resources/avoid-vibecoded-app-design, https://medium.com/design-bootcamp/why-your-vibe-coded-designs-look-generic-the-fix-isnt-better-prompts-09e2fda26591, https://abhijayvuyyuru.substack.com/p/how-can-your-vibe-coded-website-not, https://www.reddit.com/r/VibeCodeDevs/comments/1p5vnqq/plz_avoid_these_obvious_signs_your_website_is - practitioners 2025 to 2026 on the tells of AI-generated design.
- https://www.nngroup.com/articles/glassmorphism/, https://www.nngroup.com/articles/flat-ui-less-attention-cause-uncertainty/, https://www.nngroup.com/articles/aesthetic-usability-effect/ - NN/g on glass, weak signifiers (22% more time) and the limits of prettiness.
- https://cds.coinbase.com/getting-started/introduction, https://www.figma.com/blog/coinbase-case-study, https://www.coinbase.com/blog/coinbases-product-principles - Coinbase: the design system, the four design principles, the five product principles.
- https://vercel.com/geist/introduction, https://www.radix-ui.com/themes/docs/overview/getting-started, https://www.radix-ui.com/themes/docs/theme/overview, https://m3.material.io/foundations, https://atlassian.design/ - the systems' own front doors.
- https://blog.uniswap.org/data-and-insights, https://www.sanctuary.computer/work/uniswap - Uniswap's Explore tab and the studio that unified its design system.
- https://blog.kraken.com/product/bear-markets-are-for-building-introducing-krakens-new-and-improved-pro-trading-interface, https://blog.kraken.com/news/new-kraken-app-coming-soon - Kraken on Pro's modular UI and the 2026 app rebuild.
- https://robinhood.com/us/en/newsroom/the-top-secret-robinhood-design-story - Robinhood: design says who a product is for.

## 1. First impressions, credibility and trust online

### The look is judged in 50 ms and the judgement holds
Finding: Lindgaard and colleagues flashed homepages for 50 ms and 500 ms and found the attractiveness ratings correlated at r = .97 with each other and r = .98 with unlimited viewing, so a stable first impression forms within 50 ms, before any word is read.
Tuch and colleagues (Basel and Google) then showed that visual complexity and prototypicality shape the rating within 17 ms, and that "websites with low VC and high PT were perceived as highly appealing".
Source: https://research.google.com/pubs/archive/38315.pdf (Tuch, Presslaber, Stoecklin, Opwis, Bargas-Avila, 2012, summarising Lindgaard et al. 2006), evidence: research
For Stoker: Landing and Header - the first paint at 1440 and at 390 must read as one composed image: one dominant element (the headline), one accent, aligned edges, and a structure a visitor already knows (mark top-left, horizontal links, a market table below); keep visual complexity low above the fold (one visual, one headline, two buttons, four figures) and put novelty only in the mark, the heat ramp and the character.
Test it the way the study did: show a 1440 screenshot for a fraction of a second to someone outside the project and ask what kind of site it was.
Audience: traders judge fastest and want a venue that looks like venues they know; creators and marketers get the same verdict from the same glance.

### The first 10 seconds are the harsh judgement, 30 seconds buys minutes
Finding: Across 2 billion dwell times, 99% of pages show "negative aging": the chance of leaving is highest in the first 10 seconds, still high to 30 seconds, then flattens, and a page that holds a visitor for half a minute often keeps them 2 minutes or more.
NN/g's design implication is one sentence: "communicate your value proposition within 10 seconds".
Source: https://www.nngroup.com/articles/how-long-do-users-stay-on-web-pages/ (NN/g, Nielsen, 2011), evidence: research
For Stoker: Hero - the slogan carries the open half, so the lede must carry the mechanism in one readable line ("Launch a coin priced in SOL, a stablecoin or a tokenized stock, trade it on a curve until it graduates to Raydium, and earn about 0.5% of every trade as its Creator"), and the Stats strip directly under it must show live proof (coins launched, 24h volume, paid to Creators, assets available), all legible within 10 seconds without scrolling.
Audience: traders and creators; the riddle of the slogan costs KOLs and marketers nothing as long as the lede answers it.

### Credibility comes from four things, unchanged since 1999
Finding: In usability studies in Singapore and the West, the same four factors decided whether a site was trusted: design quality (meaningful navigation labels, appropriate colour, adequate white space), up-front disclosure (fees and terms before they are asked for), comprehensive and current content, and connection to the rest of the web.
NN/g notes that what counts as "quality" looks different each decade but what influences the perception of quality has not changed.
Source: https://www.nngroup.com/articles/trustworthy-design/ (NN/g, Harley, 2016, after Nielsen 1999), evidence: research
For Stoker: Landing, launch summary and Footer - disclose up front, on the landing and on the launch form's summary, the trader's fee (1% on the curve, 1.25% after Graduation), the Creator's share, and the regions excluded; show currency with a visible "indexed 12 s ago" on the board and the Ledger; connect to the rest of the web with explorer links on every address and signature, the Raydium program ids, the GitHub repository and the API reference.
Audience: traders (fees), creators (the cut), marketers and KOLs (regions and proof of currency before they attach their name).

### Stanford's ten credibility guidelines: a real organisation, verifiable claims, no errors
Finding: From three years of research with over 4,500 people, Fogg's lab lists ten ways to earn credibility: make claims easy to verify, show a real organisation behind the site, highlight expertise, show the people, make contact easy, look professional, be useful and easy, show recent updates, use restraint with promotion, and "avoid errors of all types, no matter how small".
Source: https://credibility.stanford.edu/guidelines/index.html (Stanford Persuasive Technology Lab, Fogg, 2002), evidence: research
For Stoker: Footer and /api - give the organisation a face (the contact address, the public repository, the on-chain addresses of the PlatformConfig, the treasury and the operations wallet so every fee claim can be checked on-chain), date the Ledger and the announcements, and treat every broken or placeholder link as a credibility bug: the X and Telegram URLs in `site.ts` are placeholders and must be real before launch, and a 404 from the footer costs more than a missing feature.
Audience: KOLs and marketers vet a platform before promoting it; traders check the addresses.

### Perceived security is visual, and the sensitive step must look different
Finding: 19% of US adults abandoned a checkout in the last three months because they did not trust the site with their card (1,026 respondents, 2025), users perceive parts of one page as more secure than others, and visually encapsulating the sensitive fields (a distinct background, border and microcopy used nowhere else on the form) raised perceived security in every test since 2009.
A homemade padlock or "secure" badge performed better than most real SSL seals; recognisable brands (Norton, Google) performed best.
Source: https://baymard.com/blog/perceived-security-of-payment-form (Baymard Institute, 2016, updated 2023), evidence: research
For Stoker: Trade panel and launch summary - the signing step gets a treatment used nowhere else on the page: a contained surface with the strongest border, a one-line reassurance ("You sign in your wallet. Stoker never holds your funds."), the wallet's name and the exact amounts, and after landing the explorer link; the wallet connect control gets the same distinct treatment in the Header.
Audience: new traders and creators at their first launch; experienced traders are not slowed by it.

### A full-screen hero makes six of eight users think the page is over
Finding: On a homepage whose autoplaying hero video filled the viewport, six out of eight users did not realise they could scroll and clicked the only visible button instead; the illusion of completeness is created by large heroes, horizontal rules at the fold and the absence of any visible cue of more content.
Source: https://www.nngroup.com/articles/illusion-of-completeness/ (NN/g, Flaherty, 2016), evidence: research
For Stoker: Hero - never fill the viewport; at 1440 x 900 the hero takes at most 70% of the height so the Stats strip and the "Trending" heading are cut by the fold and visibly continue, and no full-width rule or colour change ends the hero at the fold.
Audience: everyone arriving from a shared link.

### 57% of viewing time is above the fold and 74% in the first two screenfuls
Finding: Over 130,000 fixations from 120 participants, 57% of page-viewing time was above the fold, 74% within 2,160 px, and attention still drops sharply after the fold; more than 65% of above-the-fold time went to the top half of the viewport.
Source: https://www.nngroup.com/articles/scrolling-and-attention/ (NN/g, Fessenden, 2018), evidence: research
For Stoker: Landing and board - put Hero, Stats and the first rows of Trending within two screenfuls at 1080 high; on /coins the search, sort, the asset rail and at least eight CoinRows must fit the first screenful at 1440 x 900, and the explanatory sections (how it works, Curated, Developers) go below.
Audience: traders, who come to the board and scan the top; creators, who want the launch button in the top half.

### Users scan in an F unless the layout gives them headings and front-loaded words
Finding: Eyetracking shows four text-scanning patterns; the F pattern appears when text has no headings or bullets and is bad for users and businesses, the layer-cake pattern (reading headings and subheadings) is the most efficient, and headings must carry their information in the first two words.
Source: https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content/ (NN/g, Pernice, 2017) and https://www.nngroup.com/articles/text-scanning-patterns-eyetracking/ (NN/g, Pernice, 2019), evidence: research
For Stoker: every section heading and every label on the landing, /curated and /api starts with the information-bearing words ("Creators earn 0.5% of every trade", not "A new way for creators to earn"), explanations are bullet lists under bold headings, and a coin page's labels (Price, 24h, Market cap, Curve) sit above their values so the layer-cake works.
Audience: all; KOLs skim hardest.

### Social proof is shown behaviour, in numbers
Finding: People reference the visible behaviour of others to guide their own (Cialdini's principle); reviews, "others also viewed" and counts of interested people all work, and users who claim to ignore social proof still follow it.
Source: https://www.nngroup.com/articles/social-proof-ux/ (NN/g, Cardello, 2014), evidence: research
For Stoker: Stats and Trending - prove activity with real counts (coins launched, traders this week, volume, paid to Creators) and real coins with their holders and volume; never testimonials, star ratings or follower counts the platform cannot back; on day one the honest numbers are the 605 pairable assets and "launches open since" a date.
Audience: traders look for liquidity, marketers and KOLs for reach; both are repelled by invented proof.

### What exchanges actually put above the fold to be trusted with money
Finding: Kraken's hero is a headline ("Own the power of your money"), a one-line lede listing the products, one button ("Try Kraken"), a trust strip ("Since 2011", "$2T+ total transaction volume", "Most popular crypto exchange 2026") and a live market table (Asset, Price, 24h%, M. Cap); Hyperliquid's is a headline, a lede, one "Trade" button and four live figures (24H volume, open interest, users, TPS / max TPS) plus a scrolling price strip; Coinbase's is "Trusted by millions worldwide" with live prices; Robinhood's adds a "Protection Guarantee" block and names the regulated entity under every product claim; Phantom's is "Trusted by a community of 20+ million users" with the product in motion.
Source: https://www.kraken.com, https://hyperliquid.xyz, https://www.coinbase.com, https://robinhood.com, https://phantom.com (read 2026-10-28), evidence: practice
For Stoker: Hero and Stats - adopt the exchange pattern: headline, one lede, one primary button plus one secondary, a trust strip of three or four live, verifiable figures with a "since" date, and the product itself (the top five coins with pair, price and 24h change, or a live trade panel) rather than an illustration; write the regulated-entity line as our equivalent, a one-line "On-chain on Solana, Raydium LaunchLab, every fee on the public Ledger".
Audience: traders first; the same strip tells creators the platform is alive.

## 2. Navigation

### Hiding the navigation halves its use on desktop
Finding: In a 179-participant study on six live sites, desktop users used hidden (hamburger) menus in 27% of cases against 48% for visible and 50% for combo navigation, hidden navigation lengthened task time and raised perceived difficulty, and on mobile combo navigation (some links visible beside the menu) was used in 86% of cases against 57% for a fully hidden menu.
Source: https://www.nngroup.com/articles/hamburger-menus/ (NN/g, Pernice and Budiu, 2016), evidence: research
For Stoker: Header - at 1300 px and above every section stays visible (the pill does this); below 1300 px use combo navigation, not a bare menu button: keep Explore and the "Stoke a coin" button visible beside the menu control at every width down to 390.
Audience: traders on desktop, everyone on a phone.

### Keep the top-level sections visible and flat; group only inside a panel
Finding: Demoting global categories into a "Shop by department" dropdown adds a step before the two jobs of global navigation (switching sections and showing what the site offers) and hurt discovery on desktop; where many options exist, a grouped mega panel that shows everything at once beats a scrolling dropdown, and it should open only after the pointer rests 0.5 s and close within 0.1 s once the pointer has left for 0.5 s.
Baymard's 2026 benchmark puts the hover delay at 300 to 500 ms and finds 62% of sites have none.
Source: https://www.nngroup.com/articles/killing-global-navigation-one-trend-avoid/ (NN/g, 2014), https://www.nngroup.com/articles/mega-menus-work-well/ (NN/g, 2017), https://baymard.com/research-articles/ecommerce-navigation-best-practice (Baymard, 2026), evidence: research
For Stoker: Header - the pill's six links stay flat text links with no dropdowns; Revenue and Burns stay tabs on the Stats page, not a submenu; if a grouped panel is ever added (for Developers: API, GitHub, status), it opens after a 300 to 500 ms rest, shows every item at once and closes in under 100 ms.
Audience: traders, who switch sections many times a session.

### A sticky header must be small, opaque and still
Finding: NN/g's five rules for persistent headers: maximise the content-to-chrome ratio (readable text and targets, then no extra height), contrast with the content everywhere on the page, so "the sticky header must be an opaque color" because translucent headers make the half-visible content hard to read and annoy users, keep motion minimal (no animation at all is best), consider a partially persistent header, and keep it from covering the focused element.
Source: https://www.nngroup.com/articles/sticky-headers/ (NN/g, Laubheimer, 2021), evidence: research
For Stoker: Header - the 72 px translucent bar breaks two of the five: make it opaque on terminal pages (tables scroll under it) or at least 96% with the backdrop blur removed, bring the height to 56 to 64 px on desktop and 52 px at 390, and drop any shrink or slide animation; `--header-h` then drives every sticky offset.
Audience: traders scanning tables under the header; the landing may keep a lighter bar because nothing dense scrolls beneath it.

### The mark stays top-left and goes home
Finding: Users on sites with a centred logo were six times as likely to fail to reach the homepage in one click as on sites with a top-left logo; the logo on every page also tells users where they are and reinforces the brand.
Source: https://www.nngroup.com/articles/centered-logos/ (NN/g, Whitenton, 2016), evidence: research
For Stoker: Header - the mark stays at the far left on every page and links to `/`; the floating pill may sit at the middle only while the mark keeps its corner, and at 1300 to 1440 the pill must not crowd the mark towards the centre.
Audience: all.

### Click counting is not a rule; information scent is
Finding: No published study supports the 3-click rule, Porter's data shows drop-off does not rise past three clicks, and chasing it pushes designers toward overly broad top-level navigation; the real cost is interaction cost and whether each step promises the next.
Source: https://www.nngroup.com/articles/3-click-rule/ (NN/g, Laubheimer, 2019), evidence: research
For Stoker: Header and board - do not widen the pill to put every page one click away; six top-level links is the ceiling, and a coin two clicks deep (board, then coin) is fine as long as each CoinRow shows the pair, price, change and curve progress that promise the page.
Audience: traders.

### Mark the current section in the header
Finding: 96% of sites in Baymard's 2026 benchmark do not highlight the user's current scope in the main navigation, and test participants without it were slow to work out where they were, even with breadcrumbs; the fix is a distinct style for the active top-level item.
Source: https://baymard.com/research-articles/ecommerce-navigation-best-practice (Baymard Institute, 2026), evidence: research
For Stoker: Header - the pill marks the active section with a filled chip or an underline that differs in more than colour: Explore on /coins and /coin/*, Assets on /assets/*, Rewards on /rewards, Stats on /revenue and /burns, Developers on /api, Curated on /curated; the phone overlay marks it the same way.
Audience: traders and marketers arriving on a coin page from a shared link.

### Breadcrumbs show the hierarchy on deep pages
Finding: Breadcrumbs supplement, never replace, global navigation; they show the page's place in the site hierarchy (not the session history), sit just below the global navigation, start at home and use ">" between levels, and help most for visitors who arrive deep from a search or a shared link.
Source: https://www.nngroup.com/articles/breadcrumbs/ (NN/g, Laubheimer, 2018, reviewed 2026), evidence: research
For Stoker: coin page and asset page - one short trail under the Header: "Explore > Paired with NVDAx > COIN" where the Quote Asset link opens its asset page, and "Assets > NVDAx" on an asset page; nothing deeper needs one.
Audience: traders and KOLs who land on a coin from X.

### What the reference navbars contain
Finding: Stripe shows five items (Products, Solutions, Developers, Resources, Pricing) plus "Sign in" and one filled "Contact sales"; Linear shows seven (Product, Resources, Customers, Pricing, Now, Contact, Docs) plus "Log in" and a filled "Sign up"; Phantom shows six (Features, Learn, Explore, Company, Developers, Support) plus one filled "Download"; Kraken shows seven (Kraken, Pro, Wallet, Prime, VIP, Markets, About) plus a search field, "Log in" and a filled "Sign up"; Hyperliquid's marketing site shows four (Tech, About, Apps, News) plus "Build" and a filled "Trade"; Hyperliquid's app shows eight product sections (Trade, Outcomes, Portfolio, Earn, Vaults, Staking, Referrals, Leaderboard) plus "More" and a filled "Connect"; Jupiter groups its many products under Trade, Earn and Manage with a search box and "Connect" at the right.
In every case the mark is far left, the links run left to right by frequency of use, the account control is last, and there is exactly one filled button, at the far right.
Source: the live pages listed above (read 2026-10-28), evidence: practice
For Stoker: Header - keep four to six visible links ordered by frequency (Explore, Assets, Rewards, Curated, Stats, Developers), one filled "Stoke a coin" at the far right with the wallet control after it, the search as a field or icon just left of them; never a second filled button; the phone overlay lists the same six in the same order.
Audience: traders (Explore first), creators (the one filled button), developers (last link).

## 3. Heroes and landing pages

### No carousel and nothing that moves on its own
Finding: A user hunting for a washing-machine deal missed a 98-point offer because the panel auto-rotated every 5 seconds ("it keeps flashing too quickly"); Baymard finds 46% of homepage carousels broken in some way, most users never see the later slides, and NN/g's reviewed guidance is that a static hero is usually the better choice.
Source: https://www.nngroup.com/articles/auto-forwarding/ (NN/g, Nielsen, 2013), https://baymard.com/research-articles/homepage-carousel (Baymard Institute), https://www.nngroup.com/articles/designing-effective-carousels/ (NN/g, Pernice, 2013, reviewed 2026), evidence: research
For Stoker: Hero and Trending - one static hero; Trending is a static list, and a price strip that scrolls is allowed only if it pauses on hover, carries nothing a visitor needs to read, and stops under reduced motion.
Audience: all; traders in particular read numbers and cannot read moving ones.

### Show the product, not a metaphor; decorative images are ignored
Finding: Southwest's redesign made a landscape photo the focal point and pushed the flight search several inches down, so many users did not see it before scrolling; eyetracking shows users ignore "feel-good" decorative pictures and scrutinise product photos and real people, spending 10% more time on real team portraits than on the bios beside them.
Source: https://www.nngroup.com/articles/image-focused-design/ (NN/g, Whitenton, 2014) and https://www.nngroup.com/articles/photos-as-web-content/ (NN/g, Nielsen, 2010, reviewed 2026), evidence: research
For Stoker: Hero - the visual is the product with real data: the board's top rows or a coin page in a device-free frame, as Linear and Stripe show their own UI in the hero; the salamander appears at sticker size as a brand mark in the composition, never as a full-bleed illustration, and no stock imagery anywhere on the site.
Audience: traders trust a screenshot of a live market; creators want to see the launch form; the character still serves marketers as the thing to share.

### The homepage states who you are, what you do and why you differ, above the fold
Finding: NN/g's 2024 homepage principles: the logo top-left (2.1), a tagline that explicitly conveys what the site does (2.2), the unique value and how it differs from competitors (2.3), imagery that reflects the brand (2.4), the most important content above the fold with a lead down the page (3.1), specific examples of the site's content (3.2), descriptive link labels (4.1), high-priority tasks in a clear hierarchy (4.2), and minimal motion (5.2).
Source: https://www.nngroup.com/articles/homepage-design-principles/ (NN/g, Wang, 2024), evidence: research
For Stoker: Hero - the headline is the slogan (the open half), the lede is the explicit statement of what Stoker is and how it differs (any Raydium-quoted asset as the pair, the Creator's share forwarded automatically, every payment on a public Ledger), the primary button says "Stoke a coin" and the secondary "Explore coins", and Trending is the "specific example of the site's content".
Audience: all three groups read the same four lines.

### The fold rewards what is visible with a scroll
Finding: Users scroll only when what is above the fold promises more; the average difference in how users treat content above and below the fold is 84%, long pages need signposts at the top, and designs "shouldn't need an arrow to tell users to scroll".
Source: https://www.nngroup.com/articles/page-fold-manifesto/ (NN/g, Schade, 2015), evidence: research
For Stoker: Landing - the Stats strip and the "Trending" heading straddle the fold at 1440 x 900 and at 390 x 844; no bouncing scroll arrow; the hero's own content (the figures, the product shot) is the signpost.
Audience: all.

### What the reference heroes contain
Finding: Stripe: an italic headline, a two-sentence lede, "Get started" and "Sign up with Google", a live checkout demo cycling currencies, and a strip of customer logos; Linear: a headline, a one-line lede, a "New: Loops" pill and a full product screenshot; Vercel: a headline with two buttons ("Deploy now", "Talk to sales") and customer names; Kraken: a headline, a lede, one button, a trust strip of three figures, then a live market table; Hyperliquid: a headline, a lede, one button and four live figures; Phantom: a headline, one "Download" button and the product in short videos; Jupiter: the swap form itself is the hero, with a "Find Popular Tokens" list beneath showing market cap, price, change and volume.
Source: the live pages (read 2026-10-28), evidence: practice
For Stoker: Hero - headline (slogan), one lede, "Stoke a coin" filled plus "Explore coins" ghost, a product visual made of real rows, and under it the Stats strip of four live figures with units and a "since" date; the pattern every reference shares is one headline, at most two buttons and the product, never three feature cards.
Audience: traders (figures and rows), creators (the filled button), marketers (the shareable composition).

### Minimise motion on the homepage
Finding: NN/g's homepage guideline 5.2 is "minimize motion and animation", 5.3 "provide immediate access to content" and 5.4 no popups or splash screens unless legally required.
Source: https://www.nngroup.com/articles/homepage-design-principles/ (NN/g, Wang, 2024), evidence: research
For Stoker: Landing - one entrance animation at most, no scroll-jacking, no parallax, no cookie or newsletter modal; the region disclaimer is a line in the footer and in the trade panel, not an interstitial.
Audience: all; KOLs sharing the link want it to open clean.

## 4. Footers

### A footer is the second chance and the last resort, and it never gets in the way
Finding: Users turn to the footer either as a second chance to be convinced or as the last resort for hard-to-find content, and some navigate from it rather than scroll back up; NN/g's components are utility links (contact, terms), doormat navigation (the global sections repeated), secondary-task links (jobs, documentation, press, affiliates), a site map, testimonials or awards, and brands; a footer "can help, but it can't hurt" as long as it is consistent and predictable.
Source: https://www.nngroup.com/articles/footers/ (NN/g, Fessenden, 2019), evidence: research
For Stoker: Footer - keep the four groups (Site, Creators, Developers, Community) but complete them: the six header sections as the doormat in the same order, Terms and Privacy, the status of the indexer, the on-chain addresses, the contact address, the socials, and the disclaimer; the Creator's page stays out of it (owner's decision) but the launch link stays in.
Audience: developers (API, GitHub, status), marketers (press kit, brand assets once the marketing folder produces them), everyone (terms).

### Kraken: a general disclaimer in the footer and a specific one under each claim
Finding: Kraken's footer carries social icons, Compliance Hub, Terms of Service, Exchange Trading Rules, Disclosures, product groups, "by PAYWARD" with the copyright years, and a general-information disclaimer (not advice, "can lead to loss of funds", "Geographic restrictions may apply", regulatory status "differs per jurisdiction"); in addition, every section on the page carries its own one-line note under the claim it qualifies (margin eligibility, derivatives risk, staking rewards not guaranteed, equities US-only).
Source: https://www.kraken.com (read 2026-10-28), evidence: practice
For Stoker: Footer and page sections - the disclaimer lives in the footer in full, and a one-sentence specific note sits directly under each claim that needs it: under "Creators earn about 0.5%" ("paid in the coin's Quote Asset once the platform collects its fee; see the Ledger"), under Holder Rewards ("rounds pay from the Reward Tax; the treasury is an eligible holder"), under the First Buy, and under the Burn.
Audience: traders and creators read the note beside the number; the lawyer reads the footer.

### Robinhood: lead with the one-sentence risk statement, then the entities and the regulator
Finding: Robinhood's footer opens with "All investing involves risk." in bold, then names each legal entity and what it offers, states what is and is not insured, gives a street address, links FINRA's BrokerCheck and the Customer Relationship Summaries, and repeats the fee schedule link under the product claims above.
Source: https://robinhood.com (read 2026-10-28), evidence: practice
For Stoker: Footer - open the disclaimer with one bold sentence ("Coins launched here are speculative and can lose all their value."), then the facts in order: what Stoker is (an interface to the LaunchLab program, non-custodial), the fees, the excluded regions by name (US, UK, Canada and sanctioned countries, the owner's confirmed list), and where the terms are; keep the sentences short and the type at body size, not 11 px grey.
Audience: marketers and KOLs need the excluded list plainly, because they are the ones asked.

### Terminal pages get a compact footer, the landing gets the fat one
Finding: Coinbase's footer is a full site index (Company, Learn, Support, Individuals, Businesses, Institutions, Developers, Asset prices) with a region and language selector, while Hyperliquid's trading app ends with a one-line footer (an "Online" status light, Docs, Support, Terms, Privacy Policy) and puts the jurisdiction notice at the top of the page as a banner.
Source: https://www.coinbase.com and https://app.hyperliquid.xyz/trade (read 2026-10-28), evidence: practice
For Stoker: Footer - two footers from one source of truth: the fat footer on the landing, /curated and /api; a one-line footer on the board, the coin page, the asset pages and the launch flow (indexer status with the last indexed slot, Docs, Terms, Privacy, the disclaimer sentence); the region notice appears where it bites, in the trade panel and the launch form, as a line, not a banner.
Audience: traders get the terminal footer; everyone else the fat one.

## 5. Data tables and dense trading UI

### A table serves four tasks; the first column names the record and the column order ranks importance
Finding: Tables beat cards for comparison because adjacent values need no spatial reorientation; the four core tasks are finding records by criteria, comparing data, viewing or editing one row, and acting on records; the first column should be a human-readable identifier, the default column order should reflect importance with related columns adjacent, and filtering, sorting and hiding rows must be easy and discoverable.
Source: https://www.nngroup.com/articles/data-tables/ (NN/g, Laubheimer, 2022), evidence: research
For Stoker: board - the first column is the coin (image, name, ticker and the pair mark), then price, 24h change, market cap, volume, curve progress and age; the active sort column shows its arrow; the asset rail and the search are the filters above the table; cards are not an option for the board.
Audience: traders compare rows; marketers scan for their coin by name.

### Sticky column headers and consistent cells for anything that scrolls
Finding: Comparison tables work for up to five items, must keep headers sticky so values keep their meaning while scrolling, and need consistent attribute order and formatting to stay scannable.
Source: https://www.nngroup.com/articles/comparison-tables/ (NN/g, Laubheimer, 2017), evidence: research
For Stoker: board, trades and holders tables - the header row sticks under the site header (offset by `--header-h`), every column keeps one format (same decimals, same unit position), and the pair cards on a coin page compare at most the coin and its Quote Asset side by side.
Audience: traders.

### Numbers are right-aligned, tabular and identical in precision down a column
Finding: Numeric columns must be right-aligned so decimals line up and magnitudes compare at a glance, centre alignment "makes the eye jump around", tabular figures keep every digit the same width, and the CSS is `font-variant-numeric: tabular-nums` (OpenType `tnum`); Butterick notes most default figures are proportional lining figures and that a font's tabular set must be checked by typing a line of zeros against a line of ones.
Source: https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-data-tables (Pencil and Paper, 2026), https://practicaltypography.com/alternate-figures.html (Butterick), https://developer.mozilla.org/en-US/docs/Web/CSS/font-variant-numeric (MDN), evidence: practice
For Stoker: board, trades, holders, Stats, the trade panel and the Ledger - every number right-aligned, `tabular-nums` on every value that can change (prices, balances, countdowns, the quote), the unit in the column header not the cell, one precision per column, and a numeric face chosen for its `tnum` set; the Bricolage pick must be verified for tabular figures or paired with a face that has them.
Audience: traders above all.

### No zebra stripes; hairlines and a hover tint
Finding: Three studies found no statistically significant accuracy gain from zebra striping and only a small speed gain, and preference between plain, lined and striped tables was split; Pencil and Paper add that stripes collide with hover, selected and disabled row states, leaving users "three swatches of grey to visually filter through".
Source: https://alistapart.com/article/zebrastripingdoesithelp/ and https://alistapart.com/article/zebrastripingmoredataforthecase/ (Enders, A List Apart, 2008), https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-data-tables (Pencil and Paper, 2026), evidence: research and practice
For Stoker: every table - hairline row separators from the line token, a hover tint from the surface ladder, a selected state one step stronger, no stripes; the row height derives from the type (13 px type, 20 px line, 8 px padding above and below) and is the same in every table.
Audience: traders.

### Length and position are read preattentively; colour has no order; no rings for progress
Finding: People read length and 2D position instantly and accurately, which makes bars and line charts the right encodings for quantity; colour pops out but carries no order, so it must not encode magnitude; circular charts (pie, gauge, donut) rely on area and angle, which people compare poorly.
Source: https://www.nngroup.com/articles/dashboards-preattentive/ (NN/g, Laubheimer, 2017), evidence: research
For Stoker: coin page and board - curve progress is a horizontal bar with its percentage beside it, never a ring; a 24h sparkline per CoinRow encodes the day in position; green and red mean direction only and every change carries its sign and an arrow; the Stats figures are numbers with a tiny bar or sparkline, not gauges.
Audience: traders.

### Density is information per ink, and loading time is the biggest part of it
Finding: Strom-Awn separates visual density (how much is on screen), information density (Tufte's data-ink ratio, "every bit of ink on a graphic requires reason"), temporal density (how much a user can do per unit time, where "loading times are the biggest factor") and value density; actions under 100 ms feel simultaneous, between 100 ms and 1 s "the connection between two actions is broken" and an animation can bridge the gap, and Bloomberg's Terminal dominates because "it loads data almost instantaneously".
Source: https://mattstromawn.com/writing/ui-density (Matthew Strom-Awn, 2024), evidence: practice
For Stoker: board and coin page - sort, filter and tab switches respond in under 100 ms from client state, data that takes longer shows a skeleton in the exact geometry, every separator and label must justify itself, and whitespace is kept where it groups (between the trade panel and the chart) and removed where it only spreads (inside a row).
Audience: traders; the owner's "dense terminal" verdict is this principle.

### Bloomberg: hide complexity, change incrementally, and buy a typeface for the numbers
Finding: Bloomberg's UX team rolls visual changes out little by little over months because users "make high value decisions" and react badly to sudden change, commissioned Matthew Carter to draw proportional and monospaced faces with finance glyphs (fractions to 1/64) after a font change drew thousands of complaints, moved to tabbed, resizable panels, and judges a change by the value it delivers rather than the first reaction.
Source: https://www.bloomberg.com/company/stories/how-bloomberg-terminal-ux-designers-conceal-complexity (Bloomberg, 2022), evidence: practice
For Stoker: coin page - a fixed panel layout (chart, trade panel, trades and holders as tabs, pair cards) rather than floating cards; the figures' typeface chosen for digits at 12 to 13 px (open zero, distinct 1, l and I, 6 and 8 that do not close up) and checked on a 1x screen; after launch, visual changes to the terminal pages ship in small steps, not a re-skin.
Audience: traders.

### Red and green need a colour-vision alternative; Bloomberg chose blue and red
Finding: Bloomberg estimates 20,000 Terminal users have colour vision deficiency, found its red and green indistinguishable under a deuteranopia simulation, and shipped CVD schemes that keep the semantic meaning but use blue for "up" and red for "down", brighter and more saturated, while keeping its amber for non-semantic information; Coinbase requires text, colour and icons together and never colour alone.
Source: https://www.bloomberg.com/company/stories/designing-the-terminal-for-color-accessibility (Bloomberg, 2021) and https://www.coinbase.com/blog/how-accessibility-drives-product-quality-at-Coinbase (Coinbase, 2025), evidence: practice
For Stoker: tokens and the account menu - `up` and `down` always travel with a sign and an arrow, differ in lightness as well as hue, and a "Colour vision: blue and red" preference swaps the two tokens site-wide (one cookie like the scheme); the heat ramp stays non-semantic, as Bloomberg keeps its amber.
Audience: traders; about one man in twelve.

### Hyperliquid's trade page as the density reference
Finding: Under the market name Hyperliquid shows six label-over-value figures in one row (Mark, Oracle, 24h Change as "+0.450 / +0.56%", 24h Volume, Open Interest, Funding with a countdown); the order book and trades are three-column tables (Price, Size, Total; Price, Size, Time with each trade linked to its transaction); the order form stacks Market/Limit/Pro tabs, Buy/Sell, a size field with a percent slider and presets, then the consequences in label-value rows (Liquidation Price, Order Value, Margin Required, Slippage "Est: 0% / Max: 8.00%", Fees "0.0450% / 0.0150%"); the page's footer is one line with an "Online" light.
Source: https://app.hyperliquid.xyz/trade (read 2026-10-28), evidence: practice
For Stoker: coin page - a figures row under the coin name (Price, 24h, Market cap, Volume, Curve, Holders), trades as Price, Size, Time with the signature linked, holders as Wallet, Share, Amount, and the trade panel ending in the consequence rows (You receive, Minimum after slippage, Fee, Creator's share) before the one filled button.
Audience: traders.

## 6. Forms and transactional flows

### Forms that follow the basics get submitted right first time twice as often
Finding: Seckler's CHI study found 78% one-try submissions on guideline-compliant forms against 42% on non-compliant ones; NN/g's ten recommendations are keep it short, group labels with fields, single column, logical sequence, no placeholder-as-label, fields sized to the input, mark required and optional, explain formats, no Reset or Clear button, and specific errors signalled by more than colour.
Source: https://www.nngroup.com/articles/web-form-design/ (NN/g, Whitenton, 2016), evidence: research
For Stoker: launch flow - one column, labels above fields, required marks on name, ticker, image and pair, the ticker field sized to its maximum, the image field stating the exact spec (format, size, square), the links collapsed under "Add links" as optional, and no clear or reset control anywhere.
Audience: creators.

### Placeholders are not labels
Finding: Disappearing placeholder text strains short-term memory, removes the ability to check answers before submitting, leaves errors without context, hurts keyboard users, makes filled fields look filled, and eyetracking shows "users' eyes are drawn to empty fields".
Source: https://www.nngroup.com/articles/form-design-placeholders/ (NN/g, Sherwin, 2014, reviewed 2018), evidence: research
For Stoker: launch flow and trade panel - every field has a visible label outside it; a placeholder only ever shows an example value ending with an ellipsis ("0.00" in the amount, "STOKE…" in the ticker), as Vercel's guideline puts it.
Audience: creators and traders.

### Validate on blur, clear the error on fix, confirm the hard fields
Finding: Inline validation should not fire before the user has had a chance to type a correct value, so it runs when the field is left (onblur), the error disappears the moment the field is corrected, and positive confirmation helps on fields users often get wrong; 31% of sites have no inline validation and NN/g adds that success marks should be reserved for complex fields and that validating before input is complete is hostile.
GOV.UK, by contrast, validates on submit by default, shows an error summary at the top with focus moved to it, prefixes the page title with "Error:", keeps every answer, and uses inline validation only when research shows it helps.
Source: https://baymard.com/blog/inline-form-validation (Baymard), https://www.nngroup.com/articles/errors-forms-design-guidelines/ (NN/g, Krause, 2019), https://design-system.service.gov.uk/patterns/validation/ (GOV.UK Design System), evidence: research and practice
For Stoker: launch flow - the name and ticker are checked when the field is left (the Copy Protection check already answers), the verdict is shown inline with an icon and a sentence that says what and until when ("Taken by STOKE until 4 Nov"), the image hash is checked after upload, a submit with errors shows a summary at the top that links to each field, and no field is ever cleared.
Audience: creators; marketers launching for a client get the same clarity.

### Labels above the field, a single column, and nothing promotional in the transaction
Finding: Baymard's mobile testing puts labels above fields (left-aligned labels break at narrow widths and in landscape), multi-column layouts cause users to skip or misread fields (16% of sites get this wrong), and Stripe's checkout guidance adds fewer fields, clear labels with inline format examples, a bold emphasised total, and "promotional banners, upsell boxes, and unnecessary links don't belong in checkout".
Source: https://baymard.com/research-articles/mobile-form-usability-label-position and https://baymard.com/blog/avoid-multi-column-forms (Baymard), https://stripe.com/resources/more/checkout-ui-strategies-for-faster-and-more-intuitive-transactions (Stripe, 2025), evidence: research and practice
For Stoker: trade panel - the amount label sits above the field, the presets (25, 50, 75, Max) are one segmented row under it, the one emphasised figure is what the trader receives after fees at the slippage limit, and nothing else (no Curated promo, no "share on X") sits inside the panel.
Audience: traders.

### Ask one thing at a time, and review before the irreversible step
Finding: GOV.UK's most-researched pattern asks one question per page so users focus, keeps a Back link, treats a step that can only be done once (a payment) specially, tests without a progress indicator first, and ends with a "check your answers" page before submission.
Source: https://design-system.service.gov.uk/patterns/question-pages/ (GOV.UK Design System), evidence: practice
For Stoker: launch flow - the single page stays, but its sections run in one fixed order (launch type, name and ticker and image, the pair, the First Buy, links) and end in the summary that works as "check your answers" with an edit link per section; split into steps only if testing shows the page overwhelms; after the launch lands, the browser back button must not re-open a form that could mint again.
Audience: creators; the retry rule (one mint per draft) already protects this.

### Error messages sit by their field, say what to do, and are not for ineligibility
Finding: An error must appear next to its source, use redundant indicators (red text, a border, an icon, never colour alone), match its severity (inline for fixable input, a modal only for severe cases), and never appear before the input is complete; GOV.UK adds that an error message must not be used to say a user is not eligible or lacks permission, which belongs on a page that explains what to do next.
Source: https://www.nngroup.com/articles/error-message-guidelines/ (NN/g, 2023) and https://design-system.service.gov.uk/components/error-message/ (GOV.UK Design System), evidence: research and practice
For Stoker: launch flow, trade panel and the region rule - a chain failure is translated into plain words with the fix ("The price moved more than your 1% limit. Raise the limit or try again."), a refused Copy Protection or a disallowed airdrop is explained in a panel with the next step rather than as a red field, and the excluded-region rule is a page section, not a validation error.
Audience: traders (slippage), creators (copy refusals).

### Uniswap: quote in a fraction of a second, show the token's own fee, protect by default
Finding: Uniswap cut quote time "to a fraction of a second", which removed a click; it detects fee-on-transfer tokens, shows the fee to the swapper and adjusts slippage to include it so swaps stop failing; it sends swaps to a private pool by default with an opt-out in settings; and its refreshed look "marries high-contrast colors with a legible typeface".
Source: https://blog.uniswap.org/uniswap-swap-ux-improvements (Uniswap Labs), evidence: practice
For Stoker: trade panel - the quote arrives under a second with a visible refresh countdown, a Reward Launch's transfer tax is shown as its own line and folded into the minimum received (the panel already quotes the wallet-side figure), the slippage default is the protective 1% with the advanced control behind a disclosure, and the route for SOL-paid buys shows what is kept.
Audience: traders.

### The small mechanics that make a form feel finished
Finding: Vercel's guideline list requires `autocomplete` and a meaningful `name` on inputs, the right `type` and `inputmode`, no paste blocking, clickable labels, spellcheck off for codes and usernames, a submit button that stays enabled until the request starts and then shows a spinner, inline errors with focus moved to the first one, and a warning before leaving with unsaved changes.
Source: https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md (Vercel Labs, 2025), evidence: practice
For Stoker: launch flow and trade panel - amount fields get `inputmode="decimal"`, the ticker field `autocapitalize` and spellcheck off, addresses accept paste, the launch button disables on send and shows "Sending…" with the ellipsis character, and a filled launch form warns before navigation.
Audience: creators and traders.
## 7. Colour and theming

### Colour roles come in pairs, and text only sits on a surface that has an "on" partner
Finding: Material 3 defines 26 colour roles in six groups (primary, secondary, tertiary, error, surface, outline), every fill role has an "on" role for the text and icons placed on it, "container" roles are fills that must never be used for text, and the pairs are built to guarantee at least 3:1; combining colours outside the intended pairs "may break contrast necessary for visual accessibility".
Source: https://m3.material.io/styles/color/roles (Material Design 3), evidence: practice
For Stoker: tokens in `globals.css` - every fill token gets its "on" partner (`button`/`on-button` exists; add `on-surface-2`, `on-plate`, `on-up-bg`, `on-down-bg`, `on-caution-bg`, `on-heat`), no component may put ink on a fill that has no partner, and `apps/web/scripts/contrast.mjs` checks pairs rather than loose colours.
Audience: all; a trader's eye is on the figures, which are the text most often placed on a tinted surface.

### Dark surfaces are dark grey, and height is lightness
Finding: Material's dark theme uses dark grey (#121212) rather than black so shadows and depth stay visible, expresses elevation by overlaying white on the surface from 5% at 1 dp to 16% at 24 dp, desaturates primaries so they keep 4.5:1 on every level, keeps white body text at 15.8:1 or more, and limits colour to accents on large dark surfaces; Atlassian names four elevations (sunken, default, raised, overlay), keeps shadows on raised and overlay surfaces even in dark, and describes dark surfaces as "distantly lit from the front, the higher the elevation, the lighter the surface".
Source: https://m2.material.io/design/color/dark-theme.html (Material Design) and https://atlassian.design/foundations/elevation (Atlassian Design System), evidence: practice
For Stoker: tokens - derive the dark ladder as white overlays on the canvas (bg 0%, surface 5%, surface-2 8%, surface-3 12%, a menu or dialog 16%) so the four surfaces are provably ordered, keep an ambient shadow on surface-3 in dark, and desaturate the accent where it is text on a dark surface; the near-black canvas (`#05090e`) is within Material's advice as long as the ladder above it is lighter, not darker.
Audience: traders, who live in dark mode.

### A twelve-step scale gives every step a job
Finding: Radix Colors' scales have twelve steps with fixed roles (1 and 2 backgrounds, 3 to 5 component backgrounds for rest, hover and active, 6 to 8 borders for non-interactive, interactive and focus, 9 and 10 solid fills, 11 and 12 text), steps 11 and 12 are guaranteed APCA Lc 60 and Lc 90 on a step 2 background, the gray should be tinted toward the accent hue for a harmonious result, and saturated grays clash with colourful badges, especially in dark mode.
Source: https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale and https://www.radix-ui.com/colors/docs/palette-composition/composing-a-palette (Radix UI), evidence: practice
For Stoker: tokens - rebuild each theme as a twelve-step accent scale and a twelve-step gray tinted toward it (a sage gray for Teal), and map the roles to steps (`bg` 1, `surface` 2, chip rest/hover/active 3/4/5, `line` 6, `line-strong` 7, `ring` 8, `button` 9, button hover 10, `ink-3` 11, `ink` 12); the many coloured labels on a coin page (risk labels, up, down, caution) argue for the less saturated gray.
Audience: all.

### You cannot build an interface from five hex codes
Finding: Refactoring UI asks for 8 to 10 greys, 5 to 10 shades of one or two primaries and shades for every accent (as many as ten colours with five to ten shades each in a complex UI), says to define the shades up front with the base shade chosen as "a shade that would work well as a button background", and warns that lightening and darkening on the fly "is how you end up with 35 slightly different blues".
Source: https://www.refactoringui.com/previews/building-your-color-palette (Wathan and Schoger, Refactoring UI), evidence: practice
For Stoker: tokens - the full scales live in `globals.css`, components reference steps by role, and no module computes a colour with `color-mix`, alpha or a filter at the point of use (the settled hairline alphas excepted).
Audience: all; the owner's "dull" verdict on Graphite was a palette with too few steps.

### Contrast is checked by two rulers, and the dark theme needs the perceptual one
Finding: WCAG 2.2 requires 4.5:1 for normal text and 3:1 for large text (18 pt, or 14 pt bold) and for non-text essentials, the thresholds chosen to compensate for roughly 20/40 vision; APCA gives perceptual lightness contrast, with Lc 90 preferred for body text, Lc 75 its minimum, Lc 60 the minimum for any other text people must read, Lc 45 for large headlines, Lc 30 for placeholders and disabled text and Lc 15 for dividers, and its authors state that WCAG 2's ratio overstates contrast near black so it "cannot be used for guidance designing dark mode".
Source: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html (W3C) and https://git.apcacontrast.com/documentation/APCA_in_a_Nutshell (Myndex Research), evidence: practice
For Stoker: tokens and `contrast.mjs` - keep the AA check and add an APCA column; the dark theme's `ink-3` on `surface-2` at 12 to 13 px (meta text, column headers, timestamps) must reach Lc 60, table body Lc 75, the hairline Lc 15 against the surface it sits on; any pair that fails either ruler is changed in the token, not hidden with a bigger font.
Audience: traders reading 12 px figures at night.

### Generate the themes from three variables in a perceptual space
Finding: Stripe found that none of its hand-picked text colours met 4.5:1 and that darkening them made them "dark and muddy", so it built a tool on a perceptually uniform colour model; Linear generates its light, dark and custom themes in LCH from three variables (base colour, accent colour, contrast), which replaced 98 hand-set variables per theme and gives high-contrast themes for free.
Source: https://stripe.com/blog/accessible-color-systems (Stripe, Koopersmith and Miner, 2019) and https://linear.app/now/how-we-redesigned-the-linear-ui (Linear, Saarinen and others, 2024), evidence: practice
For Stoker: `theme.ts` and `globals.css` - generate Teal, Cobalt and Violet from (base hue, accent, contrast) in OKLCH at build time instead of hand-typed hexes, which solves the light Teal's AA problem (`#077466`) by lightness rather than by a muddy pick and adds a high-contrast variant as a third knob of the scheme toggle.
Audience: all; a trader with low vision gets the high-contrast variant.

### The accent must not be the "up" colour
Finding: Apple's colour guidance is to "avoid using the same color to mean different things", because an interactive colour that also styles non-interactive text is confusing, and Bloomberg keeps its brand amber strictly non-semantic beside its up and down colours.
In Stoker's Teal theme the accent (`#2fd3c0`) and the up colour (`#34d399`) are near-identical mint hues, so a positive change and an interactive link read as the same signal.
Source: https://developer.apple.com/design/human-interface-guidelines/color (Apple Human Interface Guidelines) and https://www.bloomberg.com/company/stories/designing-the-terminal-for-color-accessibility (Bloomberg, 2021), evidence: practice
For Stoker: tokens - keep the accent and `up` at least 30 degrees of hue apart (move `up` toward a yellow-green, or the accent toward cyan), never set a change figure in the accent, and never set a link in `up` or `down`.
Audience: traders.

### Light mode performs better for most eyes, so offer both and never invert
Finding: NN/g's literature review finds visual performance better in light mode for normal vision and better in dark mode for some users with cataracts, and strongly recommends letting users switch; Apple's guidance is that dark colours "aren't necessarily inversions", to soften white image backgrounds so they do not glow, to keep 4.5:1 at minimum and aim for 7:1 for custom small text, and not to add an app-specific appearance setting that fights the system.
Source: https://www.nngroup.com/articles/dark-mode/ (NN/g, Budiu, 2020) and https://developer.apple.com/design/human-interface-guidelines/dark-mode (Apple Human Interface Guidelines), evidence: research and practice
For Stoker: `SchemeToggle` and coin images - add "System" as the third state of the toggle so the site follows the OS by default, give user-uploaded coin images a 1 px inset hairline on a surface-2 plate so white-background logos do not glow in dark, and let the chart read its grid and text colours from the same tokens as the page.
Audience: all.

### Glass, glow and gradients are rationed to one place each
Finding: NN/g's glassmorphism guidance is to meet contrast requirements through the glass, use more blur rather than less, and let users reduce transparency; Geist's colour rules are "draw each border once" (keep a divider inside the border, never two alpha borders meeting) and keep shadows translucent so they blend with any background; the practitioner lists of AI-generated tells all name purple gradients, glowing blobs behind the hero, glowing cards and one-sided coloured borders.
Source: https://www.nngroup.com/articles/glassmorphism/ (NN/g, Brown, 2024), https://vercel.com/geist/colors (Vercel Geist), https://vibemole.com/resources/avoid-vibecoded-app-design (VibeMole, 2026), evidence: research, practice and opinion
For Stoker: Header and tokens - the header is the one glass element and gets maximum blur with a solid fallback under `prefers-reduced-transparency`; the glow exists only on the primary button and the focus ring; the heat ramp appears only as the text fill of "You do.", on the brand's own big figures and as the curve's fill; no gradient section backgrounds, no coloured left borders on cards, and a card edge never doubles a table's hairline.
Audience: all; the glow discipline is what separates a terminal from a template.

## 8. Typography

### Body text on the web is 15 to 25 px, leading 120 to 145%, lines of 45 to 90 characters
Finding: Butterick's rules for body text are a size of 15 to 25 px on the web, line spacing of 120 to 145% of the size, an average line length of 45 to 90 characters (two to three alphabets), 5 to 12% extra letterspacing for all caps, bold or italic as little as possible, centred text sparingly, and never confusing hyphens with dashes.
Source: https://practicaltypography.com/summary-of-key-rules.html, https://practicaltypography.com/line-length.html and https://practicaltypography.com/point-size.html (Butterick's Practical Typography), evidence: practice
For Stoker: type steps - landing body 17 to 18 px at 1.5, the lede's measure capped at about 66 characters (a `max-width` near 34 em), terminal body 13 to 14 px at 1.45, eyebrow caps at 11 to 12 px with 0.08 em tracking, centred text only in the hero and in empty states, and the `t-*` steps documented with their line heights.
Audience: all; creators read the launch form's help text, traders the figures.

### Five type roles with a usage column, and no product uses all of them
Finding: Material 3 organises type into display, headline, title, body and label at three sizes each, says "no single product will use all the styles", reserves display for short, important text or numerals, and keeps emphasised styles for selection and primary actions; Geist documents each style with its use ("Label 14: most common text style of all", "Label 13 with tabular: when conveying numbers for consistent spacing", "Label 12 caps: tertiary text in busy views", "Copy 14: most commonly used", "Button 12: only inside an input field").
Source: https://m3.material.io/styles/typography/applying-type (Material Design 3) and https://vercel.com/geist/text (Vercel Geist), evidence: practice
For Stoker: type steps - one role table with a usage column, each step existing once: display-l 64 to 72 px (the hero headline), display-s 40 px tabular (the Stats figures), headline 28 px (page titles), title 18 px (panel headers, the coin name), body 16 and 14 px (ledes and descriptions), label 13 px tabular (table cells, the quote), label 12 px caps (column headers, eyebrows), button 14 px, mono 13 px (addresses, signatures, `/api` code).
Audience: all; the same table serves the terminal and the landing.

### No weight under 400, nothing under 12 px, and weight never changes on hover
Finding: Apple's minimum sizes are 11 pt on iOS and 10 pt on macOS, it advises against Ultralight, Thin and Light weights and against mixing typefaces; Rauno Freiberg's guidelines add that weights below 400 should not be used, medium headings look best at 500 to 600, font weight must not change on hover or selection because it shifts layout, headings should scale with `clamp()`, and inputs must be at least 16 px on touch to stop iOS zooming.
Source: https://developer.apple.com/design/human-interface-guidelines/typography (Apple Human Interface Guidelines) and https://interfaces.rauno.me/ (Rauno Freiberg, Web Interface Guidelines), evidence: practice
For Stoker: type steps and the Header - nothing under 12 px on desktop or 13 px on a phone, no weight under 400 (meta text is quieter through colour, not thinness), headings at 600, the pill's active and hovered links change colour and background but never weight, the hero headline sized with `clamp(40px, 5vw, 72px)`, and every field 16 px at 390.
Audience: all.

### Hierarchy is built from three inks of one colour
Finding: Linear's redesign reduced visual noise, kept alignment and increased the hierarchy and density of navigation, and its designer worked "with opacities of black and white" to establish the relationship between elements and their elevation before any colour was chosen.
Source: https://linear.app/now/how-we-redesigned-the-linear-ui (Linear, 2024), evidence: practice
For Stoker: tokens and the coin page - define `ink`, `ink-2` and `ink-3` as alphas of one ink (100%, 72%, 52%) rather than three greys so the hierarchy holds on every surface in both schemes, and align every label column on the coin page to one left edge.
Audience: traders.

### Numbers get a face with tabular figures, if need be a second face
Finding: Bloomberg commissioned both a proportional and a monospaced face with finance glyphs after a font change drew thousands of complaints, Pencil and Paper recommend a monospaced or tabular face for numeric columns, and Butterick explains that only a font's tabular set lines digits up.
Source: https://www.bloomberg.com/company/stories/how-bloomberg-terminal-ux-designers-conceal-complexity (Bloomberg, 2022), https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-data-tables (Pencil and Paper, 2026), https://practicaltypography.com/alternate-figures.html (Butterick), evidence: practice
For Stoker: type - audit the Bricolage pick for `tnum`, an open or slashed zero and digit legibility at 12 px on a 1x screen; if it lacks tabular figures, pair one numeric companion face used for every figure, which is Bloomberg's and Geist's pattern (words in one family, numbers and code in another).
Audience: traders.

### Typographic hygiene is a lint rule
Finding: Vercel's guideline list requires the ellipsis character rather than three periods, curly quotes, non-breaking spaces in "10 MB" and "⌘ K" and brand names, loading labels that end with an ellipsis, `font-variant-numeric: tabular-nums` on number columns, and `text-wrap: balance` on headings to prevent widows; Atlassian sets its type tokens in rem so browser text size changes scale the UI.
Source: https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md (Vercel Labs, 2025) and https://atlassian.design/foundations/typography (Atlassian Design System), evidence: practice
For Stoker: the web app - type in rem on a 16 px root, the slogan and every page title with `text-wrap: balance`, "Stoke a coin" never wrapping, the ellipsis and curly quotes enforced by a lint rule on JSX text, and the board checked at 125% browser zoom (Coinbase reports 24% of customers enlarge text).
Audience: all.

## 9. Motion

### Easing and duration are tokens, and utility motion uses the standard scheme
Finding: Material's easing tokens are emphasized decelerate `cubic-bezier(0.05, 0.7, 0.1, 1.0)` for entering elements, emphasized accelerate `cubic-bezier(0.3, 0.0, 0.8, 0.15)` for exiting, and standard `cubic-bezier(0.2, 0.0, 0, 1.0)` for simple utility transitions; durations are grouped as short (50 to 200 ms, "small utility-focused transitions"), medium (250 to 400 ms) and long (450 to 600 ms); M3 Expressive now drives motion with springs and offers a standard scheme "with minimal bounce" that "should be used for utilitarian products".
Source: https://m3.material.io/styles/motion/easing-and-duration/tokens-specs and https://m3.material.io/styles/motion/overview/how-it-works (Material Design 3), evidence: practice
For Stoker: `globals.css` - a motion token set (`--ease-enter`, `--ease-exit`, `--ease-standard`, `--dur-fast: 120ms`, `--dur-base: 200ms`, `--dur-slow: 280ms`), the standard scheme everywhere in the terminal, and no bounce anywhere except, at most, the hero's one entrance.
Audience: traders.

### Fast, ease-out, under 300 ms, transform and opacity only, interruptible, and never on keyboard actions
Finding: Emil Kowalski's principles are that great animations feel natural (springs), are fast (ease-out "starts fast and slows down at the end", usually shorter than 300 ms), have a purpose and are paced, are performant (animate `transform` and `opacity` so only the compositor works, move off the main thread with CSS or WAAPI), and are interruptible; he adds "never animate keyboard initiated actions", that built-in curves are too weak so custom curves are needed, that a popover should animate from its trigger with `transform-origin` at the button, and that a functional graph "in a banking app" is better with no animation at all.
Source: https://emilkowal.ski/ui/great-animations and https://emilkowal.ski/ui/good-vs-great-animations (Emil Kowalski), evidence: practice
For Stoker: Header search, menus, the trade panel and the chart - the gooey search's results, the account menu and the asset picker enter in 180 to 200 ms from the trigger's origin with scale from 0.96 and a fade, and leave in 120 ms with the accelerate curve; the ⌘K palette opens with no animation; the chart has no entrance animation and an instant crosshair; live figures change with a 400 ms background flash in the direction tint that fades, never with counting digits.
Audience: traders; the counting-digits flourish stays on the landing's Stats if the owner wants it, and nowhere in the terminal.

### 200 ms for interactions, values proportional to the trigger, no motion on frequent actions
Finding: Rauno Freiberg's guidelines cap interaction animation at 200 ms "to feel immediate", scale a dialog from about 0.8 rather than 0 and a pressed button to about 0.96 rather than 0.8, exempt frequent low-novelty actions (opening a context menu, adding or deleting list items, hovering trivial buttons) from animation, forbid transitions when the theme switches, pause looping animations offscreen, and show hover states only under `@media (hover: hover)`.
Source: https://interfaces.rauno.me/ (Rauno Freiberg, Web Interface Guidelines), evidence: practice
For Stoker: everywhere - hover and press transitions at 120 ms on colour and background only, a pressed button scales to 0.98 at most, the asset rail chips and table rows change state without motion, the scheme toggle switches with no transition, the price strip and the hero's loop pause when scrolled out of view, and touch devices never show hover styles.
Audience: traders, who press the same controls hundreds of times a session.

### Motion from interaction must be disableable
Finding: WCAG 2.3.3 requires that motion animation triggered by interaction can be disabled unless essential, because non-essential movement can trigger distraction, dizziness, migraines and nausea in people with vestibular disorders; the pass techniques are to avoid unnecessary animation, to offer a control, or to honour the platform's reduce-motion setting; Vercel's list adds that `transition: all` is never allowed, that animations must respond to input mid-way, and that autoplaying motion longer than 5 s needs pause, stop or hide controls; Apple's guidance is to add motion purposefully, make it optional, keep feedback brief and precise, avoid motion on frequent interactions and let people cancel it.
Source: https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html (W3C), https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md (Vercel Labs, 2025), https://developer.apple.com/design/human-interface-guidelines/motion (Apple Human Interface Guidelines), evidence: practice
For Stoker: `globals.css` and every animated module - under `prefers-reduced-motion` every transition becomes an instant state change except opacity fades of 100 ms or less, the gooey search becomes a plain field, loops stop, and the direction flash becomes a static tint held for a second; no rule anywhere uses `transition: all`.
Audience: all.

### An animation has a goal, a frequency and a mechanic before it has a duration
Finding: NN/g asks of every animation where the user's attention is at that moment, whether its goal is to attract attention, show continuity between states or show a relationship, how often one user meets it per session, and what its mechanics are; NN/g's homepage guidance is to minimise motion and its sticky-header guidance is to use none.
Source: https://www.nngroup.com/articles/animation-usability/ (NN/g, Harley, 2014), https://www.nngroup.com/articles/homepage-design-principles/ (NN/g, 2024), https://www.nngroup.com/articles/sticky-headers/ (NN/g, 2021), evidence: research
For Stoker: Landing and Header - one entrance on the hero of at most 400 ms, no scroll-driven motion, no parallax, and a header that does not shrink, hide or slide; every other animation on the site must name its goal in a code comment (continuity for a menu, attention for a landed transaction) or be removed.
Audience: all.

## 10. Empty states, loading and errors

### An empty container must say what happened, teach, and offer the next step
Finding: A blank container "creates confusion and decreases user confidence" because the user cannot tell whether the request finished, is loading, errored or was filtered to nothing; designed empty states communicate system status (a sentence such as "There are no records to display for the selected date range"), provide learning cues about unused features, and give a direct pathway to the key task.
Source: https://www.nngroup.com/articles/empty-state-interface-design/ (NN/g, Kaplan, 2021), evidence: research
For Stoker: empty board, empty rewards, empty creator page, empty search - each states its condition in one sentence ("No coins paired with NVDAx yet", "No Reward Launch has paid a round yet", "No coins match 'xyz'"), explains the feature in one more, and offers one primary action ("Stoke a coin", "See how Holder Rewards work", "Clear the search").
Audience: creators (the first-launch path) and traders (why the board is empty).

### Four parts, one call to action, and a tone that fits the scenario
Finding: Atlassian's empty state has an optional spot illustration, a header, an optional description and optional buttons; it must include a relevant action or link but not too many, use a spot illustration at its own size (never resized to fit), choose a neutral or humorous tone and never a negative one, and set the tone by scenario (inspirational for a blank slate, celebratory when the user finished everything, informative on an error).
Source: https://atlassian.design/components/empty-state/usage (Atlassian Design System), evidence: practice
For Stoker: every empty state - the salamander is the spot illustration at one fixed size on every page, the header is a positive statement, there is one primary and at most one secondary action, and the tone is inviting on the empty board (the owner's "invitation"), matter-of-fact on an empty filter, and plain on an error.
Audience: all; marketers get the shareable character in the one place it belongs.

### A positive title, a body that names the action, and starter content when there is nothing to show
Finding: Carbon writes the title as a positive statement ("Start by adding data assets" rather than "You don't have any"), explains the next action in the body as a button, an inline link or a pointer to the UI element, distinguishes no-data, user-action and error-management empty states, and offers in-line documentation, onboarding and starter content as alternatives for first use.
Source: https://carbondesignsystem.com/patterns/empty-states-pattern/ (IBM Carbon Design System), evidence: practice
For Stoker: the landing on an empty database and the empty board - the starter content is real: the 605 pairable assets, the asset rail's kinds, and three example pairings written as sentences, so the page shows the product before a single coin exists; "Trending" becomes the invitation (settled) with the live asset count beside it.
Audience: creators on day one; the owner, who judges the dev site in this state.

### Decide loading, empty, populated and error outside the component, and never show empty during loading
Finding: Polaris' empty state takes a heading, a subheading, a decorative graphic (`alt=""`), one primary button and one secondary button, and the migration guidance insists on keeping "the condition that distinguishes loading, empty, populated, and error states" outside the component and on verifying that "the empty state doesn't render during loading or error states".
Source: https://shopify.dev/docs/apps/build/app-home/migrate-from-polaris-react/empty-state (Shopify Polaris), evidence: practice
For Stoker: every data container (the board, Trending, trades, holders, rounds, the Ledger, the creator page) - four explicit states with four designed renderings, the empty one shown only after a successful fetch returned nothing, and the error one showing the last good data with the time it was fetched and a retry.
Audience: traders; a board that flashes "no coins" while loading reads as broken.

### Skeletons mimic the layout, nothing shows under 200 ms, progress after five seconds
Finding: A skeleton screen must mirror the page's structure (a frame-only skeleton "is essentially equivalent to a spinner"), Carbon limits skeletons to container and data components and never to buttons, modals or toasts, and Material's thresholds are no indicator under 200 ms, a loading indicator from 200 ms to 5 s, a progress indicator beyond 5 s, one indicator per group rather than one per item, and the same variant for the same process everywhere.
Source: https://www.nngroup.com/articles/skeleton-screens/ (NN/g, Tankala, 2023), https://carbondesignsystem.com/patterns/loading-pattern/ (IBM Carbon), https://m3.material.io/components/progress-indicators/guidelines (Material Design 3), evidence: research and practice
For Stoker: board, coin page and buttons - skeleton rows in the exact `CoinRow` geometry (eight of them), a chart-shaped skeleton, nothing shown for the first 200 ms, one indicator for a whole panel, a submitting button that disables and shows a spinner, and the same spinner everywhere.
Audience: traders.

### Feedback within a second, an estimate after ten, and a status the user can watch
Finding: NN/g's first heuristic is visibility of system status; progress indicators reduce uncertainty, raise satisfaction and make people willing to wait longer, and anything that will take more than 10 seconds needs an estimate of when it will finish.
Source: https://www.nngroup.com/articles/progress-indicators/ (NN/g, Sherwin, 2014) and https://www.nngroup.com/articles/ten-usability-heuristics/ (NN/g, Nielsen, 1994, reviewed 2024), evidence: research
For Stoker: trade panel and launch flow - after signing, a three-step status (Sent, Confirmed, Indexed) with the elapsed time, a line such as "usually under 5 s" that becomes an estimate past 10 s, and the explorer link as soon as the signature exists; the Arweave upload shows its own status on the coin page ("Permanent copy pending") until it lands.
Audience: traders and creators.

### Errors are explained in place, not painted red, and the 404 goes somewhere
Finding: GOV.UK separates fixable validation errors (inline, with the fix) from problems with the service (a page that explains and says what to do next), NN/g's ninth heuristic is to help users recognise, diagnose and recover from errors, and NN/g's homepage principle 1.1 is that every page, including a dead end, links home implicitly through the logo and explicitly.
Source: https://design-system.service.gov.uk/components/error-message/ (GOV.UK Design System), https://www.nngroup.com/articles/ten-usability-heuristics/ (NN/g) and https://www.nngroup.com/articles/homepage-design-principles/ (NN/g, 2024), evidence: practice and research
For Stoker: error states and the 404 - an API failure is an inline notice in the panel it affects (what happened, what to do, when the data was last good) and never a red wall; the 404 shows the mark, "No coin at this address", a search field, and links to Explore and home.
Audience: all; KOLs share links that break.

## 11. The "looks AI-generated / vibe-coded" problem

### An agency's list of tells: spacing, the default gradient, contrast, type, hierarchy, copy
Finding: Sinton's visual tells are inconsistent spacing ("one of the clearest signs of considered design" when it is consistent), the default blue-to-purple gradient, poor contrast such as light grey on white, weak typography (default fonts, awkward line lengths, inconsistent heading sizes, cramped leading), and broken scale with logos, headings and images fighting; the technical tells are slow loads, layouts that break at widths nobody prompted for, missing alt text and labels, and missing meta and Open Graph; the content tells are generic copy that could describe any business, leftover placeholders, vague calls to action, and a site with no clear goal.
Source: https://www.sinton.agency/blog/how-to-spot-a-vibe-coded-website (Sinton Agency), evidence: opinion
For Stoker: every page - one spacing scale applied from one base, no gradient backgrounds, every text pair past both contrast rulers, one type table, and every button labelled with what happens ("Stoke a coin", "Buy 1.2 SOL of COIN"), with the placeholder socials replaced before launch.
Audience: all.

### Fifteen signals, and the fixes: remove a layer, make one thing dominant, show the product
Finding: VibeMole's signals are cards inside cards, the same feature grid as everyone, purple gradients and glowing blobs, pill badge spam above every heading, generic SaaS copy, repeated section headings, default font stacks and flat typography, grids of Lucide icons, one-sided coloured borders, dark SaaS with no product context, fake product evidence, repetitive animation and flashing dots, confident copy that says nothing, no visible product workflow, and "the product looks like the tools used to build it"; the fixes are product-specific copy, removing one layer from every section, making one thing visually dominant, adding real product evidence, and stricter design constraints.
Source: https://vibemole.com/resources/avoid-vibecoded-app-design (VibeMole, 2026), evidence: opinion
For Stoker: Landing and coin page - no card inside a card (a coin page panel holds a table, not a card holding a card holding a table), one eyebrow at most per page, no icon grid of three benefits, the workflow shown as the product (launch, trade, Ledger) in real screenshots or live rows, and one dominant element per section.
Audience: all; this is the list the owner's verdict is made of.

### Five hundred sites: the tells are inconsistency and the absence of a system
Finding: A survey of more than 500 launches found the same habits regardless of builder: purple gradients, sparkles and emoji in headings, glowing hover states, oversized heading weights against thin body text, uneven paragraph spacing, mismatched border radii, cards that lift too far on hover, huge icons beside tiny text, social icons that go nowhere, animations without easing, no loading states, buttons without progress, em dashes in hero copy, and fake testimonials, concluding that vibe-coded sites "are defined by inconsistency, randomness, and the absence of a system holding everything together".
Source: https://www.reddit.com/r/VibeCodeDevs/comments/1p5vnqq/plz_avoid_these_obvious_signs_your_website_is (r/VibeCodeDevs, 2025), evidence: opinion
For Stoker: tokens and every module - one radius token per role (control, card, pill) and nothing else, one icon size per context, hover lifts of 0 to 1 px, every animation on a token curve, loading states on every button and container, no emoji in headings, and no em dashes anywhere (already a house rule).
Audience: all.

### Generic is what untransferred judgement looks like
Finding: Jola Gil argues from Polanyi's tacit knowledge that only 20 to 30% of a designer's expertise is explicit, so prompted output converges on the same aesthetic and is "technically correct and compositionally dead"; the hierarchy "guides the eye in a way that feels authored, not assembled", and the cure is the designer's own look-adjust-look loop on the real artefact, not better prompts.
Source: https://medium.com/design-bootcamp/why-your-vibe-coded-designs-look-generic-the-fix-isnt-better-prompts-09e2fda26591 (Jola Gil, 2026), evidence: opinion
For Stoker: the process - every unit is judged on the running site with seeded data at 1440 and 390 (the project's own lesson from the Graphite reversal), and the review asks of each section which element leads, which follows, and what could be removed.
Audience: the owner and the agents building the site.

### The headline could sell anything, everything is a card, and the details stop at the screenshot
Finding: The Substack piece names five tells: a headline that could sell anything ("The future of productivity" against "Turn meeting notes into assigned tasks"), everything inside equally sized and equally loud cards, decoration that outruns the product with no useful screenshot, proof that is suspiciously perfect, and details that stop at the screenshot (buttons that go nowhere, a mobile menu that breaks, nothing explaining what happens while data loads); "no individual font or layout proves something was made with AI", the combination of generic choices and unfinished behaviour does.
Source: https://abhijayvuyyuru.substack.com/p/how-can-your-vibe-coded-website-not (Abhijay Arora Vuyyuru, 2026), evidence: opinion
For Stoker: Hero and the terminal - the lede names the task ("launch a coin priced in NVDAx"), evidence is a live row or the Ledger, and every interactive detail is finished before the look is judged: every button goes somewhere, every list has a loading and an empty state, the phone menu works at 390.
Audience: all.

### The research behind the tells: weak signifiers cost 22% more time, glass needs contrast, beauty hides only small faults
Finding: In an eyetracking study of nine sites in strong and weak-signifier versions, weak signifiers (ghost buttons, links styled as text) cost 22% more time and 25% more fixations; glassmorphism must still meet contrast, works better with more blur and should be reducible by the user; the aesthetic-usability effect makes people forgive minor usability problems on an attractive interface but not large ones.
Source: https://www.nngroup.com/articles/flat-ui-less-attention-cause-uncertainty/ (NN/g, Moran, 2017), https://www.nngroup.com/articles/glassmorphism/ (NN/g, Brown, 2024), https://www.nngroup.com/articles/aesthetic-usability-effect/ (NN/g, Moran, 2024), evidence: research
For Stoker: buttons and links - the primary action is a filled button with a visible edge, secondary actions are outlined, links are underlined or coloured in the accent with an underline on hover, and no interactive element is a bare word in the ink colour.
Audience: traders act fast and need the strong signifier.

### The tells checklist for Stoker
Answer yes to every line before a page is shown to the owner.
- Is there one spacing scale, and does every gap on the page come from it?
- Is there one radius per role (control, card, pill) and no other radius on the page?
- Is there no gradient, glow or blob behind any section, and is the heat ramp only on "You do.", the brand's figures and the curve?
- Is there no card inside a card, and no three-benefit card row?
- Is there at most one eyebrow or badge on the page?
- Does every icon share one size and one stroke within its context, with no icon larger than the text beside it?
- Is every heading under 600 weight and every body line at 400 or more?
- Is every text pair past both contrast rulers (AA and APCA Lc 60 for small text)?
- Does the hero show real product rows or a real screen, not an illustration?
- Does the headline or lede name the task in Stoker's own words (coin, pair, priced in, Stoke a coin)?
- Is every figure on the page one the Ledger or the chain can back?
- Is there no testimonial, star rating or follower count?
- Are there no emoji in headings and no em dashes anywhere?
- Does every button say what happens, and go somewhere?
- Does every button have a pressed, loading and disabled state?
- Does every data container have loading, empty, populated and error renderings?
- Does hover lift nothing more than 1 px and change weight on nothing?
- Is every animation on a token curve and under 200 ms, and does it stop under reduced motion?
- Do the socials, the terms and the contact link resolve?
- Does the page hold at 390 with no overflow and a working menu?
- Does the page have a title, description and share image of its own?

## 12. Design systems to learn from

### Coinbase: guide, empower, humanize, simplify, and never colour alone
Finding: Coinbase's design team works from four principles, "to guide, empower, humanize and simplify", because crypto needs "people who can make technical ideas accessible to all"; its product principles start with "build for everyone, from crypto beginners to experts" and "trusted and safe"; its accessibility work requires text, colour and icons together, keeps dense trading components within spacing and target standards, and notes that 24% of customers enlarge their text; the design system ships a colour pairing tool and a Numbers component category.
Source: https://www.figma.com/blog/coinbase-case-study (Figma, quoting Connie Yang), https://www.coinbase.com/blog/coinbases-product-principles (Coinbase, 2021), https://www.coinbase.com/blog/how-accessibility-drives-product-quality-at-Coinbase (Coinbase, 2025), https://cds.coinbase.com/ (Coinbase Design System), evidence: practice
The principle Stoker lacks: "guide" - the site explains Quote Assets, Graduation, Reward Launches and Copy Protection on /curated, /api and in ADRs, not at the point where a creator or trader meets the word.
For Stoker: coin page, launch flow and board - a one-line definition on first encounter (a hover or tap on "Graduation", "Quote Asset", "Reward Tax", "Curve") drawn from `CONTEXT.md`, and a number component that renders every figure the same way.
Audience: creators and marketers, who are newest to the mechanism.

### Vercel Geist: a grid, high contrast, one border per edge, a use for every style
Finding: Geist describes itself through "a high contrast, accessible color system", a grid that is "a huge part of the new Vercel aesthetic", a typeface "specifically designed for developers and designers", colour rules such as "draw each border once" and translucent shadows, ten colour scales with named jobs, and a type table where every style carries its use.
Source: https://vercel.com/geist/introduction, https://vercel.com/geist/colors, https://vercel.com/geist/text (Vercel Geist), evidence: practice
The principle Stoker lacks: a visible layout grid and the one-border rule; the terminal pages have hairlines where a card's edge meets a table's rule and no column grid that the Header, the board and the coin page share.
For Stoker: layout - a 12-column grid with a 24 px gutter at 1440 and a 4-column grid with a 16 px gutter at 390 that the Header's edges, the board's table and the coin page's panels all sit on, and a rule that an edge is drawn once.
Audience: all.

### Shopify Polaris: the empty state is one component, the four conditions are the page's job
Finding: Polaris' empty state owns its layout (heading, subheading, graphic, one primary and one secondary action) and the page decides between loading, empty, populated and error; the graphic is decorative and the empty state never renders during loading or error.
Source: https://shopify.dev/docs/apps/build/app-home/migrate-from-polaris-react/empty-state (Shopify Polaris), evidence: practice
The principle Stoker lacks: one empty-state component shared by every container, with the four conditions decided by the data hook.
For Stoker: `apps/web` - one `EmptyState` component (title, sentence, primary, secondary, the salamander at one size) and one data-state convention used by every list and panel.
Audience: all.

### Atlassian: four named elevations, lit from the front in dark, and three type principles
Finding: Atlassian's elevations are sunken, default, raised and overlay (plus one overflow), tokens carry them, raised and overlay keep shadows in dark where surfaces also lighten with height, and its typography follows three principles: optimise for readability, create visual harmony, and contextualise for different users, with tokens in rem.
Source: https://atlassian.design/foundations/elevation and https://atlassian.design/foundations/typography (Atlassian Design System), evidence: practice
The principle Stoker lacks: elevation as named tokens with a shadow rule per level; the brief lists surface steps but no component is bound to a level by name.
For Stoker: tokens - `elevation.sunken` (the asset rail's well, the curve's track), `elevation.default` (the page), `elevation.raised` (the trade panel, the launch summary, with the ambient shadow), `elevation.overlay` (menus, dialogs, the search results, with the strongest shadow), and every component declares one.
Audience: all.

### Material 3: roles in pairs, a type scale with roles, motion tokens, loading thresholds
Finding: Material 3's foundations tie colour roles to components with guaranteed pairs, give type five roles at three sizes, tokenise easing and duration (and now springs), and set loading thresholds of 200 ms and 5 s with one indicator per group.
Source: https://m3.material.io/styles/color/roles, https://m3.material.io/styles/typography/applying-type, https://m3.material.io/styles/motion/easing-and-duration/tokens-specs, https://m3.material.io/components/progress-indicators/guidelines (Material Design 3), evidence: practice
The principle Stoker lacks: tokenised motion and the "on" colour pairs; the site has colour and type tokens but no motion tokens and no partner for most fills.
For Stoker: `globals.css` - the `--ease-*` and `--dur-*` tokens and the `on-*` partners named in sections 7 and 9.
Audience: all.

### Radix Themes: five knobs decided once, and variants that mean importance
Finding: Radix Themes configures a whole theme with five settings (accent colour, gray colour, panel background, scaling, radius), its button variants (classic, solid, soft) "create visual hierarchies and communicate relative importance", and its colour scale gives each of twelve steps a job.
Source: https://www.radix-ui.com/themes/docs/overview/getting-started and https://www.radix-ui.com/themes/docs/theme/overview (Radix UI), evidence: practice
The principle Stoker lacks: one radius and one scaling decision made once and never varied, and a three-step button ladder (solid for the one primary action, soft for secondary, ghost for tertiary).
For Stoker: tokens and `button*` primitives - `--radius-control`, `--radius-card`, `--radius-pill` and nothing else, and three button variants with the solid one allowed once per view.
Audience: all.

### Uniswap: research and the action on one page, protection by default
Finding: Uniswap's Explore tab put price charts, transaction logs, token stats and pool data on the token and pool pages "so users never leave the page" to swap, buy, send or set a limit order; its swap work added sub-second quotes, fee-on-transfer detection with the fee shown, swap protection on by default, and "high-contrast colors with a legible typeface".
Source: https://blog.uniswap.org/data-and-insights and https://blog.uniswap.org/uniswap-swap-ux-improvements (Uniswap Labs), evidence: practice
The principle Stoker lacks: the action on the research pages; the asset page shows a Quote Asset's coins and chart but offers no "Stoke a coin paired with this asset", and the board's rows have no quick buy.
For Stoker: asset page and board - a primary "Stoke a coin paired with NVDAx" on every asset page that opens the launch form with the pair chosen, and a quick buy affordance on a CoinRow that opens the coin page with the trade panel focused.
Audience: creators (the pair-first path) and traders (one less click).

### Kraken: a trade station worth staring at, modular, and not overwhelming
Finding: Kraken Pro was rebuilt as "a hyper-modern, aesthetically-pleasing experience worthy of being your main trade station" with modules that rearrange, resize, stack and pop out; its 2026 app rebuild starts from the admission that platforms "hand you a set of powerful and complex financial tools and leave you to figure out how to use them", and aims to be "intuitive, not overwhelming", shaped around the user's goals.
Source: https://blog.kraken.com/product/bear-markets-are-for-building-introducing-krakens-new-and-improved-pro-trading-interface (Kraken, 2022) and https://blog.kraken.com/news/new-kraken-app-coming-soon (Kraken, 2026), evidence: practice
The principle Stoker lacks: a stated density stance per page and goal-led entry points; the landing is "spacious" and the terminal "denser" by decree, but no page says which goal it serves first.
For Stoker: Landing and coin page - the hero's two buttons are the two goals (trade, launch) and a third goal (promote: the share card, the API) lives one scroll down; the coin page is the trade station at terminal density with a fixed panel layout, and nothing on it is marketing.
Audience: traders (the station), creators (the launch), marketers (the share).

### Robinhood: design says who the product is for
Finding: Robinhood's design story holds that "design, beyond the words, communicates who a product is for", aims to be "friendly, inviting, not intimidating, not condescending", won an Apple Design Award for "clean, content-centric design, and beautiful typography", and later removed confetti.
Source: https://robinhood.com/us/en/newsroom/the-top-secret-robinhood-design-story (Robinhood), evidence: practice
The principle Stoker lacks: a written tone statement that the character, the heat and the copy answer to.
For Stoker: `docs/design/principles.md` - one paragraph of tone ("competent, warm, plain; the furnace is a workplace, not a casino"), no confetti or fireworks on a landed launch (a calm confirmation with the explorer link), and the salamander drawn working, not cheering.
Audience: all; the owner's "everyone should like our platform" is a tone decision.

## Principles for Stoker

1. Compose the first glance as one prototypical image with low complexity and a single accent, because the verdict is made in 50 ms ("The look is judged in 50 ms", "What exchanges actually put above the fold").
2. State what Stoker is, what a trade costs and what the Creator earns within ten seconds, above the fold, with live figures ("The first 10 seconds", "Credibility comes from four things", "What the reference heroes contain").
3. Make every claim verifiable and every link real: addresses, explorer links, a dated Ledger, no placeholders ("Stanford's ten credibility guidelines", "Social proof is shown behaviour").
4. Keep the global navigation visible and flat with four to six links, the mark top-left, one filled action at the far right and the active section marked ("Hiding the navigation halves its use", "What the reference navbars contain", "Mark the current section").
5. The sticky header is opaque, 56 to 64 px tall and does not move ("A sticky header must be small, opaque and still").
6. The hero is static and shows the product in real rows, never a carousel, a metaphor or three feature cards ("No carousel", "Show the product, not a metaphor").
7. Disclose fees, the Creator's share and the excluded regions beside the claim and again in the footer, opening with one plain risk sentence ("Kraken: a general disclaimer", "Robinhood: lead with the one-sentence risk statement").
8. Tables exist to compare: identifier first, numbers right-aligned in tabular figures, sticky headers, hairlines not stripes, bars not rings ("A table serves four tasks", "Numbers are right-aligned", "No zebra stripes", "Length and position are read preattentively").
9. Density is information per ink and per second: respond under 100 ms, skeleton past 200 ms, and remove every line that does not group ("Density is information per ink", "Hyperliquid's trade page").
10. Direction colours travel with a sign and an arrow, stay 30 degrees of hue from the accent, and have a blue-and-red alternative ("Red and green need a colour-vision alternative", "The accent must not be the up colour").
11. Forms are one column with labels above, validated when a field is left, errors beside the field with the fix, nothing promotional inside the transaction, and a review before signing ("Forms that follow the basics", "Validate on blur", "Labels above the field", "Ask one thing at a time").
12. Colour is scales and roles in pairs, generated from base, accent and contrast, checked by AA and APCA, with the dark ladder as ordered overlays ("Colour roles come in pairs", "A twelve-step scale", "Contrast is checked by two rulers", "Generate the themes", "Dark surfaces are dark grey").
13. Type is one role table with a usage column, no weight under 400, nothing under 12 px, a measure of 45 to 75 characters, and tabular figures wherever a number can change ("Body text on the web", "Five type roles", "No weight under 400", "Numbers get a face").
14. Motion is tokenised, ease-out, under 200 ms for interactions, origin-aware, absent from keyboard actions and live charts, and off under reduced motion ("Easing and duration are tokens", "Fast, ease-out, under 300 ms", "200 ms for interactions", "Motion from interaction must be disableable").
15. Every data container has four designed states, and the empty one is a positive title, a status sentence, one action and the character at a fixed size ("An empty container must say what happened", "Four parts, one call to action", "Decide loading, empty, populated and error outside the component").
16. Glass, glow and the heat ramp each appear in one place ("Glass, glow and gradients are rationed", "Fifteen signals").
17. One spacing scale, one radius per role, one border per edge, one icon size per context ("Five hundred sites", "Radix Themes: five knobs", "Vercel Geist").
18. Copy names the mechanism in Stoker's words and never the mood, and proof is a number the Ledger can back ("An agency's list of tells", "The headline could sell anything").
19. The site guides at the point of the concept and sounds competent and warm, never hype ("Coinbase: guide, empower, humanize, simplify", "Robinhood: design says who the product is for").
20. After launch, terminal changes ship in small steps judged by value, not first reaction ("Bloomberg: hide complexity, change incrementally").

## Audit checklist

Run on any page at 1440 and 390, light and dark; every answer should be yes.

First glance
- Flashed for a second, does the page read as a trading venue with one dominant element and one accent?
- Can a stranger say what Stoker is, what a trade costs and what a Creator earns without scrolling?
- Does the hero leave the next section visibly cut by the fold, with no full-width rule at the fold?
- Is every figure above the fold live, verifiable and dated?

Header
- Is the mark top-left and does it link home on every page?
- Are four to six links visible at 1300 px and above, with Explore first and Developers last?
- Is there exactly one filled button, at the far right, followed by the wallet control?
- Is the current section marked by more than a colour change?
- Is the header opaque (or 96% with no blur) on terminal pages, 56 to 64 px tall, and free of shrink or slide animation?
- Below 1300 px, do Explore and the launch button stay visible beside the menu control?
- Do the search field and the results open without hijacking the page, and does ⌘K open with no animation?

Landing
- Is the hero static, with one headline, one lede, two buttons at most and the product in real rows?
- Is there no carousel, no auto-rotation, no scroll-driven motion, no modal on arrival?
- Does each section have one dominant element and no three-card benefit row?
- Does every section heading carry its meaning in the first two words?
- Is social proof a count or a real coin, never a quote or a star rating?

Footer
- Does the fat footer carry the six sections as a doormat, Terms, Privacy, the contact address, the socials, the on-chain addresses and the indexer status?
- Does the disclaimer open with one bold risk sentence and name the excluded regions?
- Does every claim that needs a qualifier have a one-line note directly under it?
- Do terminal pages use the one-line footer?
- Does every footer link resolve?

Tables and figures
- Is the first column the coin's identity and the column order by importance?
- Is every number right-aligned, tabular, one precision per column, with the unit in the header?
- Do headers stick under the site header with the right offset?
- Are rows separated by hairlines with a hover tint, never stripes?
- Is curve progress a bar, and is no quantity a ring, gauge or pie?
- Does every change carry a sign and an arrow, and do up and down differ in lightness as well as hue?
- Do sort and filter respond in under 100 ms?

Forms and transactions
- Is the form one column with labels above every field and no placeholder used as a label?
- Are required fields marked, formats explained, and is there no clear or reset control?
- Does validation run when a field is left, clear on fix, and show a summary on submit that links to the fields?
- Is the one emphasised figure in the trade panel what the trader receives at the slippage limit?
- Is there nothing promotional inside the trade panel or the launch form?
- Does the signing step look different from everything else on the page and say who holds the funds?
- After signing, is there a step status with elapsed time and an explorer link?
- Does the submit button disable on send and show "Sending…"?

Colour
- Does every fill used under text have an "on" partner, and does the contrast script check the pair?
- Does every small-text pair pass AA and APCA Lc 60, and body text Lc 75, in both schemes?
- Is the dark ladder ordered from the canvas upward, with a shadow on overlays?
- Are the accent and the up colour at least 30 degrees of hue apart?
- Is the glow only on the primary button and the focus ring?
- Is the heat ramp only on "You do.", the brand's figures and the curve?
- Is there no gradient background and no coloured one-sided border?

Type
- Does every text style come from the role table, with no ad hoc size?
- Is nothing under 12 px on desktop or 13 px on a phone, and nothing lighter than 400?
- Are ledes 45 to 75 characters wide?
- Does nothing change weight on hover or selection?
- Are ellipses, quotes and non-breaking spaces the real characters, and headings balanced?

Motion
- Does every transition use a token curve and duration, with interactions at 200 ms or less?
- Does nothing animate on a keyboard action, a theme switch, a chart or a table row?
- Do popovers open from their trigger at scale 0.96 or more?
- Does `prefers-reduced-motion` stop every animation except short fades, and do loops pause offscreen?
- Is `transition: all` absent from the stylesheet?

States
- Does every data container render loading, empty, populated and error states, and never the empty one while loading?
- Do skeletons match the row geometry, appear only after 200 ms, and use one spinner everywhere?
- Is each empty state a positive title, one status sentence, one primary action and the character at one size?
- Does an error keep the last good data on screen with its time and a retry?
- Does the 404 offer search, Explore and home?

The tells
- Does the page pass every line of "The tells checklist for Stoker" in section 11?
