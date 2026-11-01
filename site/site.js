"use strict";

const copyButton = document.getElementById("copy-build");
const buildCommands = document.getElementById("build-commands");
const copyStatus = document.getElementById("copy-status");

if (copyButton && buildCommands && copyStatus && window.isSecureContext && navigator.clipboard) {
  copyButton.hidden = false;
  copyButton.addEventListener("click", async () => {
    copyButton.disabled = true;
    copyStatus.textContent = "";
    try {
      await navigator.clipboard.writeText(buildCommands.textContent.trim());
      copyStatus.textContent = "Build commands copied.";
    } catch {
      copyStatus.textContent = "Could not copy. Select the commands above to copy them manually.";
    } finally {
      copyButton.disabled = false;
    }
  });
}
