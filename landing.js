(() => {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  requestAnimationFrame(() => document.body.classList.add("is-ready"));

  const parallax = document.querySelector("[data-parallax]");
  if (parallax && !reduceMotion && window.matchMedia("(pointer: fine)").matches) {
    window.addEventListener("pointermove", (event) => {
      const x = ((event.clientX / window.innerWidth) - 0.5) * 14;
      const y = ((event.clientY / window.innerHeight) - 0.5) * 14;
      parallax.style.setProperty("--mx", `${x}px`);
      parallax.style.setProperty("--my", `${y}px`);
    }, { passive: true });
  }
})();