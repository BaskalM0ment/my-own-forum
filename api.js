import { createClient } from "@supabase/supabase-js";
import Busboy from "busboy";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Simple AI moderation
function aiModerate(text) {
  const banned = ["crime","illegal","drugs","weapon"];
  return !banned.some(w => text.toLowerCase().includes(w));
}

export const handler = async (event) => {

  // GET posts
  if (event.httpMethod === "GET") {
    const { data } = await supabase.from("posts").select("*").order("created_at",{ascending:false});
    return { statusCode:200, body:JSON.stringify(data) };
  }

  // POST actions
  if (event.httpMethod === "POST") {

    // Handle multipart/form-data (for file uploads)
    const contentType = event.headers["content-type"] || event.headers["Content-Type"];
    if (contentType && contentType.startsWith("multipart/form-data")) {
      const bb = Busboy({ headers: event.headers });
      let fields = {};
      let fileData = null;

      bb.on("file", (name, file, info) => {
        const chunks = [];
        file.on("data", c => chunks.push(c));
        file.on("end", () => {
          fileData = { buffer: Buffer.concat(chunks), filename: info.filename, mime: info.mimeType };
        });
      });

      bb.on("field", (name, val) => { fields[name] = val; });

      await new Promise((resolve, reject) => {
        bb.on("finish", resolve);
        bb.end(Buffer.from(event.body, "base64"));
      });

      // AI moderation
      if(!aiModerate(fields.content)) {
        return { statusCode:403, body:JSON.stringify({error:"Post blocked by AI moderation"}) };
      }

      let file_url = null, file_type = null;
      if(fileData){
        const { data, error } = await supabase.storage.from("uploads").upload(
          `posts/${Date.now()}_${fileData.filename}`,
          fileData.buffer,
          { contentType: fileData.mime }
        );
        if(error) console.log(error);
        else{
          file_url = supabase.storage.from("uploads").getPublicUrl(data.path).publicURL;
          file_type = fileData.mime;
        }
      }

      await supabase.from("posts").insert({
        username: fields.user,
        content: fields.content,
        file_url,
        file_type
      });

      return { statusCode:200, body:JSON.stringify({ok:true}) };
    }

    // JSON actions: login/signup/appeal
    const body = JSON.parse(event.body);

    if(body.action === "signup"){
      await supabase.from("users").insert({ username: body.u, password: body.p });
      return { statusCode:200, body:JSON.stringify({ok:true}) };
    }

    if(body.action === "login"){
      const { data } = await supabase.from("users").select("*").eq("username",body.u).eq("password",body.p).single();
      if(data) return { statusCode:200, body:JSON.stringify({ok:true,user:data}) };
      return { statusCode:200, body:JSON.stringify({ok:false}) };
    }

    if(body.action === "appeal"){
      await supabase.from("appeals").insert({ text: body.text });
      return { statusCode:200, body:JSON.stringify({ok:true}) };
    }
  }

  return { statusCode:400, body:"Invalid request" };
};
