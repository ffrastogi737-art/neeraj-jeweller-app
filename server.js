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
// GEMINI SETUP
// =====================================================

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

// =====================================================
// EXPRESS SETUP
// =====================================================

app.use(express.json({ limit: "32kb" }));
app.use(express.static(path.join(__dirname, "public")));

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
  if (!Array.isArray(value)) return [];

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
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

function cleanReview(text) {
  return String(text || "")
    .trim()
    .replace(/^```[\w-]*\s*/i, "")
    .replace(/\s*```$/i, "")
    .replace(/^["']|["']$/g, "")
    .replace(/^Review:\s*/i, "")
    .trim();
}

function isValidReview(review) {
  const wordCount = countWords(review);

  return (
    wordCount >= 55 &&
    wordCount <= 90
  );
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
    !ALLOWED_RATING.has(Number(productQualityRating)) ||
    !ALLOWED_RATING.has(Number(designVarietyRating)) ||
    !ALLOWED_RATING.has(Number(customerServiceRating))
  ) {
    throw new Error(
      "Please provide valid 1–5 ratings for quality, variety and service."
    );
  }

  if (!ALLOWED_LANGUAGES.has(language)) {
    throw new Error("Invalid language.");
  }

  if (!ALLOWED_GENDERS.has(gender)) {
    throw new Error("Invalid review voice.");
  }

  return {
    productQualityRating: Number(productQualityRating),
    designVarietyRating: Number(designVarietyRating),
    customerServiceRating: Number(customerServiceRating),

    quickFeedback:
      Array.isArray(quickFeedback)
        ? [
            ...new Set(
              quickFeedback
                .filter(
                  (x) => typeof x === "string"
                )
                .slice(0, 8)
            )
          ]
        : [],

    jewelleryItems: cleanArray(
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
  return `
Write ONE natural customer review paragraph for the jewellery showroom "Neeraj Jewellers" in Dehradun.

CUSTOMER FEEDBACK:
- Product quality rating: ${data.productQualityRating}/5
- Design variety rating: ${data.designVarietyRating}/5
- Customer service rating: ${data.customerServiceRating}/5
- Quick feedback: ${
    data.quickFeedback.length
      ? data.quickFeedback.join(", ")
      : "No specific feedback selected"
  }
- Jewellery explored/purchased: ${
    data.jewelleryItems.length
      ? data.jewelleryItems.join(", ")
      : "Not specified"
  }

LANGUAGE:
${data.language}

CUSTOMER VOICE:
${data.gender}

SHOWROOM:
- Name: Neeraj Jewellers
- Location: Dehradun
- Category: Jewellery Showroom
- Products include gold jewellery, silver jewellery and 1 gram gold-plated jewellery.

STRICT RULES:

1. Write between 55 and 90 words.
2. Write approximately 70 words.
3. First-person customer voice.
4. Sound like a genuine Indian customer.
5. Make the wording natural, not robotic.
6. Do not invent prices, discounts, staff names or specific offers.
7. Do not make claims that were not provided.
8. No hashtags.
9. No quotation marks.
10. No headings.
11. No bullet points.
12. Do not mention AI.
13. Return ONLY the review paragraph.

LANGUAGE RULES:

If language is English:
Use natural Indian English.

If language is Hinglish:
Naturally mix Hindi and English using Roman Hindi.

If language is Hindi:
Use natural Hindi in Devanagari script.

VOICE RULE:

If customer voice is Male:
Use natural wording suitable for a male customer.

If customer voice is Female:
Use natural wording suitable for a female customer.

IMPORTANT:
The final answer MUST contain 55–90 words.
Aim for around 70 words.
Return ONLY the review.
`;
}

// =====================================================
// GEMINI GENERATOR
// =====================================================

async function generateWithGemini(prompt) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY is missing."
    );
  }

  const response =
    await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: prompt
    });

  const text = response?.text;

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
// GROQ GENERATOR
// =====================================================

async function generateWithGroq(prompt) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error(
      "GROQ_API_KEY is missing."
    );
  }

  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",

      headers: {
        Authorization:
          `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type":
          "application/json"
      },

      body: JSON.stringify({
        model: "openai/gpt-oss-20b",

        messages: [
          {
            role: "system",
            content:
              "Write natural Indian customer reviews. Follow the requested language and word count exactly."
          },
          {
            role: "user",
            content: prompt
          }
        ],

        temperature: 0.7,
        max_tokens: 250
      })
    }
  );

  const data =
    await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
      `Groq request failed with status ${response.status}`
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

function buildRetryPrompt(originalPrompt, previousReview) {
  const previousWordCount =
    countWords(previousReview);

  return `
${originalPrompt}

VERY IMPORTANT:

The previous generated review had ${previousWordCount} words.

Previous review:
${previousReview}

Generate a completely NEW review.

FINAL REQUIREMENT:
- Minimum: 55 words
- Maximum: 90 words
- Target: approximately 70 words
- ONE paragraph only
- Return ONLY the review
- Do not explain anything
- Do not mention the word count
`;
}

// =====================================================
// GENERATE VALID REVIEW
// =====================================================

async function generateValidReview(
  prompt,
  provider
) {
  let review = "";

  if (provider === "gemini") {
    review =
      await generateWithGemini(prompt);
  } else {
    review =
      await generateWithGroq(prompt);
  }

  // First attempt is already valid
  if (isValidReview(review)) {
    return review;
  }

  console.log(
    `${provider} generated ${countWords(review)} words. Retrying...`
  );

  // Retry same provider
  const retryPrompt =
    buildRetryPrompt(
      prompt,
      review
    );

  if (provider === "gemini") {
    review =
      await generateWithGemini(
        retryPrompt
      );
  } else {
    review =
      await generateWithGroq(
        retryPrompt
      );
  }

  if (!isValidReview(review)) {
    throw new Error(
      `${provider} retry generated ${countWords(review)} words.`
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
        validatePayload(req.body);

      const prompt =
        buildPrompt(data);

      let review = "";
      let provider = "";

      // =================================================
      // FIRST: GEMINI
      // =================================================

      try {
        console.log(
          "Trying Gemini..."
        );

        review =
          await generateValidReview(
            prompt,
            "gemini"
          );

        provider = "gemini";

        console.log(
          `Gemini success: ${countWords(review)} words`
        );

      } catch (geminiError) {

        console.error(
          "Gemini failed:",
          geminiError.message
        );

        // ===============================================
        // SECOND: GROQ FALLBACK
        // ===============================================

        try {
          console.log(
            "Switching to Groq..."
          );

          review =
            await generateValidReview(
              prompt,
              "groq"
            );

          provider = "groq";

          console.log(
            `Groq success: ${countWords(review)} words`
          );

        } catch (groqError) {

          console.error(
            "Groq failed:",
            groqError.message
          );

          return res.status(502).json({
            error:
              "Both AI services failed. Please try again.",
            details: {
              gemini:
                geminiError.message,
              groq:
                groqError.message
            }
          });
        }
      }

      // =================================================
      // FINAL SAFETY CHECK
      // =================================================

      review =
        cleanReview(review);

      if (!review) {
        return res.status(502).json({
          error:
            "AI returned an empty review. Please try again."
        });
      }

      const wordCount =
        countWords(review);

      if (
        wordCount < 55 ||
        wordCount > 90
      ) {
        return res.status(502).json({
          error:
            `Generated review contains ${wordCount} words. Required range is 55–90 words.`
        });
      }

      // =================================================
      // SUCCESS
      // =================================================

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
        "Generate review error:",
        error
      );

      return res.status(400).json({
        success: false,
        error:
          error?.message ||
          "Unable to generate the review."
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
      `Neeraj Jewellers Review App running at http://localhost:${port}`
    );
  }
);
