const output = document.getElementById("output");

document.getElementById("runBtn").addEventListener("click", () => {
  const text = document.getElementById("input").value;
  console.log("Sending prompt:", text);
  output.textContent = "Running...";

  chrome.runtime.sendMessage({ type: "PROMPT", text }, (res) => {
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
  });
});