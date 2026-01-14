const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function aiModerate(content) {
  const res = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "omni-moderation-latest",
      input: content
    })
  });

  const data = await res.json();
  return data.results[0];
}

exports.handler = async (event) => {
  const { user, content, post_id } = JSON.parse(event.body);

  const result = await aiModerate(content);

  const illegal =
    result.categories.illicit_behavior ||
    result.categories.terrorism ||
    result.categories.sexual_exploitation ||
    result.categories.violent_crime;

  await supabase.from("moderation_logs").insert({
    user_name: user,
    content,
    ai_decision: illegal ? "ban" : "allow",
    confidence: Math.max(...Object.values(result.category_scores))
  });

  if (illegal) {
    await supabase.from("posts").delete().eq("id", post_id);

    const { data: u } = await supabase
      .from("users")
      .select("strikes")
      .eq("username", user)
      .single();

    const strikes = (u?.strikes || 0) + 1;

    await supabase.from("users").update({
      strikes,
      banned: strikes >= 2
    }).eq("username", user);

    return {
      statusCode: 403,
      body: JSON.stringify({ banned: strikes >= 2 })
    };
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
