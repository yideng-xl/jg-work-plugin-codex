const shots = document.querySelectorAll(".manual-shot img");

const lightbox = document.createElement("div");
lightbox.className = "lightbox";
lightbox.setAttribute("aria-hidden", "true");
lightbox.innerHTML = `
  <button class="lightbox-close" type="button" aria-label="关闭图片预览">×</button>
  <img alt="">
  <p></p>
`;
document.body.append(lightbox);

const preview = lightbox.querySelector("img");
const caption = lightbox.querySelector("p");
const closeButton = lightbox.querySelector("button");
let opener = null;

function closeLightbox() {
  lightbox.classList.remove("open");
  lightbox.setAttribute("aria-hidden", "true");
  document.body.classList.remove("lightbox-open");
  opener?.focus();
}

function openLightbox(image) {
  opener = image;
  preview.src = image.src;
  preview.alt = image.alt;
  caption.textContent = image.closest("figure")?.querySelector("figcaption")?.textContent ?? image.alt;
  lightbox.classList.add("open");
  lightbox.setAttribute("aria-hidden", "false");
  document.body.classList.add("lightbox-open");
  closeButton.focus();
}

shots.forEach((image) => {
  image.tabIndex = 0;
  image.setAttribute("role", "button");
  image.setAttribute("aria-label", `${image.alt}，点击放大`);
  image.addEventListener("click", () => openLightbox(image));
  image.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openLightbox(image);
    }
  });
});

closeButton.addEventListener("click", closeLightbox);
lightbox.addEventListener("click", (event) => {
  if (event.target === lightbox) closeLightbox();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && lightbox.classList.contains("open")) closeLightbox();
});
