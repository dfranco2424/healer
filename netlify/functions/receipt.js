// netlify/functions/receipt.js
// Reads a photo of a grocery receipt and returns the food items on it.
// Runs on Netlify's servers; holds the secret key.

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { image, media_type } = JSON.parse(event.body || "{}");
    if (!image) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "No image provided" }) };
    }

    const systemPrompt =
      "You read photos of grocery receipts. Extract ONLY the food and drink/grocery items a person would keep in a pantry or fridge. " +
      "Ignore prices, totals, tax, store name, payment info, and non-food items (bags, cleaning supplies unless clearly a pantry staple). " +
      "Clean up abbreviated names into normal words (e.g. 'CHKN BRST' becomes 'Chicken breast', 'ORG BANANA' becomes 'Bananas'). " +
      "Respond with ONLY a JSON array of item name strings, nothing else. No prose, no markdown, no code fences. " +
      'Example: ["Chicken breast", "Bananas", "White rice", "Greek yogurt"]. ' +
      "If you cannot read the receipt or find no food items, respond with an empty array: [].";

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: media_type || "image/jpeg", data: image } },
              { type: "text", text: "List the food/grocery items from this receipt as a JSON array of names." },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return { statusCode: 500, headers, body: JSON.stringify({ error: "AI request failed", detail: errText }) };
    }

    const data = await response.json();
    let raw = (data.content && data.content[0] && data.content[0].text) || "[]";
    // strip any accidental code fences
    raw = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
    let items = [];
    try {
      items = JSON.parse(raw);
      if (!Array.isArray(items)) items = [];
    } catch (e) {
      items = [];
    }
    // keep them clean strings
    items = items.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()).slice(0, 60);

    return { statusCode: 200, headers, body: JSON.stringify({ items }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Server error", detail: String(err) }) };
  }
};
