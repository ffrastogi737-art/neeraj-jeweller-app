import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT || 3000);

// ======================================================
// API KEYS
// ======================================================

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";

const ai = GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: GEMINI_API_KEY
    })
  : null;

// ======================================================
// EXPRESS
// ======================================================

app.use(express.json({ limit: "32kb" }));

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);

// ======================================================
// ALLOWED VALUES
// ======================================================

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

// ======================================================
// HELPERS
// ======================================================

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

  // Remove markdown/code formatting
  result = result
    .replace(/^```[a-zA-Z]*\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  // Remove surrounding quotation marks
  result = result
    .replace(/^["“”']+/, "")
    .replace(/["“”']+$/, "")
    .trim();

  // Remove unwanted labels
  result = result.replace(
    /^(review|customer review|review text)\s*:\s*/i,
    ""
  );

  return result.trim();
}

function isValidReview(text) {
  const words = countWords(text);

  return (
    words >= 55 &&
    words <= 90
  );
}

// ======================================================
// VALIDATE PAYLOAD
// ======================================================

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

// ======================================================
// PROMPT
// ======================================================

function buildPrompt(data) {
  return `
Write a natural first-person customer review for the jewellery showroom "Neeraj Jewellers" in Dehradun.

IMPORTANT:
- Write ONLY the review.
- No title.
- No explanation.
- No quotation marks.
- No hashtags.
- No markdown.
- No mention of AI.
- The review MUST be between 55 and 90 words.
- Aim for approximately 70 words.
- Use first-person customer voice.
- Make it sound like a real Indian customer.
- Do not use overly promotional or unnatural language.

Customer details:

Product quality rating:
${data.productQualityRating}/5

Design variety rating:
${data.designVarietyRating}/5

Customer service rating:
${data.customerServiceRating}/5

Quick feedback:
${
  data.quickFeedback.length
    ? data.quickFeedback.join(", ")
    : "No quick feedback selected"
}

Jewellery explored/purchased:
${
  data.jewelleryItems.length
    ? data.jewelleryItems.join(", ")
    : "Not specified"
}

Language:
${data.language}

Preferred voice:
${data.gender}

Showroom:
Neeraj Jewellers

Location:
Dehradun

Category:
Jewellery Showroom

Products include:
Gold and silver jewellery, rings, mangalsutra, necklace sets, chains, bracelets, bangles, earrings, nose pins, pendants, silver payal, toe rings and 1 gram gold-plated jewellery.

Language instructions:
- English = natural Indian English.
- Hinglish = natural Hindi + English mix using normal Roman Hindi.
- Hindi = Devanagari Hindi.

Again:
Return ONLY one customer review paragraph.
The final review must contain 55–90 words.
`;
}

// ======================================================
// GEMINI
// ======================================================

async function generateGemini(prompt) {
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

  for (
    let attempt = 1;
    attempt <= 3;
    attempt++
  ) {
    try {
      console.log(
        `Calling Gemini... Attempt ${attempt}/3`
      );

      const response =
        await ai.models.generateContent({
          model: "gemini-3.8-flash",

          contents: prompt,

          config: {
            temperature: 0.7,

            maxOutputTokens: 500
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

      console.log(
        `Gemini returned ${countWords(review)} words.`
      );

      if (!isValidReview(review)) {
        throw new Error(
          `Gemini returned ${countWords(
            review
          )} words; required range is 55–90.`
        );
      }

      console.log(
        `Gemini success on attempt ${attempt}.`
      );

      return review;

    } catch (error) {
      lastError = error;

      console.error(
        `Gemini attempt ${attempt} failed:`,
        error?.message || error
      );

      if (attempt < 3) {
        await new Promise(
          (resolve) =>
            setTimeout(
              resolve,
              1500 * attempt
            )
        );
      }
    }
  }

  throw new Error(
    lastError?.message ||
      "Gemini failed after 3 attempts."
  );
}

// ======================================================
// GROQ
// ======================================================

async function generateGroq(prompt) {
  if (!GROQ_API_KEY) {
    throw new Error(
      "GROQ_API_KEY is missing."
    );
  }

  console.log("Calling Groq...");

  const response = await fetch(
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
        model: "openai/gpt-oss-20b",

        messages: [
          {
            role: "user",
            content: prompt
          }
        ],

        reasoning_effort: "low",

        temperature: 0.7,

        max_completion_tokens: 1000,

        stream: false
      })
    }
  );

  const rawText =
    await response.text();

  let data;

  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error(
      `Groq returned invalid JSON. HTTP ${response.status}. Response: ${rawText.slice(
        0,
        500
      )}`
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

  console.log(
    "Groq finish reason:",
    choice?.finish_reason || "unknown"
  );

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

  console.log(
    `Groq returned ${countWords(review)} words.`
  );

  if (!isValidReview(review)) {
    throw new Error(
      `Groq returned ${countWords(
        review
      )} words; required range is 55–90.`
    );
  }

  console.log(
    "Groq success."
  );

  return review;
}

// ======================================================
// GENERATE REVIEW API
// ======================================================

app.post(
  "/api/generate-review",
  async (req, res) => {
    try {
      const data =
        validatePayload(req.body);

      const prompt =
        buildPrompt(data);

      let review = "";

      let geminiError = "";
      let groqError = "";

      // ------------------------------------------------
      // FIRST: GEMINI
      // ------------------------------------------------

      try {
        console.log(
          "================================"
        );

        console.log(
          "TRYING GEMINI"
        );

        console.log(
          "================================"
        );

        review =
          await generateGemini(
            prompt
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

      // ------------------------------------------------
      // SECOND: GROQ
      // ------------------------------------------------

      if (!review) {
        try {
          console.log(
            "================================"
          );

          console.log(
            "SWITCHING TO GROQ"
          );

          console.log(
            "================================"
          );

          review =
            await generateGroq(
              prompt
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

      // ------------------------------------------------
      // BOTH FAILED
      // ------------------------------------------------

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

      // ------------------------------------------------
      // FINAL VALIDATION
      // ------------------------------------------------

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

      // ------------------------------------------------
      // SUCCESS
      // ------------------------------------------------

      console.log(
        `FINAL REVIEW: ${wordCount} words`
      );

      return res.json({
        review: finalReview,

        wordCount,

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

// ======================================================
// HEALTH CHECK
// ======================================================

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

// ======================================================
// START SERVER
// ======================================================

app.listen(
  port,
  () => {
    console.log(
      `Neeraj Jewellers Review App running at http://localhost:${port}`
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
