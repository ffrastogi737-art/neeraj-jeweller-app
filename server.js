import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT || 3000);

// Google Gemini API Setup (Free Tier)
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.use(express.json({ limit: "32kb" }));
app.use(express.static(path.join(__dirname, "public")));

const ALLOWED_LANGUAGES = new Set(["English", "Hinglish", "Hindi"]);
const ALLOWED_GENDERS = new Set(["Male", "Female"]);
const ALLOWED_RATING = new Set([1, 2, 3, 4, 5]);

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

function cleanArray(value, allowedSet) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v) => typeof v === "string" && allowedSet.has(v)))];
}

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
    throw new Error("Please provide valid 1–5 ratings for quality, variety and service.");
  }

  if (!ALLOWED_LANGUAGES.has(language)) throw new Error("Invalid language.");
  if (!ALLOWED_GENDERS.has(gender)) throw new Error("Invalid tone/gender.");

  return {
    productQualityRating: Number(productQualityRating),
    designVarietyRating: Number(designVarietyRating),
    customerServiceRating: Number(customerServiceRating),
    quickFeedback: Array.isArray(quickFeedback)
      ? [...new Set(quickFeedback.filter((x) => typeof x === "string").slice(0, 8))]
      : [],
    jewelleryItems: cleanArray(jewelleryItems, JEWELLERY_ITEMS),
    language,
    gender
  };
}

app.post("/api/generate-review", async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is not configured on the server."
      });
    }

    const data = validatePayload(req.body);

    const prompt = `
Create one natural customer review draft for the jewellery showroom "Neeraj Jewellers" in Dehradun.

This is a review-writing assistant, not a fact generator. Use ONLY the customer feedback supplied below.
Do not invent purchases, prices, purity claims, guarantees, staff names, discounts, or other facts.
Do not force praise if the ratings are low. The wording must accurately reflect the ratings.

Customer feedback:
- Product quality rating: ${data.productQualityRating}/5
- Design variety rating: ${data.designVarietyRating}/5
- Customer service rating: ${data.customerServiceRating}/5
- Quick feedback: ${data.quickFeedback.length ? data.quickFeedback.join(", ") : "No quick feedback selected"}
- Jewellery explored/purchased: ${data.jewelleryItems.length ? data.jewelleryItems.join(", ") : "Not specified"}
- Language: ${data.language}
- Preferred voice: ${data.gender}

Showroom context:
- Name: Neeraj Jewellers
- Location: Dehradun
- Category: Jewellery Showroom
- Offers Gold and Silver jewellery, including rings, mangalsutra, necklace sets, chains, bracelets, bangles, earrings, nose pins, pendants, silver payal, toe rings, and 1 gram gold-plated jewellery.

Writing requirements:
- 55–90 words.
- First-person customer voice.
- Natural Indian customer wording.
- No hashtags.
- No quotation marks.
- Do not mention AI.
- For Hinglish, naturally mix Hindi and English.
- For Hindi, use Devanagari.
- For English, use natural Indian English.
Return only the review text.
`;

    let response;
    
    // SMART FALLBACK & SPEED BOOST 
    try {
      response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: prompt,
        config: {
          temperature: 0.6, // इसे कम करने से AI तेज़ काम करता है 
          maxOutputTokens: 150 // फालतू लंबा न खींचे, जल्दी दे दे
        }
      });
    } catch (primaryError) {
      console.log("नया मॉडल बिज़ी है (503), पुराने मॉडल (1.5-flash) पर स्विच कर रहे हैं...", primaryError.message);
      
      response = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: prompt,
        config: {
          temperature: 0.6, 
          maxOutputTokens: 150 
        }
      });
    }

    const review = (response.text || "").trim();

    if (!review) {
      return res.status(502).json({ error: "AI returned an empty review." });
    }

    res.json({
      review,
      googleReviewUrl:
        process.env.GOOGLE_REVIEW_URL ||
        "https://www.google.com/search?q=Neeraj+Jewellers+Dehradun"
    });
  } catch (error) {
    console.error(error);
    res.status(400).json({
      error: error?.message || "Unable to generate the review."
    });
  }
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.listen(port, () => {
  console.log(`Neeraj Jewellers Review App running at http://localhost:${port}`);
});
