// netlify/functions/nutrition.js
// Takes a meal name + plain-English ingredients and returns estimated calories and protein.

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
    const { name, ingredients } = JSON.parse(event.body || "{}");
    if (!ingredients) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "No ingredients provided" }) };
    }

    const systemPrompt =
      "You are a nutrition estimator. Given a meal name and a plain-English list of ingredients with rough amounts, " +
      "estimate the TOTAL calories and TOTAL grams of protein for the whole meal as described. " +
      "Use typical serving sizes and common-sense interpretation (e.g. '1 scoop protein powder' ~ 1 standard scoop, 'a drizzle of honey' ~ 1 tsp). " +
      "Respond with ONLY a JSON object, no prose, no markdown, no code fences. " +
      'Format exactly: {"calories": number, "protein": number}. ' +
      "Round to whole numbers. If you truly cannot estimate, use your best reasonable guess rather than zero.";

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 200,
        system: systemPrompt,
        messages: [
          { role: "user", content: "Meal: " + (name || "(unnamed)") + "\nIngredients:\n" + ingredients },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return { statusCode: 500, headers, body: JSON.stringify({ error: "AI request failed", detail: errText }) };
    }

    const data = await response.json();
    let raw = (data.content && data.content[0] && data.content[0].text) || "{}";
    raw = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
    let out = { calories: 0, protein: 0 };
    try {
      const parsed = JSON.parse(raw);
      out.calories = Math.round(Number(parsed.calories) || 0);
      out.protein = Math.round(Number(parsed.protein) || 0);
    } catch (e) {
      // leave zeros
    }

    return { statusCode: 200, headers, body: JSON.stringify(out) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Server error", detail: String(err) }) };
  }
};
