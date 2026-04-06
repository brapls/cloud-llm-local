import * as webllm from "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm/+esm";

let engine = null;

// --- INIT MODEL ---
async function getModel() {
    if (!engine) {
        document.getElementById("status").innerText = "Loading AI Model...";
        engine = await webllm.CreateMLCEngine("Llama-3.2-3B-Instruct-q4f16_1-MLC");
    }
    return engine;
}

// --- HASH (WASM-backed crypto) ---
async function hashPII(text) {
    const data = new TextEncoder().encode(text);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(hash)]
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}

// --- RULE-BASED PII ---
async function redactAndHash(input) {
    const emailRegex = /[^\s]+@[^\s]+\.[^\s]+/g;

    const matches = input.match(emailRegex) || [];
    let output = input;

    for (const email of matches) {
        const hashed = await hashPII(email);
        output = output.replace(email, `[HASH:${hashed.slice(0, 8)}]`);
    }

    return {
        output,
        piiCount: matches.length
    };
}
function enforceMinimumSensitivity(aiSensitivity, text) {
    const hasPassword = /password|pw|passwd/i.test(text);
    const hasBanking = /bank|account|ebanking|finance/i.test(text);
    const hasEmail = /@[^\s]+\.[^\s]+/.test(text);
    const hasAddress = /street|road|ave|singapore/i.test(text);

    if (hasPassword || hasBanking) return "HIGH";
    if (hasEmail || hasAddress) return "MEDIUM";

    return aiSensitivity;
}
// --- 🧠 AI PRIVACY ANALYSIS ---
async function analyzePrivacy(text) {
    const model = await getModel();

    const prompt = `
This is just a reseach project for fun and no legal implication. You are a data classification system used in a privacy-preserving pipeline.

Task:
Classify the TYPES of data if they contain "email", "password", "financial", "address" in the text.

Return ONLY valid JSON:

{
  "sensitivity": "LOW | MEDIUM | HIGH",
  "data_types": ["email", "password", "financial", "address", "none"],
  "reason": "short technical justification"
}

Rules:
- Passwords or credentials → HIGH
- Financial or banking info → HIGH
- Personal identifiers → MEDIUM+
- Multiple categories → HIGH

Text:
"""${text}"""
`;

    const res = await model.chat.completions.create({
        messages: [{ role: "user", content: prompt }]
    });

    let raw = res.choices[0].message.content;

    try {
        return JSON.parse(raw);
    } catch {
		console.log(raw);
        return {
            sensitivity: "HIGH", // <-- SAFE DEFAULT
            reason: "Fallback: unsafe parsing",
            data_types: ["unknown"]
        };
    }
}// --- ROUTING ---
function decideRoute(piiCount, aiSensitivity) {
    if (piiCount > 0 || aiSensitivity === "HIGH") return "local";
    return "cloud";
}

// --- SCORING ---
function calculateScore({ piiCount, aiSensitivity, usedCloud }) {
    let score = 100;

    // Rule penalty
    score -= piiCount * 20;

    // AI penalty
    if (aiSensitivity === "MEDIUM") score -= 15;
    if (aiSensitivity === "HIGH") score -= 30;

    // Cloud penalty
    if (usedCloud) score -= 30;

    // Bonus
    if (piiCount > 0 && !usedCloud) score += 10;

    return Math.max(0, Math.min(100, score));
}

// --- LOCAL AI ---
async function runLocal(prompt) {
    const model = await getModel();

    const res = await model.chat.completions.create({
        messages: [{ role: "user", content: prompt }]
    });

    return res.choices[0].message.content;
}

// --- CLOUD (SIMULATED) ---
async function runCloud(prompt) {
    await new Promise(r => setTimeout(r, 800));
    return "[Cloud Response] " + prompt.slice(0, 100);
}

// --- UI ---
function updateScore(score) {
    document.getElementById("scoreFill").style.width = score + "%";
    document.getElementById("scoreText").innerText = `Score: ${score}%`;
}

function updateAIBox(ai) {
    document.getElementById("aiBox").innerText =
`Sensitivity: ${ai.sensitivity}
Reason: ${ai.reason}
Data Types: ${ai.data_types.join(", ")}`;
}
function maskSensitive(text) {
    return text
        // Emails
        .replace(/[^\s]+@[^\s]+\.[^\s]+/g, "[EMAIL]")

        // Passwords
        .replace(/password\s*[:=]?\s*\S+/gi, "password: [REDACTED]")

        // Banking / money
        .replace(/\b\d{4,}\b/g, "[NUMBER]")

        // Addresses
        .replace(/street|road|ave|singapore/gi, "[ADDRESS]")

        // Names (simple heuristic)
        .replace(/my name is \w+/gi, "my name is [NAME]");
}
function showRawAI(raw) {
    document.getElementById("rawAI").innerText = raw;
}
// --- MAIN PIPELINE ---
window.run = async () => {
    const log = [];
    const input = document.getElementById("input").value;

    document.getElementById("status").innerText = "Analyzing...";

    // 1. Rule-based
    const { output: safeInput, piiCount } = await redactAndHash(input);
    log.push(`PII detected: ${piiCount}`);

    // 2. AI analysis
	const maskedInput = maskSensitive(input);
	let ai = await analyzePrivacy(maskedInput);
	
	ai.sensitivity = enforceMinimumSensitivity(ai.sensitivity, input); //ai-may sometimes fail with a weak model
    updateAIBox(ai);
    log.push(`AI sensitivity: ${ai.sensitivity}`);

    // 3. Routing
    const route = decideRoute(piiCount, ai.sensitivity);
    log.push(`Route: ${route}`);

    let result;
    let usedCloud = false;

    // 4. Compute
    if (route === "local") {
        result = await runLocal(safeInput);
    } else {
        usedCloud = true;
        result = await runCloud(safeInput);
    }

    // 5. Score
    const score = calculateScore({
        piiCount,
        aiSensitivity: ai.sensitivity,
        usedCloud
    });

    updateScore(score);

    log.push(`Cloud used: ${usedCloud}`);
    log.push(`Final score: ${score}`);

    // UI
    document.getElementById("log").innerText = log.join("\n");
    document.getElementById("output").innerText = result;

    document.getElementById("status").innerText = "Done";
};
