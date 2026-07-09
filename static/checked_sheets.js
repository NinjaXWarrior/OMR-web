const $ = (id) => document.getElementById(id);

const root = document.querySelector(".checkedPage");
const jobId = root?.dataset.jobId || "";

const ui = {
  title: $("checkedTitle"),
  position: $("checkedPosition"),
  status: $("checkedStatus"),
  score: $("checkedScore"),
  empty: $("checkedEmpty"),
  image: $("checkedImage"),
  btnPrev: $("btnPrevChecked"),
  btnNext: $("btnNextChecked"),
};

let items = [];
let currentIndex = -1;
let imageUrl = null;

function clearImageUrl() {
  if (imageUrl) {
    URL.revokeObjectURL(imageUrl);
    imageUrl = null;
  }
}

function setEmpty(message) {
  clearImageUrl();
  ui.image.removeAttribute("src");
  ui.image.style.display = "none";
  ui.empty.textContent = message;
  ui.empty.style.display = "block";
  ui.title.textContent = "Checked sheets";
  ui.position.textContent = "-";
  ui.status.textContent = "-";
  ui.score.textContent = "-";
  ui.btnPrev.disabled = true;
  ui.btnNext.disabled = true;
}

function updateNav() {
  ui.btnPrev.disabled = currentIndex <= 0;
  ui.btnNext.disabled = currentIndex < 0 || currentIndex >= items.length - 1;
}

async function loadImage(index) {
  if (!jobId || index < 0 || index >= items.length) return;

  const res = await fetch(`/preview/${jobId}/${index}`, { cache: "no-store" });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Failed to load checked sheet: ${res.status} ${txt}`);
  }

  const blob = await res.blob();
  if (!blob.size) {
    throw new Error("Failed to load checked sheet: empty image");
  }

  clearImageUrl();
  imageUrl = URL.createObjectURL(blob);

  currentIndex = index;
  const item = items[index];
  ui.image.src = imageUrl;
  ui.image.style.display = "block";
  ui.empty.style.display = "none";
  ui.title.textContent = item.name || `Checked sheet ${index + 1}`;
  ui.position.textContent = `${index + 1} / ${items.length}`;
  ui.status.textContent = item.status || "-";
  ui.score.textContent = item.score ?? "-";
  updateNav();
}

async function loadCheckedSheets() {
  if (!jobId) {
    setEmpty("Missing job id.");
    return;
  }

  try {
    const res = await fetch(`/previews/${jobId}`, { cache: "no-store" });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Failed to load checked sheets: ${res.status} ${txt}`);
    }

    const data = await res.json();
    items = Array.isArray(data.items) ? data.items : [];

    if (!items.length) {
      setEmpty("No checked sheets available.");
      return;
    }

    await loadImage(0);
  } catch (e) {
    setEmpty(e?.message || "Failed to load checked sheets.");
  }
}

ui.btnPrev.addEventListener("click", async () => {
  if (currentIndex <= 0) return;
  try {
    await loadImage(currentIndex - 1);
  } catch (e) {
    setEmpty(e?.message || "Failed to load checked sheet.");
  }
});

ui.btnNext.addEventListener("click", async () => {
  if (currentIndex >= items.length - 1) return;
  try {
    await loadImage(currentIndex + 1);
  } catch (e) {
    setEmpty(e?.message || "Failed to load checked sheet.");
  }
});

window.addEventListener("beforeunload", clearImageUrl);

setEmpty("Loading checked sheets...");
loadCheckedSheets();
