"use strict";

const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
document.documentElement.classList.add("motion-enabled");

function animateElement(element, keyframes, options) {
  if (!element || motionPreference.matches || !element.animate) return;
  element.getAnimations().forEach((animation) => animation.cancel());
  const animation = element.animate(keyframes, options);
  animation.finished.catch(() => {});
}

motionPreference.addEventListener("change", () => {
  if (motionPreference.matches) {
    document.getAnimations().forEach((animation) => animation.cancel());
  }
});

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
      copyButton.dataset.copied = "true";
      animateElement(copyButton, [{ transform: "scale(.96)" }, { transform: "scale(1)" }], { duration: 240, easing: "cubic-bezier(.2,.8,.2,1)" });
    } catch {
      delete copyButton.dataset.copied;
      copyStatus.textContent = "Could not copy. Select the commands above to copy them manually.";
    } finally {
      copyButton.disabled = false;
    }
  });
}

const preview = document.querySelector(".browser-preview");
const spaceChoices = document.querySelectorAll("[data-space-choice]");
const splitButton = document.querySelector(".split-toggle");
const splitControls = document.querySelectorAll(".split-toggle, [data-split-toggle]");
const splitPage = document.querySelector(".split-page");
const homePage = document.querySelector(".home-page");
const spaceCopy = {
  personal: { name: "Personal", tab: "A place to begin", third: "Weekend somewhere", greeting: "Make room<br>for a little wonder.", subtitle: "A new tab. A new possibility." },
  work: { name: "Work", tab: "Room for good ideas", third: "The next big thing", greeting: "Good ideas<br>start with space.", subtitle: "A clear head. A fresh perspective." }
};

spaceChoices.forEach((button) => {
  button.addEventListener("click", () => {
    const space = button.dataset.spaceChoice;
    const copy = spaceCopy[space];
    if (!preview || !copy || preview.dataset.space === space) return;
    preview.dataset.space = space;
    spaceChoices.forEach((choice) => choice.setAttribute("aria-pressed", String(choice.dataset.spaceChoice === space)));
    document.getElementById("preview-space-name").textContent = copy.name;
    document.getElementById("preview-tab-name").textContent = copy.tab;
    document.getElementById("preview-third-tab").textContent = copy.third;
    document.getElementById("preview-greeting").innerHTML = copy.greeting;
    document.getElementById("preview-subtitle").textContent = copy.subtitle;
    animateElement(document.querySelector(".home-copy"), [
      { clipPath: "inset(0 0 100% 0)", opacity: .3 },
      { clipPath: "inset(0 0 0% 0)", opacity: 1 }
    ], { duration: 420, easing: "cubic-bezier(.16,1,.3,1)" });
    animateElement(document.querySelector(".space-icon"), [
      { transform: "rotate(-75deg) scale(.75)" },
      { transform: "rotate(0) scale(1)" }
    ], { duration: 380, easing: "cubic-bezier(.25,1,.5,1)" });
  });
});

if (splitButton && splitPage && preview && homePage) {
  splitControls.forEach((control) => control.addEventListener("click", () => {
    homePage.getAnimations().forEach((animation) => animation.cancel());
    splitPage.getAnimations().forEach((animation) => animation.cancel());
    const previousWidth = homePage.getBoundingClientRect().width;
    const enabled = splitButton.getAttribute("aria-pressed") !== "true";
    splitControls.forEach((button) => button.setAttribute("aria-pressed", String(enabled)));
    preview.dataset.split = String(enabled);
    splitPage.hidden = !enabled;
    const nextWidth = homePage.getBoundingClientRect().width;
    animateElement(homePage, [
      { transform: `scaleX(${previousWidth / nextWidth})` },
      { transform: "scaleX(1)" }
    ], { duration: 460, easing: "cubic-bezier(.22,1,.36,1)" });
    if (enabled) animateElement(splitPage, [
      { clipPath: "inset(0 0 0 100%)", opacity: .4 },
      { clipPath: "inset(0 0 0 0%)", opacity: 1 }
    ], { duration: 420, easing: "cubic-bezier(.22,1,.36,1)" });
  }));
}

if ("IntersectionObserver" in window) {
  const revealTargets = document.querySelectorAll(".browser-preview, .section-intro, .feature-list article, .source-art, .keyboard-section, .terminal, .build-intro");
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("motion-entered");
      observer.unobserve(entry.target);
    });
  }, { threshold: .12 });
  revealTargets.forEach((element) => {
    element.classList.add("motion-ready");
    observer.observe(element);
  });
}

document.querySelectorAll(".faq-section details").forEach((details) => {
  details.addEventListener("toggle", () => {
    if (details.open) animateElement(details.querySelector("p"), [
      { opacity: 0, transform: "translateY(-6px)" },
      { opacity: 1, transform: "translateY(0)" }
    ], { duration: 220, easing: "ease-out" });
  });
});
