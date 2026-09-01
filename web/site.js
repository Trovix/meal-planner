(() => {
  const content = document.querySelector(".fade");
  if (!content) return;

  function showContent() {
    content.classList.remove("is-leaving");
    content.classList.add("is-visible");
  }

  requestAnimationFrame(showContent);
  window.addEventListener("pageshow", showContent);

  document.querySelectorAll("a[href]").forEach((link) => {
    const url = new URL(link.href, location.href);

    if (url.origin !== location.origin) return;
    if (link.target === "_blank" || link.hasAttribute("download")) return;

    link.addEventListener("click", (event) => {
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        event.button !== 0
      ) {
        return;
      }

      event.preventDefault();
      content.classList.remove("is-visible");
      content.classList.add("is-leaving");

      setTimeout(() => {
        location.href = link.href;
      }, 160);
    });
  });
})();
