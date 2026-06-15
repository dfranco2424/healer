// netlify/functions/ask.js
// This runs on Netlify's servers, NOT on anyone's phone.
// It holds the secret key and is the only thing that talks to Claude.

exports.handler = async (event) => {
  // Allow the app to call this function
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  // Browsers send a preflight OPTIONS request first — answer it
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { question, condition, safeFoods } = JSON.parse(event.body || "{}");

    if (!question) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "No question provided" }) };
    }

    // Build a system prompt so Claude answers as the app's nutrition helper
    const systemPrompt =
      "You are a warm, knowledgeable nutrition companion inside a health app called Healer. " +
      "The person you're helping is focused on: " + (condition || "general wellness") + ". " +
      (safeFoods ? "Foods generally good for them include: " + safeFoods + ". " : "") +
      "Answer their food questions clearly and kindly in 2-4 sentences. " +
      "Be practical and specific (e.g. 'yes, in small amounts' or 'better to avoid during a flare'). " +
      "You are a wellness companion, not a doctor — for anything medical, gently suggest they check with their care team. " +
      "Never give a long lecture; keep it friendly and useful.";

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,   // the secret key, read from Netlify's private settings
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 400,
        system: systemPrompt,
        messages: [{ role: "user", content: question }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return { statusCode: 500, headers, body: JSON.stringify({ error: "AI request failed", detail: errText }) };
    }

    const data = await response.json();
    const answer = (data.content && data.content[0] && data.content[0].text) || "Sorry, I couldn't generate an answer just now.";

    return { statusCode: 200, headers, body: JSON.stringify({ answer }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Server error", detail: String(err) }) };
  }
};
