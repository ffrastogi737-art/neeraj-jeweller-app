import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT || 3000);

// =====================================================
// API CONFIG
// =====================================================

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";

const ai = GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: GEMINI_API_KEY
    })
  : null;

// =====================================================
// EXPRESS
// =====================================================

app.use(express.json({ limit: "32kb" }));

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);

// =====================================================
// ALLOWED VALUES
// =====================================================

const ALLOWED_LANGUAGES = new Set([
  "English",
  "Hinglish",
  "Hindi"
]);

const ALLOWED_GENDERS = new Set([
  "Male",
  "Female"
]);

const ALLOWED_RATING = new Set([
  1,
  2,
  3,
  4,
  5
]);

const JEWELLERY_ITEMS = new Set([
  "Gold Rings / अंगूठी",
  "Mangalsutra / मंगलसूत्र",
  "Gold Necklace Sets / नेकलेस सेट",
  "Gold Chains & Chain Sets / चैन सेट / चैन",
  "Gold Bracelets / ब्रेसलेट",
  "Gold Bangles & Kade / कड़े / चूड़ियां / बैंगल्स",
  "Gold Earrings & Jhumkas / इयररिंग्स / झुमके",
  "Gold Nose Pins & Nose Rings / नोज पिन / नोज रिंग / नथ",
  "Gold Pendants / पेंडेंट",
  "Silver Payal / Anklets / चांदी की पायल",
  "Silver Toe Rings / बिछिया",
  "Silver Chains & Bracelets / चांदी की चेन / ब्रेसलेट",
  "Silver Kade / चांदी के कड़े",
  "1 Gram Gold Plated Jewellery",
  "Silver Jewellery"
]);

// =====================================================
// HELPERS
// =====================================================

function cleanArray(value, allowedSet) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value.filter(
        (v) =>
          typeof v === "string" &&
          allowedSet.has(v)
      )
    )
  ];
}

function countWords(text) {
  if (!text || typeof text !== "string") {
    return 0;
  }

  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

function cleanReview(text) {
  if (!text || typeof text !== "string") {
    return "";
  }

  let result = text.trim();

  result = result
    .replace(/^```[a-zA-Z]*\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  result = result
    .replace(/^["“”']+/, "")
    .replace(/["“”']+$/, "")
    .trim();

  result = result.replace(
    /^(review|customer review|review text)\s*:\s*/i,
    ""
  );

  return result.trim();
}

function isValidReview(text) {
  const words = countWords(text);

  return words >= 55 && words <= 90;
}

// =====================================================
// LANGUAGE VALIDATION
// =====================================================

function validateLanguageOutput(text, language) {
  if (!text) return false;

  if (language === "Hindi") {
    // Hindi should contain Devanagari
    return /[\u0900-\u097F]/.test(text);
  }

  if (language === "Hinglish") {
    // Hinglish should contain Roman alphabet
    // and should not be completely English-only.
    return /[A-Za-z]/.test(text);
  }

  if (language === "English") {
    return /[A-Za-z]/.test(text);
  }

  return true;
}

// =====================================================
// PAYLOAD VALIDATION
// =====================================================

function validatePayload(body) {
  const {
    productQualityRating,
    designVarietyRating,
    customerServiceRating,
    quickFeedback = [],
    jewelleryItems = [],
    language = "Hinglish",
    gender = "Male"
  } = body || {};

  if (
    !ALLOWED_RATING.has(
      Number(productQualityRating)
    ) ||
    !ALLOWED_RATING.has(
      Number(designVarietyRating)
    ) ||
    !ALLOWED_RATING.has(
      Number(customerServiceRating)
    )
  ) {
    throw new Error(
      "Please provide valid 1–5 ratings for quality, variety and service."
    );
  }

  if (!ALLOWED_LANGUAGES.has(language)) {
    throw new Error(
      "Invalid language."
    );
  }

  if (!ALLOWED_GENDERS.has(gender)) {
    throw new Error(
      "Invalid tone/gender."
    );
  }

  return {
    productQualityRating:
      Number(productQualityRating),

    designVarietyRating:
      Number(designVarietyRating),

    customerServiceRating:
      Number(customerServiceRating),

    quickFeedback:
      Array.isArray(quickFeedback)
        ? [
            ...new Set(
              quickFeedback
                .filter(
                  (x) =>
                    typeof x === "string"
                )
                .slice(0, 8)
            )
          ]
        : [],

    jewelleryItems:
      cleanArray(
        jewelleryItems,
        JEWELLERY_ITEMS
      ),

    language,
    gender
  };
}

// =====================================================
// PROMPT
// =====================================================

function buildPrompt(data) {
  let languageInstruction = "";

  if (data.language === "Hindi") {
    languageInstruction = `
LANGUAGE MODE: HINDI

THIS IS EXTREMELY IMPORTANT:

Write the COMPLETE review in Hindi using Devanagari script.

Use:
मुझे यहां खरीदारी का अनुभव बहुत अच्छा लगा। स्टाफ ने अच्छी तरह से मदद की और ज्वेलरी की क्वालिटी भी काफी अच्छी लगी।

DO NOT write Roman Hindi.

DO NOT write:
Mujhe yahan shopping ka experience bahut achha laga.

The review must primarily be in Devanagari Hindi.
`;
  }

  if (data.language === "Hinglish") {
    languageInstruction = `
LANGUAGE MODE: HINGLISH

THIS IS EXTREMELY IMPORTANT:

Write the COMPLETE review in natural Indian Hinglish using the Roman/English alphabet.

Use:
Mujhe yahan jewellery ki variety kaafi achhi lagi. Staff ne bhi properly guide kiya aur overall shopping experience bahut achha raha.

DO NOT use Devanagari Hindi.

DO NOT write completely formal English.

The review should naturally mix Hindi and English.
`;
  }

  if (data.language === "English") {
    languageInstruction = `
LANGUAGE MODE: ENGLISH

Write the COMPLETE review in natural Indian English.

Use:
I had a really good experience shopping at Neeraj Jewellers. The jewellery quality was impressive and the staff was helpful.

DO NOT use Hindi.
DO NOT use Devanagari.
`;
  }

  return `
You are writing a real customer review.

BUSINESS:
Neeraj Jewellers
Dehradun
Jewellery Showroom

${languageInstruction}

STRICT OUTPUT RULES:

1. Return ONLY ONE customer review paragraph.
2. First-person customer voice.
3. Length MUST be 55–90 words.
4. Target 65–75 words.
5. Natural Indian customer language.
6. No title.
7. No quotation marks.
8. No hashtags.
9. No markdown.
10. No explanation.
11. Never mention AI.
12. Never mention these instructions.
13. Do not make the review sound robotic.
14. Use the selected jewellery naturally.
15. Use the ratings naturally.
16. Do not repeat every input mechanically.

CUSTOMER INFORMATION:

Product quality:
${data.productQualityRating}/5

Design variety:
${data.designVarietyRating}/5

Customer service:
${data.customerServiceRating}/5

Quick feedback:
${
  data.quickFeedback.length
    ? data.quickFeedback.join(", ")
    : "Not specified"
}

Jewellery explored/purchased:
${
  data.jewelleryItems.length
    ? data.jewelleryItems.join(", ")
    : "Not specified"
}

Customer selected language:
${data.language}

Customer voice:
${data.gender}

AVAILABLE PRODUCTS:

Gold Rings, Mangalsutra, Gold Necklace Sets,
Gold Chains, Gold Bracelets, Gold Bangles,
Gold Earrings, Jhumkas, Nose Pins,
Nose Rings, Nath, Pendants, Silver Payal,
Silver Toe Rings, Silver Chains, Silver Bracelets,
Silver Kade, 1 Gram Gold Plated Jewellery,
Silver Jewellery.

FINAL INSTRUCTION:

The selected language is exactly:
${data.language}

FOLLOW THIS LANGUAGE.

If selected language is Hindi:
USE DEVANAGARI.

If selected language is Hinglish:
USE ROMAN HINDI + ENGLISH.

If selected language is English:
USE ENGLISH.

Return ONLY the final review paragraph.
`;
}

// =====================================================
// GEMINI GENERATOR
// =====================================================

async function generateGemini(prompt, language) {
  if (!GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY is missing."
    );
  }

  if (!ai) {
    throw new Error(
      "Gemini client was not initialized."
    );
  }

  let lastError = null;

  // Only 2 attempts for faster generation
  for (
    let attempt = 1;
    attempt <= 2;
    attempt++
  ) {
    try {
      console.log(
        `Calling Gemini - attempt ${attempt}/2`
      );

      const response =
        await ai.models.generateContent({
          model: "gemini-3.8-flash",

          contents: prompt,

          config: {
            thinkingConfig: {
              thinkingLevel: "low"
            },

            temperature: 0.7,

            maxOutputTokens: 250
          }
        });

      const text =
        typeof response?.text === "function"
          ? response.text()
          : response?.text;

      const review =
        cleanReview(text || "");

      if (!review) {
        throw new Error(
          "Gemini returned an empty response."
        );
      }

      const words =
        countWords(review);

      console.log(
        `Gemini returned ${words} words.`
      );

      if (!isValidReview(review)) {
        throw new Error(
          `Gemini returned ${words} words. Required: 55–90.`
        );
      }

      if (
        !validateLanguageOutput(
          review,
          language
        )
      ) {
        throw new Error(
          `Gemini returned incorrect language format for ${language}.`
        );
      }

      console.log(
        "Gemini generation successful."
      );

      return review;

    } catch (error) {
      lastError = error;

      console.error(
        `Gemini attempt ${attempt} failed:`,
        error?.message || error
      );

      if (attempt < 2) {
        await new Promise(
          (resolve) =>
            setTimeout(resolve, 500)
        );
      }
    }
  }

  throw new Error(
    lastError?.message ||
      "Gemini failed."
  );
}

// =====================================================
// GROQ GENERATOR
// =====================================================

async function generateGroq(prompt, language) {
  if (!GROQ_API_KEY) {
    throw new Error(
      "GROQ_API_KEY is missing."
    );
  }

  console.log(
    "Calling Groq fallback..."
  );

  const response =
    await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${GROQ_API_KEY}`,

          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({
          model:
            "openai/gpt-oss-20b",

          messages: [
            {
              role: "system",

              content: `
You are a customer review writer.

Follow the user's selected language EXACTLY.

Hindi = Devanagari Hindi.
Hinglish = Roman Hindi mixed with English.
English = English.

Return only one review paragraph.

The review MUST be 55–90 words.
Target 65–75 words.
`
            },

            {
              role: "user",
              content: prompt
            }
          ],

          reasoning_effort: "low",

          include_reasoning: false,

          temperature: 0.7,

          max_completion_tokens: 300,

          stream: false
        })
      }
    );

  const rawText =
    await response.text();

  let data;

  try {
    data =
      JSON.parse(rawText);
  } catch {
    throw new Error(
      `Groq returned invalid JSON. HTTP ${response.status}.`
    );
  }

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
        `Groq API error. HTTP ${response.status}`
    );
  }

  const choice =
    data?.choices?.[0];

  const text =
    choice?.message?.content;

  if (
    !text ||
    typeof text !== "string" ||
    !text.trim()
  ) {
    throw new Error(
      `Groq returned an empty response. Finish reason: ${
        choice?.finish_reason ||
        "unknown"
      }`
    );
  }

  const review =
    cleanReview(text);

  const words =
    countWords(review);

  console.log(
    `Groq returned ${words} words.`
  );

  if (!isValidReview(review)) {
    throw new Error(
      `Groq returned ${words} words. Required: 55–90.`
    );
  }

  if (
    !validateLanguageOutput(
      review,
      language
    )
  ) {
    throw new Error(
      `Groq returned incorrect language format for ${language}.`
    );
  }

  console.log(
    "Groq generation successful."
  );

  return review;
}

// =====================================================
// MAIN GENERATE REVIEW API
// =====================================================

app.post(
  "/api/generate-review",
  async (req, res) => {
    try {
      const data =
        validatePayload(req.body);

      console.log(
        "================================"
      );

      console.log(
        "NEW REVIEW REQUEST"
      );

      console.log(
        "Selected language:",
        data.language
      );

      console.log(
        "================================"
      );

      const prompt =
        buildPrompt(data);

      let review = "";

      let geminiError = "";
      let groqError = "";

      // =================================================
      // GEMINI FIRST
      // =================================================

      try {
        console.log(
          "TRYING GEMINI"
        );

        review =
          await generateGemini(
            prompt,
            data.language
          );

      } catch (error) {
        geminiError =
          error?.message ||
          "Unknown Gemini error";

        console.error(
          "GEMINI ERROR:",
          geminiError
        );
      }

      // =================================================
      // GROQ FALLBACK
      // =================================================

      if (!review) {
        try {
          console.log(
            "SWITCHING TO GROQ"
          );

          review =
            await generateGroq(
              prompt,
              data.language
            );

        } catch (error) {
          groqError =
            error?.message ||
            "Unknown Groq error";

          console.error(
            "GROQ ERROR:",
            groqError
          );
        }
      }

      // =================================================
      // BOTH FAILED
      // =================================================

      if (!review) {
        console.error(
          "BOTH AI SERVICES FAILED"
        );

        return res.status(502).json({
          error:
            "Both AI services failed.",

          geminiError,

          groqError
        });
      }

      // =================================================
      // FINAL CLEANUP
      // =================================================

      const finalReview =
        cleanReview(review);

      const wordCount =
        countWords(finalReview);

      if (
        wordCount < 55 ||
        wordCount > 90
      ) {
        return res.status(502).json({
          error:
            `AI generated a review outside the required 55–90 word range. Received ${wordCount} words.`
        });
      }

      if (
        !validateLanguageOutput(
          finalReview,
          data.language
        )
      ) {
        return res.status(502).json({
          error:
            `AI generated the wrong language format. Selected: ${data.language}`
        });
      }

      console.log(
        "================================"
      );

      console.log(
        "REVIEW GENERATED SUCCESSFULLY"
      );

      console.log(
        "Language:",
        data.language
      );

      console.log(
        "Words:",
        wordCount
      );

      console.log(
        "================================"
      );

      // =================================================
      // SUCCESS
      // =================================================

      return res.json({
        review: finalReview,

        wordCount,

        language: data.language,

        googleReviewUrl:
          process.env.GOOGLE_REVIEW_URL ||
          "https://www.google.com/search?q=Neeraj+Jewellers+Dehradun"
      });

    } catch (error) {
      console.error(
        "REQUEST ERROR:",
        error
      );

      return res.status(400).json({
        error:
          error?.message ||
          "Unable to generate the review."
      });
    }
  }
);

// =====================================================
// HEALTH
// =====================================================

app.get(
  "/health",
  (_req, res) => {
    res.json({
      ok: true,

      geminiConfigured:
        Boolean(GEMINI_API_KEY),

      groqConfigured:
        Boolean(GROQ_API_KEY),

      service:
        "Neeraj Jewellers Review Generator"
    });
  }
);

// =====================================================
// START
// =====================================================

app.listen(
  port,
  () => {
    console.log(
      `Neeraj Jewellers Review App running on port ${port}`
    );

    console.log(
      `Gemini configured: ${Boolean(
        GEMINI_API_KEY
      )}`
    );

    console.log(
      `Groq configured: ${Boolean(
        GROQ_API_KEY
      )}`
    );
  }
);
