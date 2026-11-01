import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { initializeFirestore, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const categoryNames = {
  fish: "أسماك الزينة",
  supplies: "مستلزمات الأحواض",
  food: "الأعلاف",
  pets: "مستلزمات الكلاب والقطط وطيور الزينة"
};

const productsList = document.getElementById("productsList");
const searchInput = document.getElementById("searchInput");
const filters = document.getElementById("categoryFilters");
const productsCount = document.getElementById("productsCount");
const emptyMessage = document.getElementById("emptyMessage");
let products = [];
let selectedCategory = "all";

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[char]);
}

function thumbUrl(url) {
  return String(url).replace("/image/upload/", "/image/upload/f_auto,q_auto,w_300,h_300,c_fill/");
}

// لو الصورة مش بتتحمل نعرض أيقونة بدلها بدل صورة مكسورة
productsList.addEventListener("error", (event) => {
  const img = event.target;
  if (!img.classList || !img.classList.contains("product-image")) return;
  const placeholder = document.createElement("div");
  placeholder.className = "product-image-placeholder";
  placeholder.setAttribute("aria-hidden", "true");
  placeholder.textContent = "🐠";
  img.replaceWith(placeholder);
}, true);

function renderProducts() {
  const searchText = searchInput.value.trim().toLocaleLowerCase("ar");
  const filteredProducts = products.filter((product) => {
    const matchesCategory = selectedCategory === "all" || product.category === selectedCategory;
    const matchesSearch = String(product.name || "").toLocaleLowerCase("ar").includes(searchText);
    return matchesCategory && matchesSearch;
  });

  productsList.innerHTML = filteredProducts.map((product) => `
    <article class="product-row">
      ${product.imageUrl ? `<img class="product-image" src="${escapeHTML(thumbUrl(product.imageUrl))}" alt="${escapeHTML(product.name || "صورة المنتج")}" loading="lazy" decoding="async">` : '<div class="product-image-placeholder" aria-hidden="true">🐠</div>'}
      <div class="product-info">
        <h3 class="product-name">${escapeHTML(product.name || "")}</h3>
        <span class="product-category">${escapeHTML(categoryNames[product.category] || "")}</span>
      </div>
      <div class="product-price">${escapeHTML(product.price)} جنيه</div>
    </article>
  `).join("");
  productsCount.textContent = `${filteredProducts.length} منتج`;
  emptyMessage.hidden = filteredProducts.length !== 0;
}

searchInput.addEventListener("input", renderProducts);
filters.addEventListener("click", (event) => {
  const button = event.target.closest(".filter-btn");
  if (!button) return;
  selectedCategory = button.dataset.category;
  filters.querySelectorAll(".filter-btn").forEach((item) => item.classList.toggle("active", item === button));
  renderProducts();
});

const configReady = firebaseConfig.apiKey !== "YOUR_API_KEY" &&
  firebaseConfig.projectId !== "YOUR_PROJECT_ID" && firebaseConfig.appId !== "YOUR_APP_ID";

if (!configReady) {
  productsList.innerHTML = '<p class="empty-message">قائمة الأسعار هتظهر هنا بعد ربط الموقع بقاعدة بيانات Firebase.</p>';
  productsCount.textContent = "";
} else {
  const app = initializeApp(firebaseConfig);
  const db = initializeFirestore(app, { experimentalForceLongPolling: true });
  onSnapshot(collection(db, "products"), (snapshot) => {
    products = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    products.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ar"));
    renderProducts();
  }, (error) => {
    console.error(error);
    productsList.innerHTML = '<p class="empty-message">حصلت مشكلة في تحميل الأسعار. حاول مرة تانية.</p>';
  });
}
