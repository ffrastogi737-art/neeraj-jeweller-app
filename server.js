import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT || 3000);

// ===============================
// AI SETUP
// ===============================

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

// ===============================
// EXPRESS SETUP
// ===============================

app.use(express.json({ limit: "32kb" }));
app.use(express.static(path.join(__dirname, "public")));

// ===============================
// ALLOWED VALUES
// ===============================

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

const QUICK_FEEDBACK = new Set([
  "Good Quality",
  "Beautiful Designs",
  "Good Variety",
  "Helpful Staff",
  "Friendly Service",
  "Good Pricing",
  "Fast Service",
  "Clean Showroom",
  "Worth the Price",
  "Good Experience"
]);

// ===============================
// HELPERS
// ===============================

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
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

function cleanReview(text) {
  return String(text || "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/^Review:\s*/i, "")
    .trim();
}

// ===============================
// PAYLOAD VALIDATION
// ===============================

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
    throw new Error("Invalid tone/gender.");
  }

  return {
    productQualityRating: Number(productQualityRating),
    designVarietyRating: Number(designVarietyRating),
    customerServiceRating: Number(customerServiceRating),

    quickFeedback: cleanArray(
      quickFeedback,
      QUICK_FEEDBACK
    ).slice(0, 8),

    jewelleryItems: cleanArray(
      jewelleryItems,
      JEWELLERY_ITEMS
    ),

    language,
    gender
  };
}

// ===============================
// REVIEW PROMPT
// ===============================

function buildPrompt(data) {
  return `
Write a natural customer review for the jewellery showroom "Neeraj Jewellers" in Dehradun.

CUSTOMER DETAILS:
- Product quality: ${data.productQualityRating}/5
- Design variety: ${data.designVarietyRating}/5
- Customer service: ${data.customerServiceRating}/5
- Quick feedback: ${
    data.quickFeedback.length
      ? data.quickFeedback.join(", ")
      : "No specific feedback"
  }
- Jewellery explored/purchased: ${
    data.jewelleryItems.length
      ? data.jewelleryItems.join(", ")
      : "Not specified"
  }
- Language: ${data.language}
- Customer voice: ${data.gender}

SHOWROOM:
- Name: Neeraj Jewellers
- Location: Dehradun
- Category: Jewellery Showroom
- Products include gold, silver and 1 gram gold-plated jewellery.

STRICT WRITING RULES:
1. Write exactly ONE review paragraph.
2. Length must be between 55 and 90 words.
3. Write in first-person customer voice.
4. Make it sound like a genuine Indian customer.
5. Do not exaggerate.
6. Do not invent specific prices, discounts, offers or staff names.
7. Do not use hashtags.
8. Do not use quotation marks.
9. Do not mention AI.
10. Do not add headings.
11. Do not add bullet points.
12. For Hinglish, naturally mix Hindi and English.
13. For Hindi, use Devanagari.
14. For English, use natural Indian English.
15. The customer's gender should influence the natural voice slightly, but do not mention gender.

Return ONLY the review paragraph.
`;
}

// ===============================
// GEMINI
// ===============================

async function generateWithGemini(prompt) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is missing.");
  }

  const response = await ai.models.generateContent({
    model: "gemini-3.8-flash",
    contents: prompt,
    config: {
      temperature: 0.7,
      maxOutputTokens: 250
    }
  });

  return cleanReview(response?.text || "");
}

// ===============================
// GROQ FALLBACK
// ===============================

async function generateWithGroq(prompt) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is missing.");
  }

  const groqResponse = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        // Current replacement for deprecated Llama 3.1 8B
        model: "openai/gpt-oss-20b",

        messages: [
          {
            role: "system",
            content:
              "You write natural, authentic Indian customer reviews. Follow the user's requested language and word count exactly."
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

  const groqData = await groqResponse.json();

  if (!groqResponse.ok) {
    throw new Error(
      groqData?.error?.message ||
        `Groq request failed with status ${groqResponse.status}`
    );
  }

  return cleanReview(
    groqData?.choices?.[0]?.message?.content || ""
  );
}

// ===============================
// REVIEW LENGTH VALIDATION
// ===============================

function validateReviewLength(review) {
  const words = countWords(review);

  return words >= 55 && words <= 90;
}

// ===============================
// GENERATE REVIEW API
// ===============================

app.post("/api/generate-review", async (req, res) => {
  try {
    const data = validatePayload(req.body);

    const prompt = buildPrompt(data);

    let review = "";
    let provider = "";

    // -------------------------------
    // 1. GEMINI
    // -------------------------------

    try {
      review = await generateWithGemini(prompt);
      provider = "gemini";

      console.log("Review generated using Gemini.");
    } catch (geminiError) {
      console.error(
        "Gemini failed:",
        geminiError.message
      );

      // -------------------------------
      // 2. GROQ FALLBACK
      // -------------------------------

      try {
        review = await generateWithGroq(prompt);
        provider = "groq";

        console.log("Review generated using Groq fallback.");
      } catch (groqError) {
        console.error(
          "Groq failed:",
          groqError.message
        );

        throw new Error(
          "Both Gemini and Groq failed. Please try again later."
        );
      }
    }

    // -------------------------------
    // FINAL VALIDATION
    // -------------------------------

    if (!review) {
      return res.status(502).json({
        error: "AI returned an empty review. Please try again."
      });
    }

    if (!validateReviewLength(review)) {
      return res.status(502).json({
        error:
          "AI generated a review outside the required 55–90 word range. Please try again."
      });
    }

    // -------------------------------
    // RESPONSE
    // -------------------------------

    res.json({
      review,
      provider,
      wordCount: countWords(review),

      googleReviewUrl:
        process.env.GOOGLE_REVIEW_URL ||
        "https://www.google.com/search?q=Neeraj+Jewellers+Dehradun"
    });

  } catch (error) {
    console.error("Generate review error:", error);

    res.status(400).json({
      error:
        error?.message ||
        "Unable to generate the review."
    });
  }
});

// ===============================
// HEALTH CHECK
// ===============================

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "Neeraj Jewellers Review Generator"
  });
});

// ===============================
// START SERVER
// ===============================

app.listen(port, () => {
  console.log(
    `Neeraj Jewellers Review App running at http://localhost:${port}`
  );
});
