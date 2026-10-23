export type ConfidenceLabel = "high" | "medium" | "low";
export type LeadFeedbackValue =
  | "interested"
  | "not_relevant"
  | "too_weak"
  | "already_known";

export type ApiProvider =
  | "hacker_news"
  | "dev_to"
  | "newsdata"
  | "the_news_api"
  | "gdelt"
  | "newsapi"
  | "gnews"
  | "mediastack";

export type SourceStatus = "ready" | "needs_key" | "disabled";
export type RawItemProcessingStatus =
  | "awaiting_enrichment"
  | "enriched"
  | "awaiting_curation"
  | "processed"
  | "failed";
export type ProcessingStage =
  | "api_collection"
  | "gmail_sync"
  | "newsletter_segmentation"
  | "source_enrichment"
  | "codex_curation"
  | "editorial_generation"
  | "complete";

export type Source = {
  id: string;
  type: "manual_url" | "newsletter" | "api";
  provider?: ApiProvider;
  name: string;
  trustLevel: "high" | "medium" | "low";
  enabled: boolean;
  status?: SourceStatus;
};

export type NormalizedSourceItem = {
  provider: ApiProvider;
  sourceUrl: string;
  title: string;
  publisher: string;
  author?: string;
  publishedAt?: string;
  shortExcerpt: string;
  language: string;
};

export type RawItem = {
  id: string;
  sourceId: string;
  sourceUrl: string;
  title: string;
  publisher: string;
  publishedAt?: string;
  fetchedAt: string;
  shortExcerpt: string;
  extractedClaims: string[];
  fingerprint: string;
  language: string;
  processingStatus: RawItemProcessingStatus;
  failureReason?: string;
};

export type StoryCluster = {
  id: string;
  canonicalRawItemId: string;
  title: string;
  clusterSummary: string;
  topicTags: string[];
  confidenceLabel: ConfidenceLabel;
  status: "candidate" | "lead" | "rejected";
};

export type ContentLead = {
  id: string;
  storyClusterId: string;
  title: string;
  sourceUrl: string;
  leadBriefTh: string;
  confidenceLabel: ConfidenceLabel;
  scores: {
    audienceFit: number;
    contentPotential: number;
    novelty: number;
    practicalValue: number;
    confidence: number;
    ranking: number;
  };
  whyItMattersTh: string;
  verifyNextTh: string;
  createdAt: string;
  feedback?: LeadFeedbackValue;
  expansion?: ContentExpansion;
};

export type RejectedItem = {
  id: string;
  storyClusterId: string;
  title: string;
  sourceUrl: string;
  rejectionReason: string;
  rejectedAt: string;
};

export type ContentExpansion = {
  id: string;
  contentLeadId: string;
  summaryTh: string;
  keyFacts: string[];
  sourceContext: string;
  suggestedAnglesTh: string[];
  possibleHooksTh: string[];
  cautionsTh: string;
  recommendedFormat: string;
  createdAt: string;
};

export type EditorialPreference = {
  id: string;
  preferenceType: string;
  description: string;
  evidenceCount: number;
  lastSeenAt: string;
};

export type ReferenceLibraryItem = {
  id: string;
  sourceName: string;
  sourceUrl: string;
  kind: "page_profile" | "public_post_sample";
  title: string;
  summaryTh: string;
  observedSignals: string[];
  usageGuidanceTh: string[];
  capturedAt: string;
};

export type EditorialPlaybook = {
  id: string;
  sourceName: string;
  sampleCount: number;
  selectionSignals: string[];
  usefulAngles: string[];
  audienceAssumptions: string[];
  guardrails: string[];
  updatedAt: string;
};

export type ProcessingRun = {
  id: string;
  runDate: string;
  trigger: "manual" | "scheduled";
  status: "running" | "succeeded" | "failed";
  stage: ProcessingStage;
  partial: boolean;
  progress: Record<string, number>;
  summary: Record<string, unknown>;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
};

export type WorkerHeartbeat = {
  workerId: string;
  status: string;
  capabilities: string[];
  lastSeenAt: string;
};

export type DailyBoardStatus = "pending" | "partial" | "ready";

export type DailyEditorialBoardItem = {
  id: string;
  contentLeadId: string;
  position: number;
  title: string;
  summaryTh: string;
  sourceName: string;
  sourceUrl: string;
  publishedAt?: string;
  confidenceLabel: ConfidenceLabel;
};

export type DailyEditorialBoard = {
  id: string;
  boardDate: string;
  timezone: "Asia/Bangkok";
  status: DailyBoardStatus;
  expectedCount: number;
  generatedCount: number;
  generatedAt?: string;
  updatedAt: string;
  items: DailyEditorialBoardItem[];
};

export type DashboardState = {
  dailyBoards: DailyEditorialBoard[];
  leads: ContentLead[];
  rejected: RejectedItem[];
  sources: Source[];
  editorialPreferences: EditorialPreference[];
  referenceLibrary: ReferenceLibraryItem[];
  editorialPlaybooks: EditorialPlaybook[];
  processingRuns: ProcessingRun[];
  workerHeartbeat?: WorkerHeartbeat;
};
