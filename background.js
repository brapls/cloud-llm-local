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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "PROMPT") {
    console.log("Received prompt in background:");
    console.log(msg);
    runPrompt(msg.text)
      .then((result) => sendResponse({ result }))
      .catch((err) => sendResponse({ error: err.message }));

    return true;
  }
});