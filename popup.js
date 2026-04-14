// -------- Tabs --------
document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));

    tab.classList.add("active");
    document.getElementById(tab.dataset.tab).classList.add("active");
  });
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

  let prompt = "";

  if (active === "local") {
    let text = document.getElementById("localPrompt").value;
    let model = document.getElementById("modelSelect").value;
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
    const url = document.getElementById("urlField").value;
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

      document.getElementById("output").textContent =
        typeof output === "string"
          ? output
          : JSON.stringify(output, null, 2);
      
      document.getElementById("runBtn").disabled = false;
    });
  }
});
