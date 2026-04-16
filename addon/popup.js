// -------- Local Storage Implementation --------

// Array of all the input IDs you want to save
const trackedInputs = [
  "localPrompt", "modelSelect", "urlPrompt", "urlField",
  "method", "tokenField", "templateField", "headersField",
  "responsePath", "preset"
];

// Function to save current state
function saveSettings() {
  const dataToSave = {};
  
  // Save all text areas and inputs
  trackedInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) dataToSave[id] = el.value;
  });

  // Save the currently active tab
  const activeTab = document.querySelector(".tab.active")?.dataset.tab;
  if (activeTab) dataToSave.activeTab = activeTab;

  // Write to Chrome storage
  chrome.storage.local.set(dataToSave);
}

// Function to load saved state
function loadSettings() {
  chrome.storage.local.get(null, (savedData) => {
    // Restore text areas and inputs
    trackedInputs.forEach(id => {
      if (savedData[id] !== undefined) {
        const el = document.getElementById(id);
        if (el) el.value = savedData[id];
      }
    });

    // Restore active tab
    if (savedData.activeTab) {
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
      
      const targetTab = document.querySelector(`.tab[data-tab="${savedData.activeTab}"]`);
      const targetSection = document.getElementById(savedData.activeTab);
      
      if (targetTab && targetSection) {
        targetTab.classList.add("active");
        targetSection.classList.add("active");
      }
    }
  });
}

// -------- Attach Event Listeners for Saving --------

// Listen for typing/changing on all tracked inputs
trackedInputs.forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener("input", saveSettings);
    el.addEventListener("change", saveSettings);
  }
});

// Load everything when the popup opens
document.addEventListener("DOMContentLoaded", loadSettings);
// -------- Tabs --------
document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));

    tab.classList.add("active");
    document.getElementById(tab.dataset.tab).classList.add("active");
    saveSettings();
  });
});
document.getElementById("preset").addEventListener("change", e => {
  const p = presets[e.target.value];
  if (!p) return;

  document.getElementById("templateField").value = JSON.stringify(p.template, null, 2);
  document.getElementById("headersField").value = JSON.stringify(p.headers, null, 2);
  document.getElementById("responsePath").value = p.path;
  
  saveSettings(); // <-- Add this line here
});
// -------- Utils --------
function safeJSONParse(str) {
  try { return JSON.parse(str); } catch { return null; }
}

function applyTemplate(template, vars) {
  let str = JSON.stringify(template);
  for (let k in vars) {
    str = str.replaceAll(`{{${k}}}`, vars[k] ?? "");
  }
  return JSON.parse(str);
}

function extractValue(obj, path) {
  try {
    return path
      .replace(/\[(\d+)\]/g, ".$1")
      .split(".")
      .reduce((o, k) => o[k], obj);
  } catch {
    return null;
  }
}

// -------- Dynamic Prompt --------
function buildDynamicPrompt(prompt, difficulty, maxLength) {
  let instruction = "";

  if (difficulty <= 3) {
    instruction = "Explain simply. Short answer.";
  } else if (difficulty <= 7) {
    instruction = "Explain clearly with steps.";
  } else {
    instruction = "Provide deep technical explanation with reasoning.";
  }

  return `${instruction}\n\nLimit to ${maxLength} words.\n\n${prompt}`;
}

// -------- Presets --------
const presets = {
  openai: {
    template: {
      model: "gpt-4",
      messages: [{ role: "user", content: "{{prompt}}" }]
    },
    headers: { Authorization: "Bearer {{token}}" },
    path: "choices[0].message.content"
  },
  ollama: {
    template: {
      model: "llama3",
      prompt: "{{prompt}}",
      stream: false
    },
    headers: {},
    path: "response"
  },
  hf: {
    template: {
      inputs: "{{prompt}}"
    },
    headers: { Authorization: "Bearer {{token}}" },
    path: "[0].generated_text"
  }
};

document.getElementById("preset").addEventListener("change", e => {
  const p = presets[e.target.value];
  if (!p) return;

  document.getElementById("templateField").value =
    JSON.stringify(p.template, null, 2);

  document.getElementById("headersField").value =
    JSON.stringify(p.headers, null, 2);

  document.getElementById("responsePath").value = p.path;
});

// -------- API Call --------
async function callAPI({ url, method, headers, body }) {

  const res = await fetch(url, {
    method,
    headers,
    body: method === "GET" ? null : JSON.stringify(body)
  });

  const text = await res.text();
  try { return JSON.parse(text); }
  catch { return { raw: text }; }
}

// -------- Run Button --------
document.getElementById("runBtn").addEventListener("click", async () => {
  document.getElementById("runBtn").disabled = true;

  const active = document.querySelector(".tab.active").dataset.tab;

  if (active === "local") {
    let text = document.getElementById("localPrompt").value;
    let model = document.getElementById("modelSelect").value;
    let output = document.getElementById("output");
    output.textContent = "Running...";

    chrome.runtime.sendMessage({ type: "PROMPT", text: text, model}, (res) => {
      if (chrome.runtime.lastError) {
        output.textContent = "Error: " + chrome.runtime.lastError.message;
        return;
      }

      if (res.error) {
        console.error("Error from background:", res.error);
        output.textContent = "Error: " + res.error;
      } else {
        console.log("Received result:", res.result);
        output.textContent = res.result;
      }
      document.getElementById("runBtn").disabled = false;
    });

  } else {
    let prompt = document.getElementById("urlPrompt").value;
    let url = document.getElementById("urlField").value;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'http://' + url;
    }
    try {
      console.log("Parsing URL..." +url);
      url = new URL(url);
    } catch {
      document.getElementById("output").textContent = "Error: Invalid URL (must include http/https)";
      document.getElementById("runBtn").disabled = false;
      throw new Error("Invalid URL (must include http/https)");
    }
    chrome.runtime.sendMessage({ type: "UPDATE_CORS", url}, async (res) => {
      const method = document.getElementById("method").value;
      const token = document.getElementById("tokenField").value;

      const template = safeJSONParse(document.getElementById("templateField").value);
      const headersInput = safeJSONParse(document.getElementById("headersField").value) || {};
      const responsePath = document.getElementById("responsePath").value;

      const body = template ? applyTemplate(template, { prompt, token }) : { prompt };

      const headers = {
        "Content-Type": "application/json",
        ...applyTemplate(headersInput, { token })
      };

      const result = await callAPI({ url, method, headers, body });

      let output = result;
      if (responsePath) {
        const extracted = extractValue(result, responsePath);
        if (extracted) output = extracted;
      }

    
      if(typeof output === "string"){
        document.getElementById("output").textContent = output
      } else {
        try {
          document.getElementById("output").textContent = JSON.parse(output);
        } catch (e) {
          console.error("Couldn't parse, maybe not a json:", output);
          document.getElementById("output").textContent = JSON.stringify(output);
        }
      }        
      document.getElementById("runBtn").disabled = false;
    });
  }
});
let models = [
  "Phi-3.5-vision-instruct-q4f32_1-MLC",
  "Phi-3.5-vision-instruct-q4f16_1-MLC",
  "Llama-3.2-1B-Instruct-q4f32_1-MLC",
  "Llama-3.2-1B-Instruct-q4f16_1-MLC",
  "Llama-3.2-1B-Instruct-q0f32-MLC",
  "Llama-3.2-1B-Instruct-q0f16-MLC",
  "Llama-3.2-3B-Instruct-q4f32_1-MLC",
  "Llama-3.2-3B-Instruct-q4f16_1-MLC",
  "Llama-3.1-8B-Instruct-q4f32_1-MLC-1k",
  "Llama-3.1-8B-Instruct-q4f16_1-MLC-1k",
  "Llama-3.1-8B-Instruct-q4f32_1-MLC",
  "Llama-3.1-8B-Instruct-q4f16_1-MLC",
  "DeepSeek-R1-Distill-Qwen-7B-q4f16_1-MLC",
  "DeepSeek-R1-Distill-Qwen-7B-q4f32_1-MLC",
  "DeepSeek-R1-Distill-Llama-8B-q4f32_1-MLC",
  "DeepSeek-R1-Distill-Llama-8B-q4f16_1-MLC",
  "Hermes-3-Llama-3.2-3B-q4f32_1-MLC",
  "Hermes-3-Llama-3.2-3B-q4f16_1-MLC",
  "Hermes-3-Llama-3.1-8B-q4f32_1-MLC",
  "Hermes-3-Llama-3.1-8B-q4f16_1-MLC",
  "Hermes-2-Pro-Mistral-7B-q4f16_1-MLC",
  "Hermes-2-Pro-Llama-3-8B-q4f16_1-MLC",
  "Hermes-2-Pro-Llama-3-8B-q4f32_1-MLC",
  "Phi-3.5-mini-instruct-q4f16_1-MLC",
  "Phi-3.5-mini-instruct-q4f32_1-MLC",
  "Phi-3.5-mini-instruct-q4f16_1-MLC-1k",
  "Phi-3.5-mini-instruct-q4f32_1-MLC-1k",
  "Mistral-7B-Instruct-v0.3-q4f16_1-MLC",
  "Mistral-7B-Instruct-v0.3-q4f32_1-MLC",
  "Mistral-7B-Instruct-v0.2-q4f16_1-MLC",
  "OpenHermes-2.5-Mistral-7B-q4f16_1-MLC",
  "NeuralHermes-2.5-Mistral-7B-q4f16_1-MLC",
  "WizardMath-7B-V1.1-q4f16_1-MLC",
  "SmolLM2-1.7B-Instruct-q4f16_1-MLC",
  "SmolLM2-1.7B-Instruct-q4f32_1-MLC",
  "SmolLM2-360M-Instruct-q0f16-MLC",
  "SmolLM2-360M-Instruct-q0f32-MLC",
  "SmolLM2-360M-Instruct-q4f16_1-MLC",
  "SmolLM2-360M-Instruct-q4f32_1-MLC",
  "SmolLM2-135M-Instruct-q0f16-MLC",
  "SmolLM2-135M-Instruct-q0f32-MLC",
  "Qwen3-0.6B-q4f16_1-MLC",
  "Qwen3-0.6B-q4f32_1-MLC",
  "Qwen3-0.6B-q0f16-MLC",
  "Qwen3-0.6B-q0f32-MLC",
  "Qwen3-1.7B-q4f16_1-MLC",
  "Qwen3-1.7B-q4f32_1-MLC",
  "Qwen3-4B-q4f16_1-MLC",
  "Qwen3-4B-q4f32_1-MLC",
  "Qwen3-8B-q4f16_1-MLC",
  "Qwen3-8B-q4f32_1-MLC",
  "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
  "Qwen2.5-0.5B-Instruct-q4f32_1-MLC",
  "Qwen2.5-0.5B-Instruct-q0f16-MLC",
  "Qwen2.5-0.5B-Instruct-q0f32-MLC",
  "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
  "Qwen2.5-1.5B-Instruct-q4f32_1-MLC",
  "Qwen2.5-3B-Instruct-q4f16_1-MLC",
  "Qwen2.5-3B-Instruct-q4f32_1-MLC",
  "Qwen2.5-7B-Instruct-q4f16_1-MLC",
  "Qwen2.5-7B-Instruct-q4f32_1-MLC",
  "Qwen2.5-Coder-0.5B-Instruct-q4f16_1-MLC",
  "Qwen2.5-Coder-0.5B-Instruct-q4f32_1-MLC",
  "Qwen2.5-Coder-0.5B-Instruct-q0f16-MLC",
  "Qwen2.5-Coder-0.5B-Instruct-q0f32-MLC",
  "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC",
  "Qwen2.5-Coder-1.5B-Instruct-q4f32_1-MLC",
  "Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC",
  "Qwen2.5-Coder-3B-Instruct-q4f32_1-MLC",
  "Qwen2.5-Coder-7B-Instruct-q4f16_1-MLC",
  "Qwen2.5-Coder-7B-Instruct-q4f32_1-MLC",
  "Qwen2-Math-1.5B-Instruct-q4f16_1-MLC",
  "Qwen2-Math-1.5B-Instruct-q4f32_1-MLC",
  "Qwen2-Math-7B-Instruct-q4f16_1-MLC",
  "Qwen2-Math-7B-Instruct-q4f32_1-MLC",
  "gemma-2-2b-it-q4f16_1-MLC",
  "gemma-2-2b-it-q4f32_1-MLC",
  "gemma-2-2b-it-q4f16_1-MLC-1k",
  "gemma-2-2b-it-q4f32_1-MLC-1k",
  "gemma-2-9b-it-q4f16_1-MLC",
  "gemma-2-9b-it-q4f32_1-MLC",
  "gemma-2-2b-jpn-it-q4f16_1-MLC",
  "gemma-2-2b-jpn-it-q4f32_1-MLC",
  "stablelm-2-zephyr-1_6b-q4f16_1-MLC",
  "stablelm-2-zephyr-1_6b-q4f32_1-MLC",
  "stablelm-2-zephyr-1_6b-q4f16_1-MLC-1k",
  "stablelm-2-zephyr-1_6b-q4f32_1-MLC-1k",
  "RedPajama-INCITE-Chat-3B-v1-q4f16_1-MLC",
  "RedPajama-INCITE-Chat-3B-v1-q4f32_1-MLC",
  "RedPajama-INCITE-Chat-3B-v1-q4f16_1-MLC-1k",
  "RedPajama-INCITE-Chat-3B-v1-q4f32_1-MLC-1k",
  "TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC",
  "TinyLlama-1.1B-Chat-v1.0-q4f32_1-MLC",
  "TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC-1k",
  "TinyLlama-1.1B-Chat-v1.0-q4f32_1-MLC-1k",
  "Llama-3.1-70B-Instruct-q3f16_1-MLC",
  "Qwen2-0.5B-Instruct-q4f16_1-MLC",
  "Qwen2-0.5B-Instruct-q0f16-MLC",
  "Qwen2-0.5B-Instruct-q0f32-MLC",
  "Qwen2-1.5B-Instruct-q4f16_1-MLC",
  "Qwen2-1.5B-Instruct-q4f32_1-MLC",
  "Qwen2-7B-Instruct-q4f16_1-MLC",
  "Qwen2-7B-Instruct-q4f32_1-MLC",
  "Llama-3-8B-Instruct-q4f32_1-MLC-1k",
  "Llama-3-8B-Instruct-q4f16_1-MLC-1k",
  "Llama-3-8B-Instruct-q4f32_1-MLC",
  "Llama-3-8B-Instruct-q4f16_1-MLC",
  "Llama-3-70B-Instruct-q3f16_1-MLC",
  "Phi-3-mini-4k-instruct-q4f16_1-MLC",
  "Phi-3-mini-4k-instruct-q4f32_1-MLC",
  "Phi-3-mini-4k-instruct-q4f16_1-MLC-1k",
  "Phi-3-mini-4k-instruct-q4f32_1-MLC-1k",
  "Llama-2-7b-chat-hf-q4f32_1-MLC-1k",
  "Llama-2-7b-chat-hf-q4f16_1-MLC-1k",
  "Llama-2-7b-chat-hf-q4f32_1-MLC",
  "Llama-2-7b-chat-hf-q4f16_1-MLC",
  "Llama-2-13b-chat-hf-q4f16_1-MLC",
  "phi-2-q4f16_1-MLC",
  "phi-2-q4f32_1-MLC",
  "phi-2-q4f16_1-MLC-1k",
  "phi-2-q4f32_1-MLC-1k",
  "phi-1_5-q4f16_1-MLC",
  "phi-1_5-q4f32_1-MLC",
  "phi-1_5-q4f16_1-MLC-1k",
  "phi-1_5-q4f32_1-MLC-1k",
  "TinyLlama-1.1B-Chat-v0.4-q4f16_1-MLC",
  "TinyLlama-1.1B-Chat-v0.4-q4f32_1-MLC",
  "TinyLlama-1.1B-Chat-v0.4-q4f16_1-MLC-1k",
  "TinyLlama-1.1B-Chat-v0.4-q4f32_1-MLC-1k"
];

let modelSelection = document.getElementById("modelSelect");
models.forEach(model => {
  let option = document.createElement("option");
  option.value = model;
  option.textContent = model;
  modelSelection.appendChild(option);
});