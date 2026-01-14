exports.handler = async () => {
  const { data: posts } = await supabase
    .from("posts")
    .select("*")
    .limit(50);

  for (const p of posts) {
    await fetch("/.netlify/functions/moderate", {
      method: "POST",
      body: JSON.stringify({
        user: p.user,
        content: p.content,
        post_id: p.id
      })
    });
  }

  return { statusCode: 200, body: "scan done" };
};
