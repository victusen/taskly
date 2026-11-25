const links = [...document.querySelectorAll(".legal-toc-link")];
const sections = links
  .map((link) => document.querySelector(link.getAttribute("href")))
  .filter(Boolean);

function updateActiveSection() {
  let activeSection = sections[0];
  const activationPoint = 120;

  if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 8) {
    activeSection = sections[sections.length - 1];
  }

  for (const section of sections) {
    if (section.getBoundingClientRect().top <= activationPoint) {
      activeSection = section;
    } else {
      break;
    }
  }

  if (!activeSection) return;

  for (const link of links) {
    const isActive = link.hash === `#${activeSection.id}`;
    link.classList.toggle("active", isActive);
    if (isActive) {
      link.setAttribute("aria-current", "location");
    } else {
      link.removeAttribute("aria-current");
    }
  }
}

if (sections.length) {
  window.addEventListener("scroll", updateActiveSection, { passive: true });
  window.addEventListener("hashchange", updateActiveSection);
  updateActiveSection();
}
