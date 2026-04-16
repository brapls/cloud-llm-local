//import * as webllm from "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm/+esm";
import * as webllm from "./web-llm.js";
let engine = null;
let loading = false;

let currentModel = null;

async function init(model) {
  if (loading) return;
  if (engine && currentModel === model) return;

  loading = true;
  engine = await webllm.CreateMLCEngine(model);
  currentModel = model;
  loading = false;
}

async function runPrompt(text, model) {
  await init(model);

  const res = await engine.chat.completions.create({
    messages: [
      { role: "user", content: text }
    ]
  });

  return res.choices[0].message.content;
}
async function updateCorsBypass(userUrl) {
  // Ensure the URL is formatted correctly (e.g., http://localhost:9000)
  const url = new URL(userUrl);
  const filter = `${url.origin}/*`;

  const newRule = {
    id: 1001, // Use a unique integer ID
    priority: 1,
    action: {
      type: "modifyHeaders",
      requestHeaders: [
        { header: "origin", operation: "remove" }
      ],
      responseHeaders: [
        { header: "Access-Control-Allow-Origin", operation: "set", "value": "*" },
        { header: "Access-Control-Allow-Methods", operation: "set", "value": "GET, POST, OPTIONS" },
        { header: "Access-Control-Allow-Headers", operation: "set", "value": "*" }
      ]
    },
    condition: {
      urlFilter: filter,
      resourceTypes: ["xmlhttprequest", "fetch"]
    }
  };

  // Remove the old rule and add the new one
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [1001],
    addRules: [newRule]
  });

} //allows chrome extension to bypass CORS for specified URL, enabling API calls to local servers without CORS issues, many localhost ai servers have CORS disabled, so this is necessary for the extension to function properly

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "PROMPT") {
    updateCorsBypass(msg.url);
    runPrompt(msg.text, msg.model)
      .then((result) => sendResponse({ result }))
      .catch((err) => sendResponse({ error: err.message }));

    return true;
  }
  else if (msg.type === "UPDATE_CORS") {
    updateCorsBypass(msg.url)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  } 
});
