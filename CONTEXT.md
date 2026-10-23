# AI News Curation

This context defines the language for an AI-assisted system that collects, filters, and summarizes timely news updates and instructional content for a specific reader.

## Language

**Content Update**:
A selected item worth presenting to the reader because it is timely, relevant, or useful for learning. It may be breaking news, analysis, or how-to content.
_Avoid_: News, article, post

**Raw Item**:
An unfiltered item collected from an approved source before AI evaluation. It may later become a content lead or enter the rejected queue.
_Avoid_: Content lead, article, post

**Awaiting Enrichment**:
A Raw Item accepted into the pipeline but not yet supported by a completed or exhausted Source Enrichment attempt. It cannot become a Content Lead from URL metadata alone.
_Avoid_: Pending lead, queued article

**Intake Mode**:
The reader-selected purpose for uploaded material, either reference material for future comparison or a candidate item for immediate lead evaluation.
_Avoid_: Upload type, file category

**Manual URL Intake**:
An ingestion path where the reader submits a source URL directly for the system to evaluate.
_Avoid_: Bookmark, saved link

**Newsletter Intake**:
An ingestion path where subscribed email content is collected and evaluated as source material.
_Avoid_: Email scraping, inbox sync

**Dedicated Intake Mailbox**:
A mailbox created solely to receive source material for Newsletter Intake, with no expected personal correspondence. Its messages are eligible for collection except account-security, delivery-system, and subscription-administration messages.
_Avoid_: Personal inbox, shared mailbox

**Newsletter Message**:
A message from the Dedicated Intake Mailbox that contains editorial source material, including substantive welcome editions. Account-security alerts, one-time codes, password resets, delivery failures, and administrative confirmations without useful content are not Newsletter Messages.
_Avoid_: Email, inbox item

**Newsletter Edition**:
The preserved source context of one Newsletter Message. An edition may contain one long-form story or multiple Newsletter Stories, but it is not itself ranked as a single content update when its stories can be separated.
_Avoid_: Raw item, digest lead

**Newsletter Story**:
A distinct editorial story extracted from a Newsletter Edition and evaluated as its own Raw Item while retaining attribution to the originating edition.
_Avoid_: Email section, newsletter issue

**Story Cluster**:
A group of raw items that refer to the same underlying update or instructional topic. A story cluster may become one content lead instead of producing duplicate leads.
_Avoid_: Duplicate group, thread

**How-to Content**:
Instructional content that teaches the reader how to do, understand, or apply something. Its value comes from practical usefulness, not from being newly published.
_Avoid_: Tutorial, guide

**Content Lead**:
A content update that has passed AI filtering and is worth the reader's attention as source material for possible Facebook Page content. It is not a finished post.
_Avoid_: Final post, published content

**Awaiting Curation**:
A Raw Item whose Source Enrichment is sufficiently complete but whose AI filtering batch has not succeeded. It is neither a Content Lead nor a rejected item and cannot enter the Daily Editorial Board until curation succeeds.
_Avoid_: Pending lead, low-confidence lead

**Lead Brief**:
A short presentation of a content lead designed for fast scanning and deciding whether to read further.
_Avoid_: Summary, report

**Curation Dashboard**:
The primary interface where the reader reviews lead briefs, gives lead feedback, opens content expansions, and audits the rejected queue.
_Avoid_: Chatbot, digest

**Confidence Label**:
A visible trust indicator on a content lead that shows how strongly the source material supports using it as a factual basis.
_Avoid_: Accuracy score, truth score

**Content Expansion**:
A deeper treatment of a selected content lead that may include a fuller summary, source context, post angles, hooks, and cautions.
_Avoid_: Draft post, final post

**Thai Editorial Output**:
Reader-facing lead briefs and content expansions written primarily in Thai, while preserving English names for tools, models, products, and features when needed for accuracy.
_Avoid_: Translation, localized copy

**Lead Feedback**:
The reader's lightweight response to a lead brief, used to improve future filtering. The core responses are interested, not relevant, too weak, and already known.
_Avoid_: Rating, review

**Lead Score**:
An explainable multi-dimensional evaluation of a story cluster or content lead, including audience fit, content potential, novelty, practical value, and confidence.
_Avoid_: Relevance score, ranking score

**Content Conversion**:
The outcome where a content lead becomes a usable Facebook Page idea or published content direction. The first MVP target is at least five usable content ideas per week.
_Avoid_: Engagement, click-through

**Rejected Queue**:
Content updates that the AI filtered out, kept with a short rejection reason so the reader can audit and improve future filtering.
_Avoid_: Trash, ignored items

**Tracked Source Account**:
A whitelisted social account monitored because the reader explicitly trusts or values updates from it, such as an official product or company account.
_Avoid_: Scraped account, followed account

**Source Snapshot**:
A limited stored representation of source material, containing metadata, links, short excerpts, extracted claims, fingerprints, and processing notes rather than a full copyrighted archive by default.
_Avoid_: Full archive, scraped copy

**Source Enrichment**:
The bounded attempt to resolve a Raw Item to its primary source, extract sufficient main-text evidence and claims, and record limitations before scoring or summarization. Failure to enrich does not discard the Raw Item but lowers the evidence available for confidence.
_Avoid_: Full-page scraping, article download

**Scheduled Orchestration**:
A coordination model where raw items can be collected continuously, but AI filtering and ranking happen in controlled review cycles.
_Avoid_: Real-time agent, autonomous agent loop

**Collection Run**:
A user-triggered or scheduled cycle that requests content updates from every enabled source, skips unavailable sources without stopping the cycle, and sends normalized raw items into deduplication and evaluation.
_Avoid_: Scrape all, refresh button, agent loop

**Run Summary**:
The reader-visible outcome of a collection run, including its completion time, fetched items, new content leads, rejected items, duplicates, and source-specific failures.
_Avoid_: Console output, debug log

**Daily Editorial Board**:
A date-based briefing containing the ten highest-priority content leads for that day. Reference Library signals and Editorial Memory guide selection and ranking, while factual claims remain grounded in the current source material. Each entry gives a self-contained Thai overview that explains what happened and why it matters, so the reader can decide what deserves further reading without opening every source. A calendar date has one board that is refreshed by later collection runs, and boards remain available for thirty days.
_Avoid_: Run summary, full article list, finished content calendar

**Partial Editorial Board**:
A Daily Editorial Board produced after its enrichment window closes while one or more applicable sources still lack sufficient evidence because extraction failed or timed out. It may contain fewer items and must preserve uncertainty rather than delay the entire briefing indefinitely.
_Avoid_: Failed board, incomplete draft

**Capability Worker**:
A bounded worker responsible for one system capability, such as ingestion, clustering, scoring, expansion, or editorial memory updates.
_Avoid_: Sub-agent, autonomous agent

**Editorial Memory**:
Knowledge about the reader's editorial taste, page positioning, preferred angles, and content selection patterns. It guides filtering and framing.
_Avoid_: Knowledge base, training data

**Editorial Preference**:
A learned preference derived from lead feedback, such as favored topics, sources, angles, rejection patterns, or signs that a topic is already known.
_Avoid_: Model training, fine-tuning

**Target Audience**:
People interested in AI who want to apply it in practical work, content creation, automation, or small business contexts.
_Avoid_: Followers, readers, general audience

**Editorial Scope**:
The topic boundary for content leads, centered on AI product updates, practical AI how-to content, agents, automation, creator tools, business use cases, and changes that affect real users.
_Avoid_: Topic list, niche

**Editorial Guardrails**:
Rules that prevent content leads and expansions from overstating, fabricating, or misrepresenting source material. They require source attribution and clear uncertainty when evidence is incomplete.
_Avoid_: Safety rules, moderation

**Reference Library**:
Stored source material used to compare, enrich, or verify a content update against prior knowledge. It is not the single source of truth for current events.
_Avoid_: Knowledge base, training data

**Editorial Playbook**:
A synthesis of recurring selection signals, useful angles, audience assumptions, and guardrails derived from attributed Reference Library samples. It guides curation without copying a source's wording or serving as evidence for current-event claims.
_Avoid_: Style clone, training prompt

**System of Record**:
The authoritative store for raw items, story clusters, content leads, rejected items, feedback, editorial memory, source metadata, and processing status.
_Avoid_: Spreadsheet, workspace

**Video Evidence Pack**:
A structured representation of a video that includes transcript or subtitles, timestamps, extracted claims, summary, references, and known limitations.
_Avoid_: Video summary, transcript
