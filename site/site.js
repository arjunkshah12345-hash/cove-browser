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

/* Build commands */
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
    } catch {
      delete copyButton.dataset.copied;
      copyStatus.textContent = "Could not copy. Select the commands above to copy them manually.";
    } finally {
      copyButton.disabled = false;
    }
  });
}

/* Tour: tabs swap the real screenshot on the plate */
const tourTabs = [...document.querySelectorAll("[data-tour]")];
const plateShots = document.querySelectorAll(".plate-shot");
function selectTour(tab, focus) {
  tourTabs.forEach((other) => {
    const selected = other === tab;
    other.setAttribute("aria-selected", String(selected));
    other.tabIndex = selected ? 0 : -1;
    document.getElementById(other.getAttribute("aria-controls")).hidden = !selected;
  });
  plateShots.forEach((shot) => shot.classList.toggle("is-current", shot.dataset.shot === tab.dataset.tour));
  if (focus) tab.focus();
  animateElement(document.getElementById(tab.getAttribute("aria-controls")), [
    { opacity: 0, transform: "translateY(12px)" },
    { opacity: 1, transform: "none" }
  ], { duration: 420, easing: "cubic-bezier(.16,1,.3,1)" });
}
tourTabs.forEach((tab, index) => {
  tab.addEventListener("click", () => selectTour(tab, false));
  tab.addEventListener("keydown", (event) => {
    const next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tourTabs.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    selectTour(tourTabs[(next + tourTabs.length) % tourTabs.length], true);
  });
});

/* Index: pointing at a name reads its description in one fixed spot */
const indexSpot = document.querySelector(".index-spot");
const indexDefault = indexSpot?.textContent;
document.querySelectorAll(".index-col li").forEach((item) => {
  item.addEventListener("pointerenter", () => {
    if (!indexSpot) return;
    indexSpot.textContent = item.dataset.desc;
    animateElement(indexSpot, [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 260, easing: "ease-out" });
  });
  item.addEventListener("pointerleave", () => { if (indexSpot) indexSpot.textContent = indexDefault; });
});

/* The workspace preview */
const preview = document.querySelector(".browser-preview");
const spaceChoices = document.querySelectorAll("[data-space-choice]");
const splitButton = document.querySelector(".split-toggle");
const splitControls = document.querySelectorAll(".split-toggle, [data-split-toggle]");
const splitPage = document.querySelector(".split-page");
const homePage = document.querySelector(".home-page");
const spaceCopy = {
  personal: { name: "Personal", tab: "A little space for you", third: "Weekend somewhere", greeting: "A little space<br>for you.", subtitle: "Less noise. More of what brings you here." },
  work: { name: "Work", tab: "Room for good ideas", third: "The next big thing", greeting: "Good ideas<br>start with space.", subtitle: "A clear head. A fresh perspective." }
};
const spaceIcons = { personal: "#i-sun", work: "#i-case" };

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
    document.querySelector(".space-icon use")?.setAttribute("href", spaceIcons[space]);
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
    if (previousWidth > 0 && nextWidth > 0) animateElement(homePage, [
      { transform: `scaleX(${previousWidth / nextWidth})`, transformOrigin: "left" },
      { transform: "scaleX(1)", transformOrigin: "left" }
    ], { duration: 460, easing: "cubic-bezier(.22,1,.36,1)" });
    if (enabled) animateElement(splitPage, [
      { clipPath: "inset(0 0 0 100%)", opacity: .4 },
      { clipPath: "inset(0 0 0 0%)", opacity: 1 }
    ], { duration: 420, easing: "cubic-bezier(.22,1,.36,1)" });
  }));
}

/* Entrances: the parts of each section arrive in turn */
if ("IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-in");
      revealObserver.unobserve(entry.target);
    });
  }, { threshold: 0, rootMargin: "0px 0px -40px 0px" });
  document.querySelectorAll("section").forEach((section) => {
    section.querySelectorAll("[data-reveal]").forEach((element, index) => {
      element.style.setProperty("--reveal-delay", `${Math.min(index, 6) * 80}ms`);
      revealObserver.observe(element);
    });
  });
} else {
  document.querySelectorAll("[data-reveal]").forEach((element) => element.classList.add("is-in"));
}

/* The signature move: three coves crossfade behind the name */
const heroImages = document.querySelectorAll(".hero-media img");
if (heroImages.length > 1) {
  let current = 0;
  let visible = true;
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => { visible = entries.some((entry) => entry.isIntersecting); }).observe(heroImages[0].parentElement);
  }
  window.setInterval(() => {
    if (motionPreference.matches || document.hidden || !visible) return;
    heroImages[current].classList.remove("is-current");
    current = (current + 1) % heroImages.length;
    heroImages[current].classList.add("is-current");
  }, 6000);
  motionPreference.addEventListener("change", () => {
    if (!motionPreference.matches) return;
    heroImages.forEach((image, index) => image.classList.toggle("is-current", index === 0));
    current = 0;
  });
}
