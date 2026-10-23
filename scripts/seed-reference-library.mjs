import nextEnv from "@next/env";
import pg from "pg";

nextEnv.loadEnvConfig(process.cwd());

const profiles = [
  {
    id: "ref_sanookai_profile", sourceName: "SanookAi",
    sourceUrl: "https://www.facebook.com/sanookai?locale=th_TH", kind: "page_profile",
    title: "เพจสอน AI ง่ายๆ ช่วยหาเงินได้จริง",
    summaryTh: "หน้าเพจระบุชัดว่าเน้นสอน AI ให้เข้าใจง่ายและเชื่อมกับการนำไปใช้สร้างผลลัพธ์จริง",
    observedSignals: ["ภาษาไทยตรงไปตรงมา", "เน้นเครื่องมือและวิธีใช้", "เชื่อมข่าวกับผลต่อ workflow"],
    usageGuidanceTh: ["ให้น้ำหนักข่าวที่ต่อยอดเป็นวิธีใช้ได้", "ใช้เป็นแนวทางคัดเลือกเท่านั้น ไม่เลียนแบบสำนวน"]
  },
  {
    id: "ref_peesamac_profile", sourceName: "AI กับ Peesamac",
    sourceUrl: "https://www.facebook.com/peesamac?locale=th_TH", kind: "page_profile",
    title: "คัดเครื่องมือ AI พร้อมอธิบายกลไกและข้อจำกัด",
    summaryTh: "ตัวอย่างสาธารณะแสดงแนวทางคัดประเด็นที่กระทบการใช้งานจริง แล้วอธิบายตัวเลข กลไก และเงื่อนไขที่ต้องระวัง",
    observedSignals: ["วิเคราะห์จาก metric", "อธิบาย architecture และ workflow", "ระบุข้อจำกัดของหลักฐาน"],
    usageGuidanceTh: ["ให้คะแนนข่าวที่มี trade-off ตรวจสอบได้", "ใช้เป็นแนวทางคัดเลือกเท่านั้น ไม่เลียนแบบ persona"]
  }
];

const posts = [
  ["ref_sanook_kimi", "SanookAi", "https://www.facebook.com/sanookai/posts/pfbid0z8A1uNhKFAuETU15eiodMWSLMrehziFed2CscqSCtkZK7G4PLdtzsSR6AGGvzsdZl", "ทดลอง Kimi CLI ต่อ DeepSeek V4 Flash", "เล่าจากการทดลองต่อ Kimi CLI กับ DeepSeek V4 Flash ผ่าน Opencode และชูประเด็นโควตาใช้ฟรีเป็นผลลัพธ์ที่ผู้อ่านนำไปลองต่อได้", ["ประสบการณ์ใช้งานจริง", "ระบุเครื่องมือหลายชิ้นใน workflow", "ชูประโยชน์ที่จับต้องได้"], ["มองหาข่าวที่แปลงเป็นขั้นตอนทดลองได้", "ตรวจเงื่อนไข quota จากต้นทางก่อนนำเสนอ"]],
  ["ref_sanook_qwen", "SanookAi", "https://www.facebook.com/sanookai/posts/pfbid0DFgLEZirMpUC2CZBaE6UqCv1ZCfeiskakqQA3wJfLjaYQE15UWhsvEDTkirQdRmil", "Qwen3.8-Max ห่าง Claude Opus 5 หนึ่งคะแนน", "ใช้คะแนน benchmark เป็น hook แล้วอธิบายว่าสถิติใกล้เคียงกัน พร้อมเตือนว่า Arena วัดความชอบต่อหน้าเว็บ ไม่ใช่ความสามารถแก้บั๊กจริง และรุ่นยังเป็น preview", ["เปิดด้วยตัวเลขสั้น", "เปรียบเทียบคู่แข่ง", "ใส่ข้อจำกัดของ benchmark", "ปิดด้วยคำถามเชิงทดลอง"], ["เลือก metric ที่ส่งผลต่อผู้ใช้", "ไม่สรุปว่าโมเดลชนะทุกงานจาก benchmark เดียว"]],
  ["ref_sanook_copilot", "SanookAi", "https://www.facebook.com/sanookai/posts/pfbid026MXqc17ZDgTK5qrnScGzXQB2UMFzkW6R3hdSfWMwhdoueGWKJxJR8XanPzmFWD6Jl", "Microsoft รวม Copilot เป็นแอปเดียว", "อธิบายแผนรวม Copilot หลายรูปแบบเข้าด้วยกัน แล้ววิเคราะห์ trade-off ระหว่างความสะดวกกับความซับซ้อนของหน้าจอ รวมถึงตั้งข้อสังเกตต่อจำนวนที่นั่งแบบจ่ายเงิน", ["ข่าว product strategy", "เทียบความเคลื่อนไหวหลายบริษัท", "แยกคำประกาศออกจากการยอมรับของตลาด"], ["คัดข่าวที่เปลี่ยน workflow หรือ product structure", "ตรวจตัวเลขผู้ใช้และบริบทก่อนสรุป"]],
  ["ref_sanook_security", "SanookAi", "https://www.facebook.com/sanookai/posts/pfbid0rpChrcpDK5zDQPvfz3Uoq8pEiJdKBCSsXfWzev4fMzjEkpWe2MsbQB6aP8QzEtKZl", "Agent โจมตีไซเบอร์และบทบาทของ guardrails", "เล่าเคสใช้ DeepSeek กับ Hermes Agent โจมตีเป้าหมายจำนวนมาก แต่ลดความตื่นตระหนกด้วยข้อมูลว่าสำเร็จจริงเพียง 3 จาก 460 และชี้ให้เห็นบทบาทของ provider guardrails", ["hook ความเสี่ยงสูง", "ใส่อัตราความสำเร็จจริง", "เทียบโมเดล hosted กับ self-hosted", "สรุปเชิง governance"], ["ข่าวความปลอดภัยต้องมีตัวเลขฐานและข้อจำกัด", "หลีกเลี่ยงการขยายความกลัวเกินหลักฐาน"]],
  ["ref_peesa_skills", "AI กับ Peesamac", "https://www.facebook.com/peesamac/posts/pfbid026R8qoTP21x73RxKid2rnnxvXq3KvUbxYKpuGt3R4k9nUKirv39KkYwmKsNEaYJWhl", "ทำไม Skill แม่นกว่า prompt ที่พิมพ์สด", "อธิบายว่า Skill คือไฟล์คำสั่ง แต่ให้ผลสม่ำเสมอกว่าเพราะ input คงที่, progressive disclosure, การใช้ script กับงานที่ต้องเป๊ะ และการสะสมบทเรียนเป็นระบบ", ["อธิบายกลไกทีละข้อ", "แยกงานดุลพินิจกับงาน deterministic", "เชื่อมแนวคิดกับ workflow จริง"], ["ให้คะแนน How-to ที่อธิบายว่าทำไมวิธีนั้นได้ผล", "มองหา automation ที่ย้ายงานเป๊ะไปให้โค้ด"]],
  ["ref_peesa_foresight", "AI กับ Peesamac", "https://www.facebook.com/peesamac/posts/pfbid0ymJAMRuG63jwAc5zCK3yWVru6o2QY28S6EEt3xpcQiKwwSVm6EXSfRzVacLMiQP1l", "ทบทวนฉากทัศน์ Data Governance 2050", "นำกรอบ scenario ของ UN Global Pulse มาทบทวนกับสถานการณ์ปัจจุบัน แล้วอธิบายเหตุผลว่าทำไมอำนาจข้อมูลกำลังกระจุกที่บริษัท พร้อมชี้ส่วนที่ยังไม่ตรงกับฉากทัศน์", ["ใช้กรอบคิดจากรายงาน", "แยก observation กับความเห็น", "ตรวจสมมติฐานย้อนหลัง"], ["คัดงานที่มีกรอบช่วยคิดระยะยาว", "ระบุชัดเมื่อข้อสรุปเป็นการตีความ"]],
  ["ref_peesa_grok_voice", "AI กับ Peesamac", "https://www.facebook.com/peesamac/posts/pfbid0h2RGewwvis4m2VhP3kiAtXTwRKAQbvDnCHREJa3RoskjFvaGG4ryPVNkMiQ5t78Wl", "Grok Voice Think Fast 2.0 กับ latency 0.70 วินาที", "เลือกเวลารอก่อนเสียงแรกเป็น metric หลัก เทียบกับรุ่นเดิมและ Gemini พร้อมเตือนว่าชุดทดสอบ 24 ภาษาไม่มีภาษาไทย จึงยังใช้ตัวเลขยืนยันงานไทยไม่ได้", ["metric เชื่อม UX โดยตรง", "เปรียบเทียบราคาและ latency", "ตรวจ coverage ภาษา", "อ้าง benchmark ภายนอก"], ["ให้คะแนนข่าวที่มี metric ต่อประสบการณ์ผู้ใช้", "ตรวจว่าผลทดสอบครอบคลุมภาษาไทยหรือไม่"]],
  ["ref_peesa_perplexity", "AI กับ Peesamac", "https://www.facebook.com/peesamac/posts/pfbid02MJScJnCYcmLqSoArinkcDpK4Td7vC21vrRbXBW7M1VP33UNCoA3fya8kobL8SD85l", "Perplexity Spaces เปลี่ยนเป็น Projects", "อธิบายระบบไฟล์ร่วม, Brain memory, สิทธิ์การเข้าถึง, Skill และการเชื่อม Slack/Teams แล้วชี้ความเสี่ยงว่าความจำที่ผิดอาจแพร่ต่อทั้งทีม", ["แจกแจง feature ตาม workflow", "ให้ความสำคัญกับ permission model", "ระบุ failure mode ของ memory"], ["คัด update ที่เปลี่ยนวิธีทำงานร่วมกัน", "ต้องเสนอข้อควรระวังเรื่อง memory และสิทธิ์"]],
  ["ref_peesa_face", "AI กับ Peesamac", "https://www.facebook.com/peesamac/posts/pfbid02hYfkndUEcE4w7DdhEDV6joYGFEg5ZNBS6kvPnBCB1kwtDF1SnB6m8mpT8HwuhATyl", "Face recognition บนมือถือเป็น pipeline หกด่าน", "ถอดระบบจดจำใบหน้าบนมือถือเป็นหลายขั้น พร้อม latency budget, อัตราทายผิด, บั๊กภาพกลับด้าน, refresh rate และการเก็บเฉพาะ embedding ในเครื่อง", ["เล่า architecture ผ่านปัญหาจริง", "แยก false reject กับ false accept", "มีตัวเลข performance", "อธิบาย privacy design"], ["ให้คะแนน engineering case study ที่มีตัวเลข", "มองหาความผิดพลาดที่นำไปใช้ป้องกันได้"]],
  ["ref_peesa_deepseek", "AI กับ Peesamac", "https://www.facebook.com/peesamac/posts/pfbid04E8F4yXHkpcX3DYBndnJPTvoYbunPXY5RbopjJXX2ezXvJQeg939GnwhwE5qF18Rl", "DeepSeek V4-Flash ดีขึ้นจาก post-training", "ชูการเพิ่มคะแนน agent โดยไม่เพิ่มขนาดโมเดล พร้อมเปรียบเทียบหลาย benchmark และเตือนว่าผู้ผลิตเป็นผู้รันทดสอบเอง บาง harness ยังไม่เปิดเผย", ["เปรียบเทียบ before/after", "ตั้งสมมติฐานจาก post-training", "ตรวจ reproducibility", "แยก API จาก web app"], ["ไม่ใช้ benchmark ภายในเป็นข้อยุติ", "คัดข่าวที่เผยกลไกการพัฒนามากกว่าตัวเลขอันดับ"]],
  ["ref_peesa_search", "AI กับ Peesamac", "https://www.facebook.com/peesamac/posts/pfbid0216Q6cWk9WtuvRET6ffFXLeBDbSSMwDZSV2NUeYuG5T1GAhsVZMG1tWWbumvPu9ril", "ใช้เพจเป็นคลังของดีที่ค้นกลับได้", "อธิบายเหตุผลของการทำเพจว่าเป็นคลังสิ่งที่คัดไว้ และใช้ Google ค้นร่วมกับชื่อเพจแทนการสร้างระบบค้นหาเอง", ["content เป็น knowledge archive", "เน้นการค้นกลับมาใช้", "วิธีง่ายแทนระบบซับซ้อน"], ["คัดข่าวให้ชื่อและ summary ค้นหาได้", "ให้ความสำคัญกับประโยชน์ระยะยาวของคลังความรู้"]]
].map(([id, sourceName, sourceUrl, title, summaryTh, observedSignals, usageGuidanceTh]) => ({
  id, sourceName, sourceUrl, kind: "public_post_sample", title, summaryTh, observedSignals, usageGuidanceTh
}));

const playbooks = [
  { sourceName: "SanookAi", sampleCount: 4, selectionSignals: ["ข่าวเครื่องมือที่ทดลองตามได้", "product update ที่เปลี่ยน workflow", "ตัวเลขเปรียบเทียบที่มีบริบท", "security story ที่มีข้อจำกัดชัด"], usefulAngles: ["ผลต่อคนทำงาน", "วิธีลองใช้", "trade-off ก่อนเชื่อคำโฆษณา"], audienceAssumptions: ["ผู้อ่านไทยสนใจใช้ AI ทำงานจริง", "ชื่อผลิตภัณฑ์ภาษาอังกฤษคงไว้ได้"], guardrails: ["ไม่เลียนแบบ hook หรือ persona", "ไม่ขยายความกลัว", "ตรวจ quota, benchmark และตัวเลขจากต้นทาง"] },
  { sourceName: "AI กับ Peesamac", sampleCount: 7, selectionSignals: ["metric ที่กระทบ UX", "engineering case study", "architecture หรือกลไกที่อธิบายได้", "ข้อจำกัดของหลักฐานและ reproducibility"], usefulAngles: ["ทำไมระบบจึงได้ผล", "นำไปปรับ workflow อย่างไร", "failure mode ที่ต้องระวัง"], audienceAssumptions: ["ผู้อ่านรับเนื้อหาเชิงเทคนิคได้เมื่ออธิบายเป็นลำดับ", "ต้องการทั้งประโยชน์และข้อจำกัด"], guardrails: ["ไม่เลียนแบบสำนวนบุคคล", "แยกข้อเท็จจริงจากความเห็น", "ไม่สรุปผลไทยเมื่อ benchmark ไม่ครอบคลุมภาษาไทย"] }
];

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("begin");
  await client.query("delete from reference_library_items where id in ('ref_sanookai_post','ref_peesamac_post')");
  for (const item of [...profiles, ...posts]) {
    await client.query(`insert into reference_library_items (
      id, source_name, source_url, kind, title, summary_th, observed_signals, usage_guidance_th
    ) values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)
    on conflict (source_name, source_url, kind) do update set title=excluded.title,
      summary_th=excluded.summary_th, observed_signals=excluded.observed_signals,
      usage_guidance_th=excluded.usage_guidance_th, captured_at=now()`,
    [item.id, item.sourceName, item.sourceUrl, item.kind, item.title, item.summaryTh, JSON.stringify(item.observedSignals), JSON.stringify(item.usageGuidanceTh)]);
  }
  for (const playbook of playbooks) {
    await client.query(`insert into editorial_playbooks (
      source_name, sample_count, selection_signals, useful_angles, audience_assumptions, guardrails
    ) values ($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb)
    on conflict (source_name) do update set sample_count=excluded.sample_count,
      selection_signals=excluded.selection_signals, useful_angles=excluded.useful_angles,
      audience_assumptions=excluded.audience_assumptions, guardrails=excluded.guardrails, updated_at=now()`,
    [playbook.sourceName, playbook.sampleCount, JSON.stringify(playbook.selectionSignals), JSON.stringify(playbook.usefulAngles), JSON.stringify(playbook.audienceAssumptions), JSON.stringify(playbook.guardrails)]);
  }
  await client.query("commit");
  console.log(`Reference Library updated with ${posts.length} observed public posts and ${playbooks.length} playbooks.`);
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
