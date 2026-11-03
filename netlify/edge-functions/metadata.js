import { isBlockedAgent, isMetadataBot, parseAgentList, pathToMetadata, renderMetadata } from "../../lib/metadata.mjs";

export default async (request, context) => {
  try {
    const ua = request.headers.get("user-agent") ?? "";
    const url = new URL(request.url);
    const path = url.pathname;
    const geo = context?.geo?.city + ", " + context?.geo?.subdivision?.code + ", " + context?.geo?.country?.code;

    if (isBlockedAgent(ua, parseAgentList(Deno.env.get("UA_ARRAY")))) {
      return new Response("", { status: 401 });
    }

    if (path != "/") {
      if (isMetadataBot(ua) && path.endsWith("/")) {
        const info = pathToMetadata(path);
        console.log(["Metadata Request", JSON.stringify(info), geo, ua].join("\t"));
        return new Response(renderMetadata(info, url.origin), {
          headers: { "content-type": "text/html" },
        });
      }
    } else {
      console.log(["Request", path, geo, request.headers.get("referer"), ua].join("\t"));
    }
  } catch (e) {
    console.log("Error:", request.url, e);
  }
};
