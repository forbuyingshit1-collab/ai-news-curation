import "server-only";

import { API_SOURCE_DEFINITIONS, getApiSourceStatus } from "@/lib/api-sources";
import type {
  ConfidenceLabel,
  ContentExpansion,
  ContentLead,
  DashboardState,
  EditorialPreference,
  LeadFeedbackValue,
  NormalizedSourceItem,
  RawItem,
  ReferenceLibraryItem,
  RejectedItem,
  Source,
  StoryCluster
} from "@/lib/types";

export type Store = {
  sources: Source[];
  rawItems: RawItem[];
  storyClusters: StoryCluster[];
  leads: ContentLead[];
  rejected: RejectedItem[];
  editorialPreferences: EditorialPreference[];
  referenceLibrary: ReferenceLibraryItem[];
};

const globalStore = globalThis as typeof globalThis & {
  aiNewsCurationStore?: Store;
};

function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function now() {
  return new Date().toISOString();
}

function fingerprint(input: string) {
  return input
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[?#].*$/, "")
    .replace(/\/$/, "");
}

function publisherFromUrl(url: string) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host;
  } catch {
    return "unknown source";
  }
}

function titleFromUrl(url: string) {
  const parsed = new URL(url);
  const path = parsed.pathname
    .split("/")
    .filter(Boolean)
    .slice(-2)
    .join(" ")
    .replace(/[-_]/g, " ");

  return path ? `${publisherFromUrl(url)}: ${path}` : publisherFromUrl(url);
}

function scoreUrl(url: string) {
  const lower = url.toLowerCase();
  const officialSignals = ["openai", "anthropic", "claude", "google", "deepmind", "microsoft"];
  const howToSignals = ["how-to", "guide", "tutorial", "docs", "learn", "cookbook"];
  const aiSignals = ["ai", "openai", "claude", "agent", "automation", "model", "prompt"];

  const official = officialSignals.some((signal) => lower.includes(signal));
  const howTo = howToSignals.some((signal) => lower.includes(signal));
  const inScope = aiSignals.some((signal) => lower.includes(signal));

  const audienceFit = inScope ? 82 : 45;
  const contentPotential = official || howTo ? 78 : 56;
  const novelty = official ? 74 : 60;
  const practicalValue = howTo ? 86 : inScope ? 72 : 45;
  const confidence = official ? 86 : 62;
  const ranking = Math.round(
    audienceFit * 0.25 +
      contentPotential * 0.25 +
      novelty * 0.15 +
      practicalValue * 0.2 +
      confidence * 0.15
  );

  return {
    scores: {
      audienceFit,
      contentPotential,
      novelty,
      practicalValue,
      confidence,
      ranking
    },
    confidenceLabel: (confidence >= 80 ? "high" : confidence >= 60 ? "medium" : "low") as ConfidenceLabel,
    shouldReject: !inScope && ranking < 55,
    rejectionReason: inScope ? "" : "ไม่เข้า Editorial Scope เริ่มต้นของเพจ AI/how-to/automation"
  };
}

export function createSeedStore(): Store {
  const source: Source = {
    id: "src_manual",
    type: "manual_url",
    name: "Manual URL Intake",
    trustLevel: "medium",
    enabled: true
  };

  const lead: ContentLead = {
    id: "lead_demo_openai_agents",
    storyClusterId: "cluster_demo_openai_agents",
    title: "OpenAI agents update",
    sourceUrl: "https://openai.com/index/new-tools-for-building-agents/",
    leadBriefTh:
      "OpenAI อัปเดตเครื่องมือสำหรับการสร้าง agents ซึ่งเป็นวัตถุดิบที่เหมาะกับเพจสาย AI practical เพราะโยงได้ทั้ง workflow, automation และ use case สำหรับคนทำงานจริง",
    confidenceLabel: "high",
    scores: {
      audienceFit: 88,
      contentPotential: 84,
      novelty: 72,
      practicalValue: 86,
      confidence: 90,
      ranking: 84
    },
    whyItMattersTh:
      "กลุ่มผู้อ่านที่ใช้ AI ทำงานและทำคอนเทนต์จะได้เห็นทิศทางว่า agent tools เริ่มพร้อมใช้งานจริงมากขึ้นตรงไหน",
    verifyNextTh: "ตรวจวันที่ประกาศ รายละเอียด feature และข้อจำกัดก่อนนำไปทำโพสต์",
    createdAt: now()
  };

  return {
    sources: [source, ...API_SOURCE_DEFINITIONS],
    rawItems: [],
    storyClusters: [],
    leads: [lead],
    rejected: [
      {
        id: "rej_demo_generic",
        storyClusterId: "cluster_demo_generic",
        title: "Generic AI opinion thread",
        sourceUrl: "https://example.com/opinion",
        rejectionReason: "ประเด็นยัง Too Weak และไม่มี source หลักให้ตรวจต่อ",
        rejectedAt: now()
      }
    ],
    editorialPreferences: [
      {
        id: "pref_practical_ai",
        preferenceType: "angle",
        description: "ให้ค่าน้ำหนักสูงกับมุมเอา AI ไปใช้ทำงานจริงมากกว่าข่าวกว้าง ๆ",
        evidenceCount: 1,
        lastSeenAt: now()
      }
    ],
    referenceLibrary: [
      {
        id: "ref_sanookai_profile",
        sourceName: "SanookAi",
        sourceUrl: "https://www.facebook.com/sanookai?locale=th_TH",
        kind: "page_profile",
        title: "Positioning: AI แบบเข้าใจง่ายและนำไปใช้หาเงินได้จริง",
        summaryTh:
          "เพจวางตัวเป็นผู้สอน AI แบบเข้าใจง่าย เน้นผลลัพธ์เชิงปฏิบัติและ use case ที่เชื่อมกับการทำงานหรือการสร้างรายได้",
        observedSignals: [
          "ภาษาไทยแบบตรงไปตรงมา",
          "เน้น practical outcome",
          "อธิบายเครื่องมือ AI ให้คนเริ่มต้นตามได้",
          "ใช้ hook จากข่าวหรือการเปลี่ยนแปลงของเครื่องมือ"
        ],
        usageGuidanceTh: [
          "ใช้เป็นสัญญาณว่าควรให้คะแนน how-to และ use case สูงขึ้น",
          "สรุปให้คนทั่วไปเข้าใจได้โดยไม่ลดทอนข้อจำกัดของเครื่องมือ",
          "ห้ามคัดลอกถ้อยคำหรือโครงสร้างโพสต์ต้นฉบับ"
        ],
        capturedAt: now()
      },
      {
        id: "ref_sanookai_post",
        sourceName: "SanookAi",
        sourceUrl: "https://www.facebook.com/sanookai?locale=th_TH",
        kind: "public_post_sample",
        title: "ตัวอย่างมุมเล่า: ข่าว AI Agent ที่ชวนให้หยุดอ่าน",
        summaryTh:
          "โพสต์สาธารณะล่าสุดใช้ประเด็นการเปลี่ยนแปลงของ OpenAI AI Agent เป็น hook สั้น ๆ แล้วชวนให้ผู้อ่านอ่านรายละเอียดต่อ",
        observedSignals: [
          "เปิดด้วยประโยคสั้นที่สร้างความสงสัย",
          "เกาะข่าว product update ที่คนทำงาน AI สนใจ",
          "เหมาะกับโพสต์สั้นที่ต่อยอดเป็น explainer ได้"
        ],
        usageGuidanceTh: [
          "ให้ระบบมองหา update ที่มีผลต่อ workflow จริง",
          "เสนอ hook ใหม่จากข้อเท็จจริง ไม่สร้างความตื่นตระหนกเกินต้นทาง"
        ],
        capturedAt: now()
      },
      {
        id: "ref_peesamac_profile",
        sourceName: "AI กับ Peesamac",
        sourceUrl: "https://www.facebook.com/peesamac?locale=th_TH",
        kind: "page_profile",
        title: "Positioning: คัดไอเดีย เครื่องมือ และ AI พร้อมแนวคิดเบื้องหลัง",
        summaryTh:
          "เพจเน้นคัดเลือกเครื่องมือและไอเดีย AI พร้อมอธิบายเหตุผลหรือแนวคิดเบื้องหลัง โดยต้องใช้งานได้จริงและมีมุมที่น่าสนใจ",
        observedSignals: [
          "มี curator point of view ชัดเจน",
          "สนใจทั้งตัวเครื่องมือและเหตุผลเบื้องหลัง",
          "ใช้ภาษาคุยกับคนอ่านแบบ personal",
          "ให้ความสำคัญกับประสบการณ์ใช้งานจริง"
        ],
        usageGuidanceTh: [
          "เพิ่มน้ำหนักให้ข่าวที่มี insight มากกว่าการประกาศ feature อย่างเดียว",
          "เมื่อขยาย lead ควรเสนอ why it matters และข้อจำกัดควบคู่กัน",
          "ห้ามเลียนแบบ persona หรือคัดลอกสำนวนเฉพาะบุคคล"
        ],
        capturedAt: now()
      },
      {
        id: "ref_peesamac_post",
        sourceName: "AI กับ Peesamac",
        sourceUrl: "https://www.facebook.com/peesamac?locale=th_TH",
        kind: "public_post_sample",
        title: "ตัวอย่างมุมเล่า: โมเดลเสียงและตัวเลข latency",
        summaryTh:
          "โพสต์สาธารณะล่าสุดพูดถึง Grok Voice Think Fast 2.0 โดยเลือกชูประเด็นเวลารอก่อนตอบและประสบการณ์การใช้งาน มากกว่าพูดเพียงคะแนนความฉลาด",
        observedSignals: [
          "เลือก metric ที่กระทบประสบการณ์ผู้ใช้",
          "เปรียบเทียบ feature กับความรู้สึกตอนใช้งานจริง",
          "มีความเห็นเชิงวิเคราะห์ประกอบข่าว"
        ],
        usageGuidanceTh: [
          "จัดอันดับข่าวที่มี metric หรือ trade-off ชัดเจนสูงขึ้น",
          "ชวนเปรียบเทียบกับ workflow เดิมโดยไม่สรุปเกินข้อมูลต้นทาง"
        ],
        capturedAt: now()
      }
    ]
  };
}

function store() {
  globalStore.aiNewsCurationStore ??= createSeedStore();
  globalStore.aiNewsCurationStore.referenceLibrary ??= createSeedStore().referenceLibrary;
  return globalStore.aiNewsCurationStore;
}

export function replaceStore(nextStore: Store) {
  globalStore.aiNewsCurationStore = structuredClone(nextStore);
}

export function snapshotStore() {
  return structuredClone(store());
}

export function getDashboardState(): DashboardState {
  const current = store();
  return {
    dailyBoards: [],
    leads: [...current.leads].sort((a, b) => b.scores.ranking - a.scores.ranking),
    rejected: [...current.rejected].sort((a, b) => b.rejectedAt.localeCompare(a.rejectedAt)),
    sources: current.sources.map((source) => {
      if (!source.provider) return source;
      return getApiSourceStatus().find((item) => item.provider === source.provider) ?? source;
    }),
    editorialPreferences: current.editorialPreferences,
    referenceLibrary: current.referenceLibrary,
    editorialPlaybooks: [],
    processingRuns: []
  };
}

export function getReferenceLibrary() {
  return store().referenceLibrary;
}

function apiSourceId(provider: NormalizedSourceItem["provider"]) {
  return `src_api_${provider}`;
}

function ingestNormalizedItem(item: NormalizedSourceItem, source: Source) {
  const current = store();
  const itemFingerprint = fingerprint(item.sourceUrl);

  if (
    current.rawItems.some((rawItem) => rawItem.fingerprint === itemFingerprint) ||
    current.leads.some((lead) => fingerprint(lead.sourceUrl) === itemFingerprint) ||
    current.rejected.some((rejected) => fingerprint(rejected.sourceUrl) === itemFingerprint)
  ) {
    return { status: "duplicate" as const };
  }

  const score = scoreUrl(`${item.sourceUrl} ${item.title} ${item.shortExcerpt}`);
  const rawItem: RawItem = {
    id: id("raw"),
    sourceId: source.id,
    sourceUrl: item.sourceUrl,
    title: item.title,
    publisher: item.publisher,
    publishedAt: item.publishedAt,
    fetchedAt: now(),
    shortExcerpt: item.shortExcerpt,
    extractedClaims: [item.title],
    fingerprint: itemFingerprint,
    language: item.language,
    processingStatus: "processed"
  };
  const cluster: StoryCluster = {
    id: id("cluster"),
    canonicalRawItemId: rawItem.id,
    title: item.title,
    clusterSummary: item.shortExcerpt || `Initial story cluster from ${item.publisher}.`,
    topicTags: [item.provider, "api-ingestion"],
    confidenceLabel: score.confidenceLabel,
    status: score.shouldReject ? "rejected" : "lead"
  };

  current.rawItems.push(rawItem);
  current.storyClusters.push(cluster);

  if (score.shouldReject) {
    const rejected: RejectedItem = {
      id: id("rejected"),
      storyClusterId: cluster.id,
      title: item.title,
      sourceUrl: item.sourceUrl,
      rejectionReason: score.rejectionReason,
      rejectedAt: now()
    };
    current.rejected.unshift(rejected);
    return { status: "rejected" as const, rejected };
  }

  const lead: ContentLead = {
    id: id("lead"),
    storyClusterId: cluster.id,
    title: item.title,
    sourceUrl: item.sourceUrl,
    leadBriefTh: `${item.title} มาจาก ${item.publisher} และผ่านการคัดกรองรอบแรกในขอบเขต AI/how-to/automation ระบบยังไม่เขียนโพสต์อัตโนมัติ แต่จัดไว้ให้เปิดอ่านและตรวจต้นทางต่อ`,
    confidenceLabel: score.confidenceLabel,
    scores: score.scores,
    whyItMattersTh:
      "มีโอกาสต่อยอดเป็นคอนเทนต์สำหรับ Facebook Page ได้ หากตรวจสอบข้อเท็จจริงและหา practical angle ที่ชัดเจนจากต้นทาง",
    verifyNextTh:
      score.confidenceLabel === "high"
        ? "ตรวจรายละเอียดจากต้นทางและวันที่เผยแพร่ก่อนนำไปต่อยอด"
        : "เปิดต้นทางตรวจ claim หลัก วันที่เผยแพร่ และบริบทก่อนใช้เป็นข้อเท็จจริง",
    createdAt: now()
  };
  current.leads.unshift(lead);
  return { status: "created" as const, lead };
}

export function ingestApiItems(provider: NormalizedSourceItem["provider"], items: NormalizedSourceItem[]) {
  const source = store().sources.find((item) => item.id === apiSourceId(provider));
  if (!source) return { created: 0, rejected: 0, duplicates: 0, error: "API source is not configured" };

  const results = items.map((item) => ingestNormalizedItem(item, source));
  return {
    created: results.filter((result) => result.status === "created").length,
    rejected: results.filter((result) => result.status === "rejected").length,
    duplicates: results.filter((result) => result.status === "duplicate").length
  };
}

export function getLead(id: string) {
  return store().leads.find((lead) => lead.id === id);
}

export function submitManualUrl(url: string) {
  const parsed = new URL(url);
  const current = store();
  const source = current.sources.find((item) => item.type === "manual_url") ?? current.sources[0];
  const itemFingerprint = fingerprint(parsed.toString());
  const existingLead = current.leads.find((lead) => fingerprint(lead.sourceUrl) === itemFingerprint);
  const existingRejected = current.rejected.find((item) => fingerprint(item.sourceUrl) === itemFingerprint);

  if (existingLead) {
    return { status: "duplicate", lead: existingLead };
  }

  if (existingRejected) {
    return { status: "duplicate_rejected", rejected: existingRejected };
  }

  const title = titleFromUrl(parsed.toString());
  const publisher = publisherFromUrl(parsed.toString());
  const score = scoreUrl(parsed.toString());

  const rawItem: RawItem = {
    id: id("raw"),
    sourceId: source.id,
    sourceUrl: parsed.toString(),
    title,
    publisher,
    fetchedAt: now(),
    shortExcerpt: `Submitted URL from ${publisher}. Full extraction is deferred until the source snapshot worker is connected.`,
    extractedClaims: ["Manual URL submitted for curation review."],
    fingerprint: itemFingerprint,
    language: "unknown",
    processingStatus: "processed"
  };

  const cluster: StoryCluster = {
    id: id("cluster"),
    canonicalRawItemId: rawItem.id,
    title,
    clusterSummary: `Initial story cluster for ${publisher}.`,
    topicTags: ["manual-url"],
    confidenceLabel: score.confidenceLabel,
    status: score.shouldReject ? "rejected" : "lead"
  };

  current.rawItems.push(rawItem);
  current.storyClusters.push(cluster);

  if (score.shouldReject) {
    const rejected: RejectedItem = {
      id: id("rejected"),
      storyClusterId: cluster.id,
      title,
      sourceUrl: parsed.toString(),
      rejectionReason: score.rejectionReason,
      rejectedAt: now()
    };
    current.rejected.unshift(rejected);
    return { status: "rejected", rejected };
  }

  const lead: ContentLead = {
    id: id("lead"),
    storyClusterId: cluster.id,
    title,
    sourceUrl: parsed.toString(),
    leadBriefTh: `${title} ถูกเพิ่มเป็น Content Lead จาก Manual URL Intake ระบบยังไม่ได้ดึงบทความเต็ม จึงใช้ URL metadata และ editorial scope เพื่อคัดรอบแรก`,
    confidenceLabel: score.confidenceLabel,
    scores: score.scores,
    whyItMattersTh:
      "เหมาะสำหรับตรวจต่อว่าเรื่องนี้มีมุม practical AI, how-to, automation หรือ product update ที่ใช้ต่อยอดเป็นโพสต์เพจได้หรือไม่",
    verifyNextTh:
      score.confidenceLabel === "high"
        ? "ตรวจรายละเอียดต้นทางก่อนนำไปต่อยอด"
        : "ต้องเปิด source ตรวจ claim หลัก วันที่เผยแพร่ และบริบทก่อนใช้เป็นข้อเท็จจริง",
    createdAt: now()
  };

  current.leads.unshift(lead);
  return { status: "created", lead };
}

export function recordLeadFeedback(leadId: string, feedback: LeadFeedbackValue, note?: string) {
  const current = store();
  const lead = current.leads.find((item) => item.id === leadId);

  if (!lead) {
    return null;
  }

  lead.feedback = feedback;

  if (feedback === "interested") {
    current.editorialPreferences.unshift({
      id: id("pref"),
      preferenceType: "interest_signal",
      description: `Interested in source/topic: ${lead.title}`,
      evidenceCount: 1,
      lastSeenAt: now()
    });
  }

  if (note) {
    current.editorialPreferences.unshift({
      id: id("pref"),
      preferenceType: "note",
      description: note,
      evidenceCount: 1,
      lastSeenAt: now()
    });
  }

  return lead;
}

export function expandLead(leadId: string): ContentExpansion | null {
  const lead = getLead(leadId);

  if (!lead) {
    return null;
  }

  if (lead.expansion) {
    return lead.expansion;
  }

  const expansion: ContentExpansion = {
    id: id("expansion"),
    contentLeadId: lead.id,
    summaryTh: `${lead.title} เป็น lead ที่ควรเปิดอ่านต้นทางต่อเพื่อดูว่ามีประเด็นใหม่หรือ how-to ที่เหมาะกับกลุ่มผู้อ่านสาย AI practical หรือไม่`,
    keyFacts: [
      `Source: ${lead.sourceUrl}`,
      `Confidence: ${lead.confidenceLabel}`,
      `Ranking score: ${lead.scores.ranking}`
    ],
    sourceContext:
      "MVP scaffold ยังไม่ดึงบทความเต็ม จึงแสดง context จาก source URL และคะแนนคัดกรองเบื้องต้น",
    suggestedAnglesTh: [
      "สรุปว่าคนทำงานจริงเอาไปใช้อะไรได้",
      "เทียบกับ workflow เดิมว่าช่วยลดขั้นตอนไหน",
      "ทำเป็น checklist ก่อนลองใช้ tool หรือ feature นี้"
    ],
    possibleHooksTh: [
      "ถ้าใช้ AI ทำงานทุกวัน เรื่องนี้ควรเช็กก่อนพลาด update สำคัญ",
      "อัปเดตนี้อาจเปลี่ยนวิธีทำ workflow AI แบบเดิม"
    ],
    cautionsTh: lead.verifyNextTh,
    recommendedFormat: "short post หรือ carousel explainer",
    createdAt: now()
  };

  lead.expansion = expansion;
  return expansion;
}

export function restoreRejectedItem(rejectedId: string) {
  const current = store();
  const rejected = current.rejected.find((item) => item.id === rejectedId);

  if (!rejected) {
    return null;
  }

  current.rejected = current.rejected.filter((item) => item.id !== rejectedId);
  const lead: ContentLead = {
    id: id("lead"),
    storyClusterId: rejected.storyClusterId,
    title: rejected.title,
    sourceUrl: rejected.sourceUrl,
    leadBriefTh: `${rejected.title} ถูก restore จาก Rejected Queue เพื่อให้ตรวจต่อเป็น Content Lead`,
    confidenceLabel: "medium",
    scores: {
      audienceFit: 60,
      contentPotential: 60,
      novelty: 55,
      practicalValue: 58,
      confidence: 55,
      ranking: 58
    },
    whyItMattersTh: "ผู้ใช้เลือกกู้กลับ แปลว่า rejection rule อาจต้องปรับตาม Editorial Memory",
    verifyNextTh: "ตรวจ source และเหตุผล reject เดิมก่อนนำไปใช้ต่อ",
    createdAt: now()
  };
  current.leads.unshift(lead);
  return lead;
}
