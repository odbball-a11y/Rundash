// netlify/functions/runalyze-rhr.js
// Proxies RHR requests to the Runalyze API to avoid CORS issues.
// Set your API key as an environment variable RUNALYZE_API_KEY in Netlify dashboard.

export default async (request) => {
  const apiKey = Netlify.env.get("RUNALYZE_API_KEY");

  if (!apiKey) {
    return new Response(JSON.stringify({ error: "RUNALYZE_API_KEY not set in Netlify environment" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const resp = await fetch("https://runalyze.com/api/v1/metrics/heartRateRest?page=1", {
      headers: { "token": apiKey }
    });

    if (!resp.ok) {
      return new Response(JSON.stringify({ error: `Runalyze API returned ${resp.status}` }), {
        status: resp.status,
        headers: { "Content-Type": "application/json" }
      });
    }

    const data = await resp.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

export const config = {
  path: "/api/rhr"
};
