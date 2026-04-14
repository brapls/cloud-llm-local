//import * as webllm from "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm/+esm";
import * as webllm from "./web-llm.js";
let engine = null;
let loading = false;

async function init() {
  if (engine || loading) return;
  //document.getElementById("runBtn").disabled = true;
  loading = true;
  console.log("Initializing WebLLM...");
  //Llama-3.2-3B-Instruct-q4f16_1-MLC, too slow
  engine = await webllm.CreateMLCEngine(
    "TinyLlama-1.1B-Chat-v0.4-q4f16_1-MLC-1k",
    {
      initProgressCallback: (p) => console.log(p)
    }
  );

  console.log("Model ready");
  loading = false;
  //document.getElementById("runBtn").disabled = false;
}

async function runPrompt(text) {
  await init();

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
      resourceTypes: ["xmlhttprequest"]
    }
  };

  // Remove the old rule and add the new one
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [1001],
    addRules: [newRule]
  });

  console.log("CORS bypass rule updated for:", filter);
} //allows chrome extension to bypass CORS for specified URL, enabling API calls to local servers without CORS issues, many localhost ai servers have CORS disabled, so this is necessary for the extension to function properly
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "PROMPT") {
    //updateCorsBypass(msg.url);
    console.log("Received prompt in background:");
    console.log(msg);
    runPrompt(msg.text)
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