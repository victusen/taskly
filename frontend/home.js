const drawer = document.getElementById("drawer");
const scrim = document.getElementById("scrim");
const openBtn = document.getElementById("menu-open");
const closeBtn = document.getElementById("menu-close");

function setMenu(open) {
  drawer.classList.toggle("open", open);
  scrim.classList.toggle("open", open);
  drawer.setAttribute("aria-hidden", String(!open));
  openBtn.setAttribute("aria-expanded", String(open));
  document.body.style.overflow = open ? "hidden" : "";
}

openBtn.addEventListener("click", () => setMenu(true));
closeBtn.addEventListener("click", () => setMenu(false));
scrim.addEventListener("click", () => setMenu(false));
drawer.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => setMenu(false)));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setMenu(false);
});