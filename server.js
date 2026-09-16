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
// AI SETUP
// =====================================================

const geminiApiKey = process.env.GEMINI_API_KEY?.trim();
const groqApiKey = process.env.GROQ_API_KEY?.trim();

const ai = geminiApiKey
  ? new GoogleGenAI({
      apiKey: geminiApiKey
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
        (item) =>
          typeof item === "string" &&
          allowedSet.has(item)
      )
    )
  ];
}

function cleanReview(text) {
  if (!text) {
    return "";
  }

  return String(text)
    .replace(/^```(?:text)?/i, "")
    .replace(/```$/i, "")
    .replace(/^["']|["']$/g, "")
    .replace(/^Review:\s*/i, "")
    .trim();
}

function countWords(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

function validWordCount(text) {
  const count = countWords(text);

  return count >= 55 && count <= 90;
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
      "Please provide valid 1–5 ratings."
    );
  }

  if (!ALLOWED_LANGUAGES.has(language)) {
    throw new Error(
      "Invalid language."
    );
  }

  if (!ALLOWED_GENDERS.has(gender)) {
    throw new Error(
      "Invalid review voice."
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

function createPrompt(data) {
  return `
Write a natural customer review for:

Neeraj Jewellers
Dehradun
Jewellery Showroom

CUSTOMER INFORMATION:

Product Quality Rating:
${data.productQualityRating}/5

Design Variety Rating:
${data.designVarietyRating}/5

Customer Service Rating:
${data.customerServiceRating}/5

Quick Feedback:
${
  data.quickFeedback.length
    ? data.quickFeedback.join(", ")
    : "No specific feedback"
}

Jewellery Explored/Purchased:
${
  data.jewelleryItems.length
    ? data.jewelleryItems.join(", ")
    : "Not specified"
}

Language:
${data.language}

Customer Voice:
${data.gender}

AVAILABLE PRODUCTS:

Gold Rings
Mangalsutra
Gold Necklace Sets
Gold Chains
Gold Bracelets
Gold Bangles
Gold Kade
Gold Earrings
Jhumkas
Nose Pins
Nose Rings
Nath
Gold Pendants
Silver Payal
Silver Anklets
Silver Toe Rings
Silver Chains
Silver Bracelets
Silver Kade
1 Gram Gold Plated Jewellery
Silver Jewellery

STRICT REQUIREMENTS:

- Write exactly ONE paragraph.
- Write between 55 and 90 words.
- Aim for approximately 70 words.
- Write in first-person customer voice.
- Sound like a real Indian customer.
- Keep the review natural and believable.
- Do not sound like an advertisement.
- Do not invent prices.
- Do not invent discounts.
- Do not invent staff names.
- Do not invent specific offers.
- Do not mention AI.
- Do not use hashtags.
- Do not use quotation marks.
- Do not use bullet points.
- Do not add a heading.
- Return ONLY the review.

LANGUAGE:

English:
Use natural Indian English.

Hinglish:
Use natural Roman Hindi mixed with English.

Hindi:
Use natural Hindi in Devanagari.

VOICE:

Male:
Natural wording from a male customer.

Female:
Natural wording from a female customer.

IMPORTANT:
The review MUST be between 55 and 90 words.
Target approximately 70 words.
`;
}

// =====================================================
// GEMINI
// =====================================================

async function generateGemini(prompt) {
  if (!geminiApiKey) {
    throw new Error(
      "GEMINI_API_KEY is missing in Render Environment Variables."
    );
  }

  if (!ai) {
    throw new Error(
      "Gemini client was not initialized."
    );
  }

  console.log(
    "Calling Gemini..."
  );

  const response =
    await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: prompt
    });

  const text =
    response?.text;

  console.log(
    "Gemini raw response received."
  );

  if (
    !text ||
    typeof text !== "string" ||
    !text.trim()
  ) {
    throw new Error(
      "Gemini returned an empty response."
    );
  }

  return cleanReview(text);
}

// =====================================================
// GROQ
// =====================================================

async function generateGroq(prompt) {
  if (!groqApiKey) {
    throw new Error(
      "GROQ_API_KEY is missing in Render Environment Variables."
    );
  }

  console.log(
    "Calling Groq..."
  );

  const response =
    await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${groqApiKey}`,

          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({
          model:
            "openai/gpt-oss-20b",

          messages: [
            {
              role: "system",
              content:
                "You write natural Indian customer reviews. Follow the requested language and word count exactly."
            },
            {
              role: "user",
              content: prompt
            }
          ],

          temperature: 0.7,

          max_completion_tokens: 300
        })
      }
    );

  let data;

  try {
    data =
      await response.json();
  } catch {
    throw new Error(
      `Groq returned invalid JSON. HTTP ${response.status}`
    );
  }

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
      `Groq API error. HTTP ${response.status}`
    );
  }

  const text =
    data?.choices?.[0]?.message?.content;

  if (
    !text ||
    typeof text !== "string" ||
    !text.trim()
  ) {
    throw new Error(
      "Groq returned an empty response."
    );
  }

  return cleanReview(text);
}

// =====================================================
// RETRY PROMPT
// =====================================================

function createRetryPrompt(
  originalPrompt,
  previousReview
) {
  return `
${originalPrompt}

YOUR PREVIOUS RESPONSE WAS:

${previousReview}

The previous response contained:
${countWords(previousReview)} words.

Generate a completely NEW review.

FINAL RULE:
The new review MUST contain 55 to 90 words.

Aim for 70 words.

Return ONLY the review paragraph.
Do not explain anything.
Do not mention word count.
`;
}

// =====================================================
// PROVIDER GENERATION
// =====================================================

async function generateFromProvider(
  provider,
  prompt
) {
  if (provider === "gemini") {
    return await generateGemini(
      prompt
    );
  }

  return await generateGroq(
    prompt
  );
}

// =====================================================
// GENERATE + RETRY
// =====================================================

async function generateValidReview(
  provider,
  prompt
) {
  // First attempt
  let review =
    await generateFromProvider(
      provider,
      prompt
    );

  console.log(
    `${provider} first response: ${countWords(review)} words`
  );

  // Already valid
  if (validWordCount(review)) {
    return review;
  }

  // Retry
  console.log(
    `${provider} response outside 55-90 words. Retrying...`
  );

  const retryPrompt =
    createRetryPrompt(
      prompt,
      review
    );

  review =
    await generateFromProvider(
      provider,
      retryPrompt
    );

  console.log(
    `${provider} retry response: ${countWords(review)} words`
  );

  if (!validWordCount(review)) {
    throw new Error(
      `${provider} generated ${countWords(review)} words after retry.`
    );
  }

  return review;
}

// =====================================================
// MAIN API
// =====================================================

app.post(
  "/api/generate-review",
  async (req, res) => {
    try {
      const data =
        validatePayload(
          req.body
        );

      const prompt =
        createPrompt(data);

      let review = "";
      let provider = "";

      let geminiError = null;
      let groqError = null;

      // =================================================
      // TRY GEMINI
      // =================================================

      try {
        console.log(
          "=============================="
        );

        console.log(
          "TRYING GEMINI"
        );

        console.log(
          "=============================="
        );

        review =
          await generateValidReview(
            "gemini",
            prompt
          );

        provider =
          "Gemini";

      } catch (error) {
        geminiError =
          error?.message ||
          String(error);

        console.error(
          "GEMINI ERROR:",
          error
        );

        // ===============================================
        // TRY GROQ
        // ===============================================

        try {
          console.log(
            "=============================="
          );

          console.log(
            "SWITCHING TO GROQ"
          );

          console.log(
            "=============================="
          );

          review =
            await generateValidReview(
              "groq",
              prompt
            );

          provider =
            "Groq";

        } catch (error2) {
          groqError =
            error2?.message ||
            String(error2);

          console.error(
            "GROQ ERROR:",
            error2
          );
        }
      }

      // =================================================
      // BOTH FAILED
      // =================================================

      if (!review) {
        return res.status(502).json({
          success: false,

          error:
            "Both AI services failed.",

          geminiError,

          groqError
        });
      }

      // =================================================
      // FINAL CLEAN
      // =================================================

      review =
        cleanReview(review);

      const wordCount =
        countWords(review);

      // =================================================
      // FINAL WORD CHECK
      // =================================================

      if (
        wordCount < 55 ||
        wordCount > 90
      ) {
        return res.status(502).json({
          success: false,

          error:
            `AI generated ${wordCount} words. Required: 55–90 words.`,

          provider,

          review
        });
      }

      // =================================================
      // SUCCESS
      // =================================================

      console.log(
        `SUCCESS: ${provider} - ${wordCount} words`
      );

      return res.json({
        success: true,

        review,

        wordCount,

        provider,

        googleReviewUrl:
          process.env.GOOGLE_REVIEW_URL ||
          "https://www.google.com/search?q=Neeraj+Jewellers+Dehradun"
      });

    } catch (error) {
      console.error(
        "API ERROR:",
        error
      );

      return res.status(400).json({
        success: false,

        error:
          error?.message ||
          "Unable to generate review."
      });
    }
  }
);

// =====================================================
// HEALTH CHECK
// =====================================================

app.get(
  "/health",
  (_req, res) => {
    res.json({
      ok: true,

      geminiConfigured:
        Boolean(geminiApiKey),

      groqConfigured:
        Boolean(groqApiKey),

      service:
        "Neeraj Jewellers Review Generator"
    });
  }
);

// =====================================================
// START SERVER
// =====================================================

app.listen(
  port,
  () => {
    console.log(
      "======================================"
    );

    console.log(
      "Neeraj Jewellers Review App"
    );

    console.log(
      `Running on port: ${port}`
    );

    console.log(
      `Gemini configured: ${Boolean(
        geminiApiKey
      )}`
    );

    console.log(
      `Groq configured: ${Boolean(
        groqApiKey
      )}`
    );

    console.log(
      "======================================"
    );
  }
);
