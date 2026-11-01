import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { initializeFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { firebaseConfig, ADMIN_UID } from "./firebase-config.js";
import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from "./cloudinary-config.js";

const $ = (selector) => document.querySelector(selector);
const loginView = $("#loginView"), dashboard = $("#dashboard"), loginForm = $("#loginForm");
const productForm = $("#productForm"), productsTable = $("#adminProducts"), statusMessage = $("#statusMessage");
const submitButton = $("#submitProduct"), imageInput = $("#productImage"), imagePreview = $("#imagePreview");
const ADMIN_PHONE = "01030029050", ADMIN_EMAIL = "ahmed01095958496@gmail.com";
let auth, db, editingId = null, editingImageUrl = "", editingImagePublicId = "", stopProductsListener = null;

const categoryNames = { fish: "أسماك الزينة", supplies: "مستلزمات الأحواض", food: "الأعلاف", pets: "مستلزمات الكلاب والقطط وطيور الزينة" };
function showMessage(message, type = "info") { statusMessage.textContent = message; statusMessage.className = `status-message ${type}`; statusMessage.hidden = false; }
function escapeHTML(value) { return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c]); }
function resetProductForm() {
  productForm.reset(); editingId = null; editingImageUrl = ""; editingImagePublicId = "";
  submitButton.textContent = "إضافة المنتج"; $("#cancelEdit").hidden = true;
  imagePreview.src = ""; imagePreview.hidden = true;
  $("#imageHint").textContent = "اختياري — JPG أو PNG أو WEBP، بحد أقصى 1 ميجابايت.";
}
function renderProducts(snapshot) {
  const products = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  products.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ar"));
  $("#adminCount").textContent = `${products.length} منتج`;
  if (!products.length) { productsTable.innerHTML = '<tr><td colspan="5" class="empty-cell">لسه مفيش منتجات. أضف أول منتج من النموذج.</td></tr>'; return; }
  productsTable.innerHTML = products.map((p) => `<tr>
    <td>${p.imageUrl ? `<img class="admin-product-thumb" src="${escapeHTML(p.imageUrl)}" alt="" loading="lazy">` : '<span class="no-thumb">بدون صورة</span>'}</td>
    <td>${escapeHTML(p.name || "بدون اسم")}</td><td>${escapeHTML(categoryNames[p.category] || "غير محدد")}</td>
    <td>${escapeHTML(p.price ?? "-")} جنيه</td><td class="actions-cell">
      <button class="small-btn edit-btn" data-action="edit" data-id="${escapeHTML(p.id)}">تعديل</button>
      <button class="small-btn delete-btn" data-action="delete" data-id="${escapeHTML(p.id)}">حذف</button></td></tr>`).join("");
  productsTable.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
    const p = products.find((item) => item.id === button.dataset.id); if (!p) return;
    if (button.dataset.action === "edit") {
      editingId = p.id; editingImageUrl = p.imageUrl || ""; editingImagePublicId = p.imagePublicId || "";
      $("#productName").value = p.name || ""; $("#productPrice").value = p.price ?? ""; $("#productCategory").value = p.category || "fish";
      imageInput.value = ""; imagePreview.src = editingImageUrl; imagePreview.hidden = !editingImageUrl;
      $("#imageHint").textContent = editingImageUrl ? "الصورة الحالية محفوظة. اختر صورة جديدة لاستبدالها." : "اختياري — JPG أو PNG أو WEBP، بحد أقصى 1 ميجابايت.";
      submitButton.textContent = "حفظ التعديلات"; $("#cancelEdit").hidden = false; $("#productName").focus(); window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (window.confirm(`هل أنت متأكد من حذف المنتج: ${p.name}؟`)) deleteProduct(p.id);
  }));
}
async function deleteProduct(id) {
  try { await deleteDoc(doc(db, "products", id)); showMessage("تم حذف المنتج.", "success"); if (editingId === id) resetProductForm(); }
  catch (error) { console.error(error); showMessage("حصلت مشكلة أثناء الحذف. راجع اتصال Firebase وقواعد الحماية.", "error"); }
}
async function compressImage(file) {
  if (!file.type.startsWith("image/")) throw new Error("اختار ملف صورة صحيح.");
  if (file.size > 5 * 1024 * 1024) throw new Error("حجم الصورة كبير. اختار صورة أقل من 5 ميجابايت.");
  const image = await createImageBitmap(file);
  const maxSide = 1200, scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas"); canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
  canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height); image.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.78));
  if (!blob) throw new Error("تعذر تجهيز الصورة. جرّب صورة أخرى.");
  if (blob.size > 1024 * 1024) throw new Error("الصورة بعد الضغط أكبر من 1 ميجابايت. اختار صورة أصغر.");
  return new File([blob], `product-${Date.now()}.webp`, { type: "image/webp" });
}
async function uploadProductImage(file) {
  const compressed = await compressImage(file);
  const body = new FormData(); body.append("file", compressed); body.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, { method: "POST", body });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || "فشل رفع الصورة إلى Cloudinary.");
  return { imageUrl: result.secure_url, imagePublicId: result.public_id };
}
imageInput.addEventListener("change", () => {
  const file = imageInput.files?.[0]; if (!file) return;
  if (!file.type.startsWith("image/")) { showMessage("اختار ملف صورة فقط.", "error"); imageInput.value = ""; return; }
  if (imagePreview.dataset.blob) URL.revokeObjectURL(imagePreview.dataset.blob);
  const previewUrl = URL.createObjectURL(file); imagePreview.dataset.blob = previewUrl; imagePreview.src = previewUrl; imagePreview.hidden = false;
  $("#imageHint").textContent = `${file.name} — ${(file.size / 1024).toFixed(0)} KB قبل الضغط.`;
});
function startDashboard() {
  loginView.hidden = true; dashboard.hidden = false; $("#adminEmail").textContent = ADMIN_PHONE;
  if (stopProductsListener) stopProductsListener();
  stopProductsListener = onSnapshot(collection(db, "products"), renderProducts, (error) => { console.error(error); showMessage("مش قادرين نحمّل المنتجات. راجع إعدادات Firestore وقواعد الحماية.", "error"); });
}
loginForm.addEventListener("submit", async (event) => {
  event.preventDefault(); const phone = $("#loginPhone").value.replace(/\s+/g, "").trim(), password = $("#loginPassword").value;
  if (phone !== ADMIN_PHONE) { showMessage("رقم الموبايل غير مسجل كحساب أدمن.", "error"); return; }
  const button = loginForm.querySelector("button[type='submit']"); button.disabled = true; button.textContent = "جاري تسجيل الدخول...";
  try { const credential = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, password); if (credential.user.uid !== ADMIN_UID || ADMIN_UID === "PUT_ADMIN_UID_HERE") { await signOut(auth); showMessage("الحساب ده مش متسجل كأدمن للموقع.", "error"); } }
  catch (error) { console.error(error); showMessage("كلمة المرور غير صحيحة أو خدمة تسجيل الدخول غير مفعّلة.", "error"); }
  finally { button.disabled = false; button.textContent = "تسجيل الدخول"; }
});
productForm.addEventListener("submit", async (event) => {
  event.preventDefault(); const name = $("#productName").value.trim(), price = Number($("#productPrice").value), category = $("#productCategory").value;
  if (!name || !Number.isFinite(price) || price < 0) { showMessage("اكتب اسم المنتج وسعر صحيح.", "error"); return; }
  submitButton.disabled = true;
  try {
    let imageData = { imageUrl: editingImageUrl, imagePublicId: editingImagePublicId };
    const selectedFile = imageInput.files?.[0];
    if (selectedFile) { showMessage("جاري تجهيز ورفع الصورة...", "info"); imageData = await uploadProductImage(selectedFile); }
    const productData = { name, price, category, ...imageData, updatedAt: serverTimestamp() };
    if (editingId) { await updateDoc(doc(db, "products", editingId), productData); showMessage("تم تعديل المنتج بنجاح.", "success"); }
    else { await addDoc(collection(db, "products"), { ...productData, createdAt: serverTimestamp() }); showMessage("تمت إضافة المنتج بنجاح.", "success"); }
    resetProductForm();
  } catch (error) { console.error(error); showMessage(error.message || "لم يتم حفظ المنتج. تأكد من إعدادات Cloudinary وFirebase.", "error"); }
  finally { submitButton.disabled = false; }
});
$("#cancelEdit").addEventListener("click", resetProductForm);
$("#logoutButton").addEventListener("click", async () => { if (stopProductsListener) stopProductsListener(); await signOut(auth); resetProductForm(); });
try {
  const ready = firebaseConfig.apiKey !== "YOUR_API_KEY" && firebaseConfig.projectId !== "YOUR_PROJECT_ID" && firebaseConfig.appId !== "YOUR_APP_ID";
  if (!ready) { showMessage("قبل الاستخدام، حط بيانات مشروع Firebase في الملف js/firebase-config.js.", "error"); loginForm.querySelector("button[type='submit']").disabled = true; }
  else { const app = initializeApp(firebaseConfig); auth = getAuth(app); db = initializeFirestore(app, { experimentalForceLongPolling: true }); onAuthStateChanged(auth, (user) => { if (user && user.uid === ADMIN_UID && ADMIN_UID !== "PUT_ADMIN_UID_HERE") startDashboard(); else { dashboard.hidden = true; loginView.hidden = false; if (user) signOut(auth); } }); }
} catch (error) { console.error(error); showMessage("حصل خطأ في إعداد Firebase. راجع بيانات المشروع.", "error"); }
