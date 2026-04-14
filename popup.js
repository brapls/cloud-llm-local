const output = document.getElementById("output");

document.getElementById("runBtn").addEventListener("click", () => {
  const activeTab = document.querySelector(".tab.active").dataset.tab;
  document.getElementById("runBtn").disabled = true;
  let text = document.getElementById("prompt").value;
  let additionalInfo = "";
  switch (activeTab) {
    case "local":
      additionalInfo = document.getElementById("modelField").value;
      break;
    case "url":
      additionalInfo = document.getElementById("urlField").value;
      break;
    case "dynamic":
      additionalInfo = {
        url: document.getElementById("dynamic_urlField").value,
        model: document.getElementById("dynamic_modelField").value,
      }
      break;
  }
  console.log("Sending prompt:", text);
  output.textContent = "Running...";

  chrome.runtime.sendMessage({ type: "PROMPT", text: text, tab: activeTab, additionalInfo: additionalInfo}, (res) => {
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
});
document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    // Remove active from all
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));

    // Activate selected
    tab.classList.add("active");
    document.getElementById(tab.dataset.tab).classList.add("active");
  });
});